# bp_tourlandingpages_tourlandingpages.py
import os, json, hashlib, time
from flask import Blueprint, jsonify, request, send_file, abort, current_app
import mysql.connector
from dotenv import load_dotenv

bp_tourlandingpages = Blueprint("tourlandingpages", __name__)

# ---- Config ---------------------------------------------------------------
env_file = ".env.development" if os.getenv("bp_tourlandingpages_ENV") == "development" else ".env.tours"
load_dotenv(dotenv_path=env_file)

tours_db_config = {
    "host": os.getenv("TOUR_DB_HOST"),
    "user": os.getenv("TOUR_DB_USER"),
    "password": os.getenv("TOUR_DB_PASS"),
    "database": os.getenv("TOUR_DB_NAME"),
    "port": int(os.getenv("TOUR_DB_PORT", "3306")),
}

CACHE_FILE = os.getenv("tourlandingpages_CACHE", "/var/lib/tourwise/tourlandingpages.json")
GROUP_CONCAT_MAX_LEN = int(os.getenv("GROUP_CONCAT_MAX_LEN", "10000000"))

# 🔎 boot diagnostics (prints once at import)
print(f"[tourlandingpages] env_file={env_file}, APP_ENV={os.getenv('APP_ENV')}", flush=True)
print(f"[tourlandingpages] tourlandingpages_CACHE={CACHE_FILE}", flush=True)

# ---- File helpers ---------------------------------------------------------
def _read_file(path: str):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        return None

# def _write_atomic(path: str, content: str) -> None:
#     os.makedirs(os.path.dirname(path), exist_ok=True)
#     tmp = f"{path}.tmp"
#     with open(tmp, "w", encoding="utf-8") as f:
#         f.write(content)
#     os.replace(tmp, path)  # atomic on POSIX

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
def _fetch_tourlandingpages_json():
    conn = mysql.connector.connect(**tours_db_config)
    try:
        cur = conn.cursor()
        try:
            cur.execute(f"SET SESSION group_concat_max_len = {GROUP_CONCAT_MAX_LEN};")
            cur.execute("SELECT page_json FROM vw_tour_landing_page_json;")
            rows = cur.fetchall()   # rows -> list of tuples like [ (json1,), (json2,), ... ]
        finally:
            cur.close()

        if not rows:
            raise RuntimeError("vw_tour_landing_page_json returned empty payload")

        result = [r[0] for r in rows]
        return json.dumps(result, ensure_ascii=False)
    finally:
        conn.close()

def get_tourlandingpages_token():
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


def get_tourlandingpages_version():
    conn = mysql.connector.connect(**tours_db_config)
    cur = conn.cursor()
    try:
        cur.execute("SELECT v FROM tourpages_meta WHERE k='landingpage'")
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
        ver_db = get_tourlandingpages_version()
        token = get_tourlandingpages_token()
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


@bp_tourlandingpages.route("/tourlandingpages-probe", methods=["GET"])
def probe_tourlandingpages():
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


@bp_tourlandingpages.route("/tour-landing", methods=["GET"])
def get_tourlandingpages():
    current_app.logger.info("➡️ Entered /tourlandingpages route")
    force = request.args.get("refresh") in ("1", "true", "True") #need to change this to dynamic approach encrypte 
                                                                 #encrypted keyword = encrypted value "s8d7f6asd87f = 8s6df8sd"
    inm = request.headers.get("If-None-Match")
    current_app.logger.info(f"Query params: force={force}, If-None-Match={inm}")

    # Default: no file cache unless configured
    cached_json = None
    cached_ver = None
    if CACHE_FILE:
        current_app.logger.info(f"Using CACHE_FILE={CACHE_FILE}")
        cached_json = _read_file(CACHE_FILE)
        cached_ver_raw = _read_file(CACHE_FILE + ".ver")
        cached_ver = cached_ver_raw.strip() if cached_ver_raw else None
        current_app.logger.info(f"Loaded cache: cached_ver={cached_ver}, cached_json_len={len(cached_json) if cached_json else 0}")
    else:
        current_app.logger.info("No CACHE_FILE configured, skipping file cache")

    with mysql.connector.connect(**tours_db_config) as conn:
        ver_db = get_tourlandingpages_version()
        token  = get_tourlandingpages_token() 
        ver = (ver_db or token or "").strip()   # <- normalize
        current_app.logger.info(f"DB version resolved (normalized): {repr(ver)}")
        
        print("VERSION",ver,flush=True)
        print("INM",inm,flush=True)

        if not force and inm and inm == ver:
            current_app.logger.info("ETag match → returning 304 Not Modified")
            return ("", 304, {"ETag": ver})

        if not force and cached_json and cached_ver == ver:
            current_app.logger.info("Cache hit → returning cached JSON")
            return (cached_json, 200, {
                "Content-Type": "application/json; charset=utf-8",
                "ETag": ver
            })

        current_app.logger.info("Cache miss or forced refresh → fetching fresh JSON from DB")
        
        fresh_json = _fetch_tourlandingpages_json()

    if CACHE_FILE:
        current_app.logger.info(f"Writing fresh JSON + version to cache files -> {CACHE_FILE}")
        try:
            _write_atomic(CACHE_FILE, fresh_json)
            _write_atomic(CACHE_FILE + ".ver", (ver + "\n")) 
            st = os.stat(CACHE_FILE)
            current_app.logger.info(f"Wrote cache OK: size={st.st_size} path={CACHE_FILE}")
        except Exception as e:
            current_app.logger.exception(f"Failed writing cache: {e}")


    current_app.logger.info("Returning fresh JSON with ETag")
    return (fresh_json, 200, {
        "Content-Type": "application/json; charset=utf-8",
        "ETag": ver
    })


@bp_tourlandingpages.route("/file", methods=["GET"])
def get_tourlandingpages_file():
    if not os.path.exists(CACHE_FILE):
        abort(404, description="Cache file not found")
    return send_file(CACHE_FILE, mimetype="application/json")

@bp_tourlandingpages.route("/raw", methods=["GET"])
def get_tourlandingpages_raw():
    fresh = _fetch_tourlandingpages_json()
    return fresh, 200, {"Content-Type": "application/json; charset=utf-8"}
