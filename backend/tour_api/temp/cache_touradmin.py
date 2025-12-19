# bp_touradminpages_touradminpages.py
import os, json, hashlib, time
from flask import Blueprint, jsonify, request, send_file, abort, current_app
import mysql.connector
from dotenv import load_dotenv

bp_touradmin = Blueprint("touradminpages", __name__)

# ---- Config ---------------------------------------------------------------
env_file = ".env.development" if os.getenv("bp_touradminpages_ENV") == "development" else ".env.tours"
load_dotenv(dotenv_path=env_file)

tours_db_config = {
    "host": os.getenv("TOUR_DB_HOST"),
    "user": os.getenv("TOUR_DB_USER"),
    "password": os.getenv("TOUR_DB_PASS"),
    "database": os.getenv("TOUR_DB_NAME"),
    "port": int(os.getenv("TOUR_DB_PORT", "3306")),
}

CACHE_FILE = os.getenv("touradminpages_CACHE", "/var/lib/tourwise/touradminpages.json")
GROUP_CONCAT_MAX_LEN = int(os.getenv("GROUP_CONCAT_MAX_LEN", "10000000"))

# 🔎 boot diagnostics (prints once at import)
print(f"[touradminpages] env_file={env_file}, APP_ENV={os.getenv('APP_ENV')}", flush=True)
print(f"[touradminpages] touradminpages_CACHE={CACHE_FILE}", flush=True)

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


def _fetch_touradminpages_json():
    conn = mysql.connector.connect(**tours_db_config)
    try:
        cur = conn.cursor()
        try:
            cur.execute(f"SET SESSION group_concat_max_len = {GROUP_CONCAT_MAX_LEN};")
            cur.execute("SELECT page_json FROM vw_tour_admin_json;")
            rows = cur.fetchall()
        finally:
            cur.close()
        if not rows:
            raise RuntimeError("vw_tour_admin_json returned empty payload")
        # rows = [(json_string,), (json_string,), ...]
        parsed = [json.loads(r[0]) for r in rows]
        return jsonify(parsed)   # ✅ return as JSON array of objects
    finally:
        conn.close()


def get_touradminpages_token():
    conn = mysql.connector.connect(**tours_db_config)
    """
    Generate a lightweight tourpage token for caching purposes.
    Format: <total_count>-<latest_unix_timestamp>
    """
    tables = ["items", "tours"]
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


def get_touradminpages_version():
    conn = mysql.connector.connect(**tours_db_config)
    cur = conn.cursor()
    try:
        cur.execute("SELECT v FROM tourpages_meta WHERE k='touradminpage'")
        row = cur.fetchone()
        if not row:
            return None
        (v,) = row
        return str(v) if v is not None else None
    finally:
        cur.close()


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
        ver_db = get_touradminpages_version()
        token = get_touradminpages_token()
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


@bp_touradmin.route("/touradmin-probe", methods=["GET"])
def probe_touradmin():
    """
    Lightweight probe endpoint.
    Query param: ?ver=<client_version>
    Returns plain text '0' (no update) or '1' (update needed).
    If server cannot determine backend version, respond '1' (conservative).
    Response headers: Content-Type text/plain, Cache-Control no-store.
    """
    print("check", flush=True)
    client_ver = (request.args.get("ver") or "").strip()
    print("VER", client_ver, flush=True)
    current_app.logger.debug("Probe called, client_ver=%r", client_ver)
    backend_ver = _get_backend_ver_cached()
    print("check3", flush=True)
    if backend_ver is None:
        current_app.logger.warning("Probe: backend version unavailable; returning 1 (update needed)")
        return ("1", 200, {"Content-Type": "text/plain", "Cache-Control": "no-store"})

    # If client has no ver or ver mismatches backend -> tell client to update (1)
    if not client_ver or client_ver != backend_ver:
        current_app.logger.debug("Probe result: backend_ver=%r update_needed=1", backend_ver)
        return ("1", 200, {"Content-Type": "text/plain", "Cache-Control": "no-store"})

    current_app.logger.debug("Probe result: backend_ver=%r update_needed=0", backend_ver)
    return ("0", 200, {"Content-Type": "text/plain", "Cache-Control": "no-store"})


@bp_touradmin.route("/touradmin-data", methods=["GET"])
def get_touradminpages():
    current_app.logger.info("➡️ Entered /touradminpages route")

    force = request.args.get("refresh") in ("1", "true", "True")
    inm = request.headers.get("If-None-Match")
    current_app.logger.info(f"Query params: force={force}, If-None-Match={inm}")

    cached_json = None
    cached_ver = None

    # Try to read file cache if configured (harmless if not present)
    if CACHE_FILE:
        current_app.logger.info(f"Using CACHE_FILE={CACHE_FILE}")
        try:
            cached_json = _read_file(CACHE_FILE)
            cached_ver_raw = _read_file(CACHE_FILE + ".ver")
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
            ver_db = get_touradminpages_version()
            print("ver_db", ver_db, flush=True)
            token = get_touradminpages_token()
            ver = (ver_db or token or "").strip()
            current_app.logger.info("DB version resolved (normalized): %r", ver)
            print("VERSION", ver, flush=True)
            print("INM", inm, flush=True)
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
        fresh_json = _fetch_touradminpages_json()
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
    if CACHE_FILE and fresh_json is not None:
        current_app.logger.info("Writing fresh JSON + version to cache files -> %s", CACHE_FILE)
        try:
            _write_atomic(CACHE_FILE, fresh_json)
            _write_atomic(CACHE_FILE + ".ver", ver + "\n")
            st = os.stat(CACHE_FILE)
            current_app.logger.info("Wrote cache OK: size=%d path=%s", st.st_size, CACHE_FILE)
        except Exception:
            current_app.logger.exception("Failed writing cache; continuing without failing request")

    current_app.logger.info("Returning fresh JSON with ETag")
    return (
        fresh_json,
        200,
        {"Content-Type": "application/json; charset=utf-8", "ETag": ver},
    )


@bp_touradmin.route("/file", methods=["GET"])
def get_touradminpages_file():
    if not os.path.exists(CACHE_FILE):
        abort(404, description="Cache file not found")
    return send_file(CACHE_FILE, mimetype="application/json")

@bp_touradmin.route("/raw", methods=["GET"])
def get_touradminpages_raw():
    fresh = _fetch_touradminpages_json()
    return fresh, 200, {"Content-Type": "application/json; charset=utf-8"}
