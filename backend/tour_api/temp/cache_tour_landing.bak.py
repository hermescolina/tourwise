# bp_tourlandingpages_tourlandingpages.py
import os, json, hashlib, time, logging
from flask import Blueprint, jsonify, request, send_file, abort, current_app
import mysql.connector
from dotenv import load_dotenv
from redis_client import redis_client
from memory_cache import memoryCache
from typing import Any, Optional

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

# Redis keys & TTL
REDIS_KEY_JSON = os.getenv("TOURWISE_REDIS_KEY_JSON", "tourwise:landing:json")
REDIS_KEY_VER = os.getenv("TOURWISE_REDIS_KEY_VER", "tourwise:landing:json:ver")
REDIS_TTL = int(os.getenv("TOURWISE_REDIS_TTL", str(60 * 60)))  # default 1 hour
# Toggle to disable redis entirely (use "false" to disable)
USE_REDIS = os.getenv("TOURWISE_USE_REDIS", "true").lower() != "false"

MEM_KEY_JSON = os.getenv("TOURWISE_MEM_KEY_JSON", "tourwise:landing:json")
MEM_KEY_VER = os.getenv("TOURWISE_MEM_KEY_VER", "tourwise:landing:json:ver")
# ---- Memory cache settings -----------------------------------------------
# toggle memory cache on/off
USE_MEMORY_CACHE = os.getenv("TOURWISE_USE_MEMORY_CACHE", "true").lower() != "false"
# TTL in seconds for memory cache entries
MEMORY_CACHE_TTL = int(os.getenv("TOURWISE_MEMORY_CACHE_TTL", "300"))  # default 5 min
# instantiate memory cache object (singleton)
memory_cache = memoryCache(default_ttl=MEMORY_CACHE_TTL)

# TTL in seconds
VER_CACHE_TTL_MS = 500  # tweakable: 0.5 sec

# 🔎 boot diagnostics (prints once at import)
print(f"[tourlandingpages] env_file={env_file}, APP_ENV={os.getenv('APP_ENV')}", flush=True)
print(f"[tourlandingpages] tourlandingpages_CACHE={CACHE_FILE}", flush=True)
print(f"[tourlandingpages] redis_keys={REDIS_KEY_JSON},{REDIS_KEY_VER} ttl={REDIS_TTL}", flush=True)
print(f"[tourlandingpages] memory_keys={MEM_KEY_JSON},{MEM_KEY_VER} ttl={MEMORY_CACHE_TTL}", flush=True)

#-------global helpers-------------------------------------------------------
def _default_headers():
    return {"content-type": "application/json"}

def _normalize_body(maybe_str):
    """
    Ensure body is a parsed JSON object if it's a string,
    otherwise return as-is (assume dict/list).
    """
    if isinstance(maybe_str, str):
        try:
            return json.loads(maybe_str)
        except json.JSONDecodeError:
            # If the body is plain string (not JSON), keep as string
            return maybe_str
    return maybe_str

def write_both(redis_client, redis_key: str, data: Any, ver: str):
    """
    Writes data both to Redis (as JSON string) and to memory cache (as Python dict).
    """
    body = _normalize_body(data)
    payload = {
        "body": body,
        "ver": ver,
        "headers": _default_headers(),
        "cached_at": time.time()
    }

    # Convert to JSON string for Redis
    json_data = json.dumps(payload)

    # Write to Redis (stringified)
    redis_client.setex(REDIS_KEY_JSON, REDIS_TTL, json_data)
    # redis_client.setex(f"{REDIS_KEY_JSON}:ver", REDIS_TTL, ver)
    redis_client.setex(REDIS_KEY_VER, REDIS_TTL, ver)
    # Write to memory cache (as Python object)
    _memory_set(MEM_KEY_JSON, payload, ttl=VER_CACHE_TTL_MS / 1000)


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
def _fetch_tourlandingpages_json():
    conn = mysql.connector.connect(**tours_db_config)
    try:
        cur = conn.cursor()
        try:
            cur.execute(f"SET SESSION group_concat_max_len = {GROUP_CONCAT_MAX_LEN};")
            cur.execute("SELECT page_json FROM vw_tour_landing_page_json;")
            rows = cur.fetchall()  
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

# ---- Redis helpers (non-breaking; tolerant) -------------------------------
def _safe_decode(v):
    if v is None:
        return None
    if isinstance(v, (bytes, bytearray)):
        try:
            return v.decode("utf-8")
        except Exception:
            return v.decode("utf-8", errors="replace")
    return v

def _redis_get_json_and_ver():
    try: #1234
        current_app.logger.info(f"[tourlandingpages] Redis REDIS_KEY_JSON: {REDIS_KEY_JSON}")
        json_data = redis_client.get(REDIS_KEY_JSON)
        current_app.logger.info(f"[tourlandingpages] Redis json data: {json_data}")
        ver_data = redis_client.get(REDIS_KEY_VER)
        current_app.logger.info(f"[tourlandingpages] Redis json ver: {ver_data}")
        if json_data is None or ver_data is None:
            return None, None
        return _safe_decode(json_data), _safe_decode(ver_data).strip()
    except Exception as e:
        current_app.logger.warning(f"[tourlandingpages] Redis get error: {e}")
        return None, None

def _redis_set_json_and_ver(json_data, ver):
    try:
        # store string payloads
        redis_client.setex(REDIS_KEY_JSON, REDIS_TTL, json_data)
        redis_client.setex(REDIS_KEY_VER, REDIS_TTL, ver)
        current_app.logger.info(f"[tourlandingpages] Redis cache updated ver={ver}")
    except Exception as e:
        current_app.logger.warning(f"[tourlandingpages] Redis set error: {e}")

def _redis_delete():
    try:
        redis_client.delete(REDIS_KEY_JSON, REDIS_KEY_VER)
        current_app.logger.info("[tourlandingpages] Redis keys deleted")
    except Exception as e:
        current_app.logger.warning(f"[tourlandingpages] Redis delete error: {e}")

# ---- Memory cache helpers -------------------------------------------------
def _memory_get(key: str):
    """Retrieve a value from memory cache."""
    if not USE_MEMORY_CACHE:
        # If caching is disabled globally, skip lookup
        return None

    # Try to get the cached value by key
    cached = memory_cache.get(key)

    # If nothing is found, return None
    if not cached:
        return None

    # Otherwise return the cached item
    return cached

def _memory_set(key: str, value, ttl: int = None):
    if not USE_MEMORY_CACHE:
        return
    memory_cache.set(key, value, ttl or MEMORY_CACHE_TTL)

def _memory_delete(key: str):
    if not USE_MEMORY_CACHE:
        return
    memory_cache.delete(key)

def _default_headers():
    return {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
    }

def _get_memory_ver_cached(redis_json, redis_ver):
    """
    Returns the cached backend version for probes.
    If expired or missing, fetches from DB and updates memory cache.
    """
    cached = _memory_get(MEM_KEY_JSON)
    now = time.time()
    # Proper logging — show actual cached value even if None
    current_app.logger.info(f"check 3333 cached={cached!r}")

    # Use the same timestamp key we write below: "cached_at"
    current_app.logger.info(f"check 3 in cached {isinstance(cached, dict)}")
    # if cached and isinstance(cached, dict):
    if cached:
        cached_at = cached.get("cached_at", 0)
        current_app.logger.info(f"check 3.1 cached_at < {(now - cached_at) < (VER_CACHE_TTL_MS / 1000)}")
        if (now - cached_at) < (VER_CACHE_TTL_MS / 1000):
            mem_ver = cached.get("ver")
            if mem_ver:
                current_app.logger.debug(f"Using in-memory cached ver={mem_ver}")
                return mem_ver

    # Cache miss or expired — determine the version to use
    ver = redis_ver or get_tourlandingpages_version() or get_tourlandingpages_token()

    # Store a consistent cache shape (body, ver, headers, cached_at)
    # current_app.logger.debug(f"Using in-memory redis_json ={redis_json}")

    write_both(redis_client, MEM_KEY_VER, redis_json, ver) #1234
    current_app.logger.info(f"Cached new landing ver={ver}")
    return ver

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
        current_app.logger.info(f"db version {ver_db}")
        token = get_tourlandingpages_token()
        backend_ver = (ver_db or token or "").strip()
        backend_ver = backend_ver if backend_ver != "" else None
        current_app.logger.info(f"backend version {backend_ver}")
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
    current_app.logger.info(f"Probe called, client_ver=%r {client_ver}")
    backend_ver = _get_backend_ver_cached()
    redis_json, redis_ver = _redis_get_json_and_ver()
    current_app.logger.info(f"redis version {redis_ver}")
    mem_ver = _get_memory_ver_cached(redis_json, redis_ver)
     # Safe handling if Redis is empty
    redis_ver = redis_ver or ""
    current_app.logger.info(f"CHECK PROBE 6 {mem_ver}")
    current_app.logger.info(f"CHECK PROBE 7 {redis_ver}")
    if mem_ver == redis_ver and backend_ver == redis_ver:
        current_app.logger.debug("Probe result: mem_ver=%r update_needed=0 ok ok", mem_ver)
        return ("0", 200, {"X-Redis-TTL": str(redis_ver)})

    if mem_ver != redis_ver and backend_ver == redis_ver:
        headers = {
            "X-Redis-TTL": str(mem_ver)
        }
        write_both(redis_client, MEM_KEY_JSON, redis_json, ver)

        current_app.logger.debug("Probe result: mem_ver=%r update_needed=0", mem_ver)
        return ("0", 200, {"X-Redis-TTL": str(redis_ver)})

    current_app.logger.debug("Probe result: backend_ver=%r update_needed=1", backend_ver)
    return ("1", 200, {"X-Redis-TTL": 0})


###########

@bp_tourlandingpages.route("/tour-landing", methods=["GET"])
def get_tourlandingpages():
    """
    Return tour landing pages JSON.
    Supports:
      - Force refresh via ?refresh_key=<TOURWISE_FORCE_KEY>
      - Redis-first caching
      - File cache fallback
      - ETag handling for 304 responses
    """
    
    current_app.logger.info("➡️ Entered /tourlandingpages route")

    # ---- Force refresh check via secret key ----
    force_key = request.args.get("refresh_key")
    force = force_key == os.getenv("TOURWISE_FORCE_KEY")
    # ---- Normalize If-None-Match header ----
    inm_raw = request.headers.get("If-None-Match") or ""
    update_needed = request.headers.get("If-Update-Needed") or ""
    inm = inm_raw.strip().strip('"')
    current_app.logger.info(f"Query params: force={force}, If-None-Match={inm_raw} -> normalized: {inm}")
    
    #===> must check if cache json is existing, if not ignore redis and write json file first 
    # ---- Try Redis first (shared/global cache) ----
    #1234
    if inm:
        cached = _memory_get(MEM_KEY_JSON)
        if cached:
            current_app.logger.info(f"Memory cache hit {cached}")
            return cached, 200, cached["headers"]

        # current_app.logger.info(f"Query params cached: {cached}")
        redis_json, redis_ver = _redis_get_json_and_ver()
        if redis_json and redis_ver:
            # Normalize Redis version (strip quotes, whitespace, newlines)
            redis_ver_norm = redis_ver.strip().strip('"').strip()
            current_app.logger.info(f"[tourlandingpages] Redis cache hit ver={redis_ver_norm}")

            redis_ttl = redis_client.ttl(REDIS_KEY_VER)

            # Debug check: log comparison
            current_app.logger.info(f"Comparing client ETag force = {force} inm = {repr(inm)} vs Redis ETag {repr(redis_ver_norm)}")
            # Compare
            if not force and inm and inm == redis_ver_norm:
                current_app.logger.info("[tourlandingpages] Redis ETag match -> 304 Not Modified")
                # **Important:** use quotes in returned ETag (HTTP spec)
                return (
                    "",  # body
                    304,  # status code
                    {
                        "ETag": f'"{redis_ver_norm}"',
                        "X-Redis-TTL": str(redis_ttl)
                    }  # headers
                )


            # Cache hit but client ETag mismatch or force refresh
            headers = {
                "Content-Type": "application/json; charset=utf-8",
                "ETag": f'"{redis_ver}"',       # frontend can get the version
                "X-Redis-TTL": str(redis_ttl)   # frontend can get remaining TTL
            }
            return (redis_json, 200, headers)

        # return (redis_json, 200, {"Content-Type": "application/json; charset=utf-8", "ETag": f'"{redis_ver_norm}"'})
    current_app.logger.info("CHECK 2")
    # ---- File cache fallback ----
    cached_json, cached_ver = None, None
    if os.path.exists(CACHE_FILE):
        current_app.logger.info("CHECK 2.1")
        current_app.logger.info(f"Using CACHE_FILE={CACHE_FILE}")

        # Read cache JSON and version only once
        cached_json = _read_file(CACHE_FILE)
        cached_ver_raw = _read_file(CACHE_FILE + ".ver")
        cached_ver = cached_ver_raw.strip() if cached_ver_raw else None
        
        current_app.logger.info("CHECK 2.2")
        if cached_json and update_needed == 0:
            current_app.logger.info("CHECK 2.2.1")
            # Store to Redis + memory cache
            current_app.logger.info("UPDATE NEEDED 0")
            write_both(redis_client, MEM_KEY_JSON, cached_json, cached_ver or ver)
            return cached_json

    current_app.logger.info("UPDATE NEEDED")
    # ---- Fetch backend version/token ----
    ver_db = get_tourlandingpages_version()
    token = get_tourlandingpages_token()
    ver = (ver_db or token or "").strip()
    current_app.logger.info(f"DB version normalized: {repr(ver)}")

    # ---- 304 check for file cache or fresh fetch ----
    if not force and inm and inm == ver:
        current_app.logger.info("ETag match → returning 304 Not Modified")
        return ("", 304, {"ETag": ver})

    if not force and cached_json and cached_ver == ver:
        current_app.logger.info(f"File cache hit → returning cached JSON {cached_json}")
        return (cached_json, 200, {"Content-Type": "application/json; charset=utf-8", "ETag": ver})

    # ---- Fetch fresh JSON from DB ----
    current_app.logger.info("Cache miss or force → fetching fresh JSON from DB")

    fresh_json = _fetch_tourlandingpages_json()
    current_app.logger.info(f"fetched fresh JSON = {fresh_json}")    

    # ---- Optionally clear Redis on force refresh ----
    if force:
        try:
            _redis_delete()
        except Exception:
            pass

    if force:
        _memory_delete("landing:json")
            
    # "X-Redis-TTL": str(redis_ttl)
    # ---- Write to file cache ----
    if CACHE_FILE:
        current_app.logger.info(f"Writing fresh JSON + version to file cache -> {CACHE_FILE}")
        try:
            _write_atomic(CACHE_FILE, fresh_json)
            _write_atomic(CACHE_FILE + ".ver", ver + "\n")
            st = os.stat(CACHE_FILE)
            write_both(redis_client, MEM_KEY_JSON, fresh_json, ver)
            current_app.logger.info(f"File cache written OK: size={st.st_size}")
        except Exception as e:
            current_app.logger.exception(f"Failed writing file cache: {e}")

    # ---- Update Redis (best-effort) ----
    try:
        _redis_set_json_and_ver(fresh_json, ver)
    except Exception:
        pass  # already logged by helper

    current_app.logger.info("Returning fresh JSON with ETag")
    return (fresh_json, 200, {"Content-Type": "application/json; charset=utf-8", "ETag": ver})


#############


@bp_tourlandingpages.route("/file", methods=["GET"])
def get_tourlandingpages_file():
    if not os.path.exists(CACHE_FILE):
        abort(404, description="Cache file not found")
    return send_file(CACHE_FILE, mimetype="application/json")

@bp_tourlandingpages.route("/raw", methods=["GET"])
def get_tourlandingpages_raw():
    fresh = _fetch_tourlandingpages_json()
    return fresh, 200, {"Content-Type": "application/json; charset=utf-8"}

