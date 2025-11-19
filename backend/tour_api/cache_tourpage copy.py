# bp_tourpages_tourpages.py
import os, json, hashlib, time
from flask import (
    Blueprint, jsonify, 
    request, send_file, 
    abort, current_app, 
    Response
    )
import mysql.connector
from dotenv import load_dotenv

bp_tourpages = Blueprint("tourpages", __name__)

# ---- Config ---------------------------------------------------------------
env_file = ".env.development" if os.getenv("bp_tourpages_ENV") == "development" else ".env.tours"
load_dotenv(dotenv_path=env_file)

tours_db_config = {
    "host": os.getenv("TOUR_DB_HOST"),
    "user": os.getenv("TOUR_DB_USER"),
    "password": os.getenv("TOUR_DB_PASS"),
    "database": os.getenv("TOUR_DB_NAME"),
    "port": int(os.getenv("TOUR_DB_PORT", "3306")),
}


CACHE_FILE = os.getenv("tourpages_CACHE", "/var/lib/tourwise/tourpages.json")
GROUP_CONCAT_MAX_LEN = int(os.getenv("GROUP_CONCAT_MAX_LEN", "10000000"))

# 🔎 boot diagnostics (prints once at import)
print(f"[tourpages] env_file={env_file}, APP_ENV={os.getenv('APP_ENV')}", flush=True)
print(f"[tourpages] tourpages_CACHE={CACHE_FILE}", flush=True)

# ---- File helpers ---------------------------------------------------------
def _read_file(path: str):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        return None

def _normalize_content_for_write(content):
    if hasattr(content, "get_data"):
        try:
            return content.get_data(as_text=True)
        except TypeError:
            return content.get_data().decode("utf-8", errors="replace")
    if hasattr(content, "text") and isinstance(content.text, str):
        return content.text
    if isinstance(content, (bytes, bytearray)):
        return content.decode("utf-8", errors="replace")
    if isinstance(content, (dict, list)):
        return json.dumps(content, ensure_ascii=False)
    return str(content)

def _write_atomic(path: str, content) -> None:
    text = _normalize_content_for_write(content)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp, path)


# ---- DB helpers -----------------------------------------------------------
def _fetch_tourpages_json(slug):
    """
    Fetch a single tour itinerary as a JSON object.
    Returns data so frontend can access directly like: tour.inclusions
    """
    conn = mysql.connector.connect(**tours_db_config)
    try:
        cur = conn.cursor(dictionary=True)
        try:
            # Allow large GROUP_CONCAT results if the view uses it
            cur.execute(f"SET SESSION group_concat_max_len = {GROUP_CONCAT_MAX_LEN};")

            # ✅ Only one query — view already has slug
            cur.execute(
                "SELECT page_json FROM vw_tour_page_json where slug = %s; LIMIT 1",
                (slug,),
            )
            row = cur.fetchone()

        finally:
            cur.close()

        # ✅ Check for missing row
        if not row:
            abort(404, description="Tour not found")

        # ✅ Extract and decode JSON
        page_json = row.get("page_json")
        if not page_json:
            raise RuntimeError(f"Empty JSON payload for slug: {slug}")

        # Validate JSON once (optional) and return raw JSON string to preserve ordering
        try:
            json.loads(page_json)
        except json.JSONDecodeError as e:
            # Log this and return 500 — view produced invalid JSON
            raise RuntimeError(f"Invalid JSON format for slug {slug}: {e}")

        return Response(page_json, mimetype="application/json")
    finally:
        cur.close()
        conn.close()
        
def get_tourpages_token():
    conn = mysql.connector.connect(**tours_db_config)
    """
    Generate a lightweight tourpage token for caching purposes.
    Format: <total_count>-<latest_unix_timestamp>
    """
    tables = ["items", "tours", "tour_history_images", "tour_videos", "vendors", "tour_guides"]
    cur = conn.cursor()
    try:
        total_count = 0
        latest_ts = 0

        for table in tables:
            cur.execute(f"""
                SELECT COUNT(*), UNIX_TIMESTAMP(COALESCE(MAX(updated_at), '1970-01-01'))
                FROM tourism_app.{table}
            """)
            count, ts = cur.fetchone()
            total_count += int(count or 0)
            if ts:
                latest_ts = max(latest_ts, int(ts))

        return f"{total_count}-{latest_ts}"
    finally:
        cur.close()


def get_tourpages_version():
    conn = mysql.connector.connect(**tours_db_config)
    cur = conn.cursor()
    try:
        cur.execute("SELECT v FROM tourpages_meta WHERE k='tourpages'")
        row = cur.fetchone()
        if not row:
            return None
        (v,) = row
        return str(v) if v is not None else None
    finally:
        cur.close()

#NEED TO CHANGE REFRESH LOGIC
# ---- Probe: lightweight endpoint to check if client should refresh -----
# In-memory small cache for backend version to avoid DB hit on every probe
_VER_CACHE = {"ver": None, "fetched_at_ms": 0}
VER_CACHE_TTL_MS = 500  # tweakable: how long to reuse the resolved backend version


def _get_backend_ver_cached():
    """Return backend version string or None on error. Caches for VER_CACHE_TTL_MS ms."""
    now_ms = int(time.time() * 1000)
    if _VER_CACHE["ver"] is not None and (now_ms - _VER_CACHE["fetched_at_ms"] < VER_CACHE_TTL_MS):
        return _VER_CACHE["ver"]

    try:
        ver_db = get_tourpages_version()
        token = get_tourpages_token()
        backend_ver = (ver_db or token or "").strip()
        backend_ver = backend_ver if backend_ver != "" else None

        _VER_CACHE["ver"] = backend_ver
        _VER_CACHE["fetched_at_ms"] = now_ms
        return backend_ver
    except Exception:
        current_app.logger.exception("Failed to read backend version/token for probe")
        # Invalidate cache so next probe will try again
        _VER_CACHE["ver"] = None
        _VER_CACHE["fetched_at_ms"] = 0
        return None


@bp_tourpages.route("/tourpages-probe", methods=["GET"])
def probe_tourpages():
    """
    Lightweight probe endpoint.
    Query param: ?ver=<client_version>
    Returns plain text '0' (no update) or '1' (update needed).
    If server cannot determine backend version, respond '1' (conservative).
    Response headers: Content-Type text/plain, Cache-Control no-store.
    """
    client_ver = (request.args.get("ver") or "").strip()
    current_app.logger.debug("Probe called, client_ver=%r", client_ver)

    backend_ver = _get_backend_ver_cached()

    if backend_ver is None:
        current_app.logger.warning("Probe: backend version unavailable; returning 1 (update needed)")
        return ("1", 200, {"Content-Type": "text/plain", "Cache-Control": "no-store"})

    # If client has no ver or ver mismatches backend -> tell client to update (1)
    if not client_ver or client_ver != backend_ver:
        current_app.logger.debug("Probe result: backend_ver=%r update_needed=1", backend_ver)
        return ("1", 200, {"Content-Type": "text/plain", "Cache-Control": "no-store"})

    current_app.logger.debug("Probe result: backend_ver=%r update_needed=0", backend_ver)
    return ("0", 200, {"Content-Type": "text/plain", "Cache-Control": "no-store"})


@bp_tourpages.route("/tourpages-data/<slug>", methods=["GET"])
def get_tourpages(slug):

    current_app.logger.info("➡️ Entered /tourpages route")

    force = request.args.get("refresh") in ("1", "true", "True")
    inm = request.headers.get("If-None-Match")
    current_app.logger.info(f"Query params: force={force}, If-None-Match={inm}")
    
    CACHE_DIR = os.getenv("tourpages_CACHE_DIR", "/var/lib/tourwise/")
    os.makedirs(CACHE_DIR, exist_ok=True)

    # Each slug gets its own JSON + .ver files
    cache_path = os.path.join(CACHE_DIR, "TP-" + f"{slug}.json")
    cached_json = None
    cached_ver = None


    # Try to read file cache if configured (harmless if not present)
    if cache_path:
        current_app.logger.info(f"Using cache_path={cache_path}")
        try:
            cached_json = _read_file(cache_path)
            cached_ver_raw = _read_file(cache_path + ".ver")
            cached_ver = cached_ver_raw.strip() if cached_ver_raw else None
            current_app.logger.info(
                "Loaded cache: cached_ver=%s, cached_json_len=%d",
                cached_ver,
                len(cached_json) if cached_json else 0,
            )
        except Exception:
            current_app.logger.exception("Failed reading cache files; continuing without file cache")

    # Resolve version/token from DB (lightweight)
    ver = ""
    try:
        with mysql.connector.connect(**tours_db_config) as conn:
            ver_db = get_tourpages_version()
            token = get_tourpages_token()
            ver = (ver_db or token or "").strip()
            current_app.logger.info("DB version resolved (normalized): %r", ver)
            
    except Exception:
        current_app.logger.exception("Failed resolving DB version/token")
        # If we couldn't get ver from DB, but we have a cached_ver, fall back to it.
        # This avoids making the endpoint unusable when DB is temporarily down.
        if cached_ver:
            ver = cached_ver
            current_app.logger.info("Falling back to cached_ver due to DB error: %r", ver)
        else:
            # re-raise or return an error — choose to return 503 with logs
            current_app.logger.error("No version available (no DB, no cache). Returning 503.")
            return (jsonify({"error": "service_unavailable"}), 503)

    # ETag check: if client has same ETag and not forced -> 304
    if not force and inm and inm == ver:
        current_app.logger.info("ETag match → returning 304 Not Modified")
        return ("", 304, {"ETag": ver})

    # If we have a valid file cache that matches DB ver, return it
    if not force and cached_json and cached_ver and cached_ver == ver:
        current_app.logger.info("Cache hit → returning cached JSON")
        return (
            cached_json,
            200,
            {"Content-Type": "application/json; charset=utf-8", "ETag": ver},
        )

    # Otherwise, fetch fresh JSON from DB
    fresh_json = None
    try:
        current_app.logger.info("Cache miss or forced refresh → fetching fresh JSON from DB")
        fresh_json = _fetch_tourpages_json(slug)
    except Exception:
        current_app.logger.exception("Failed fetching fresh JSON from DB")
        # If fetching failed but we have cached_json, return stale cache as a degraded response
        if cached_json:
            current_app.logger.warning("Returning stale cache due to fetch failure")
            return (
                cached_json,
                200,
                {"Content-Type": "application/json; charset=utf-8", "ETag": cached_ver or ver},
            )
        return (jsonify({"error": "internal_error"}), 500)

    # If file caching enabled, write fresh JSON + version atomically
    
    if cache_path and fresh_json is not None:
        current_app.logger.info("Writing fresh JSON + version to cache files -> %s", cache_path)
        try:
            _write_atomic(cache_path, fresh_json)
            _write_atomic(cache_path + ".ver", ver + "\n")
            st = os.stat(cache_path)
            current_app.logger.info("Wrote cache OK: size=%d path=%s", st.st_size, cache_path)
        except Exception:
            current_app.logger.exception("Failed writing cache; continuing without failing request")

    current_app.logger.info("Returning fresh JSON with ETag")
    return (
        fresh_json,
        200,
        {"Content-Type": "application/json; charset=utf-8", "ETag": ver},
    )

