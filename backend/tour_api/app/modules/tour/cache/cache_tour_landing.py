# bp_tourlandingpages_tourlandingpages.py
import os, json, hashlib, time, logging
from flask import Blueprint, jsonify, request, send_file, abort, current_app, Response
import mysql.connector
from mysql.connector import pooling
from mysql.connector import Error as MySQLError
from dotenv import load_dotenv
from app.modules.tour.cache.redis_client import redis_client
from app.modules.tour.cache.memory_cache import memoryCache
from typing import Any, Optional
from werkzeug.utils import secure_filename
from db_pool import connection_pool
from pathlib import Path

bp_tourlandingpages = Blueprint("tourlandingpages", __name__)

# ---- Config ---------------------------------------------------------------
# 1. Define the Project Root (4 levels up from app/modules/tour/cache/)
# cache -> tour -> modules -> app -> [ROOT]
BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent

# 2. Determine which filename to use
env_name = ".env.development" if os.getenv("bp_tourpages_ENV") == "development" else ".env.tours"

# 3. Create the absolute path (Using the SAME variable 'env_name')
env_path = BASE_DIR / env_name

load_dotenv(dotenv_path=env_path)

tours_db_config = {
    "host": os.getenv("TOUR_DB_HOST"),
    "user": os.getenv("TOUR_DB_USER"),
    "password": os.getenv("TOUR_DB_PASS"),
    "database": os.getenv("TOUR_DB_NAME"),
    "port": int(os.getenv("TOUR_DB_PORT", "3306")),
}

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
# print(f"[tourlandingpages] env_file={env_file}, APP_ENV={os.getenv('APP_ENV')}", flush=True)
# print(f"[tourlandingpages] tourlandingpages_CACHE={CACHE_FILE}", flush=True)
# print(f"[tourlandingpages] redis_keys={REDIS_KEY_JSON},{REDIS_KEY_VER} ttl={REDIS_TTL}", flush=True)
# print(f"[tourlandingpages] memory_keys={MEM_KEY_JSON},{MEM_KEY_VER} ttl={MEMORY_CACHE_TTL}", flush=True)

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

def invalidate_cache_on_cud() -> str | None:
    """
    1. Re-fetches the latest full list of tours from the DB.
    2. Retrieves the latest ETag (version) set by the MySQL trigger.
    3. Atomically updates both the JSON payload and the ETag in Redis.
    """
    try:
        # 1. Fetch the latest version set by the MySQL trigger
        # We assume this function is fast and reads from a separate version table.
        new_version = get_latest_db_version() 
        
        if not new_version:
             print("⚠️ WARN: Could not retrieve new version from DB tracker. Aborting Redis SET.")
             return None

        # 2. Fetch the entire, fresh data payload from the primary DB
        # This function must query the DB and return the Python list/dict structure.
        fresh_data = _fetch_tourlandingpages_json() 

        # 3. Serialize the fresh data
        json_string = json.dumps(fresh_data)

        # 4. Use a Redis Pipeline for atomic update of two keys
        pipe = redis_client.pipeline()
        
        # Set the NEW VERSION/ETag (This is the cache invalidator)
        pipe.set(REDIS_KEY_VER, new_version)
        
        # Set the NEW DATA payload
        pipe.set(REDIS_KEY_JSON, json_string)
        
        # Execute both commands simultaneously
        pipe.execute() 
        
        print(f"✅ Cache invalidated and updated. New ETag: {new_version}")
        return new_version
        
    except Exception as e:
        print(f"❌ CRITICAL: Failed to perform Redis SET after DB change: {e}")
        return None

def extract_data_from_redis_json(redis_json_string: str) -> Any:
    """
    Parses a JSON string from Redis and unwraps the nested 'body' keys
    to return the actual data payload.

    Args:
        redis_json_string: The JSON string retrieved from the Redis cache.

    Returns:
        The innermost data payload, or None if input is invalid.
    """
    if not redis_json_string:
        return None

    try:
        # Step 1: Parse the outer JSON string into a Python dictionary
        data = json.loads(redis_json_string)

        # Step 2: Loop as long as the data is a dictionary and has a 'body' key
        while isinstance(data, dict) and 'body' in data:
            # Go one level deeper
            data = data['body']

        # Step 3: The loop has finished, 'data' now holds the final payload
        return data

    except (json.JSONDecodeError, TypeError) as e:
        # Handle cases where the input is not valid JSON or structure is unexpected
        current_app.logger.error(f"Failed to extract data from redis_json: {e}")
        return None

async def populate_redis_from_db():
    # This is your helper function
    print("Fetching fresh data from DB and populating Redis...")
    ver = await db.get_current_version()
    json_data = await db.get_tour_landing_data()

    # >>> THIS IS YOUR CODE <<<
    await redis_client.setex(REDIS_KEY_JSON, REDIS_TTL, json_data)
    await redis_client.setex(REDIS_KEY_VER, REDIS_TTL, ver)


# ---- DB helpers -----------------------------------------------------------
def _fetch_tourlandingpages_json():
    
    try:
        conn = connection_pool.get_connection()
        cur = conn.cursor()
        try: 
            cur.execute(f"SET SESSION group_concat_max_len = {GROUP_CONCAT_MAX_LEN};")
            cur.execute("SELECT page_json FROM vw_tour_landing_page_json;")
            rows = cur.fetchall()  
        finally:
            cur.close()

        if not rows:
            raise RuntimeError("vw_tour_landing_page_json returned empty payload")

        list_of_python_dicts = []
        for row in rows:
            json_string_from_db = row[0]
            try:
                # Convert the JSON string from the DB into a Python dictionary
                python_dict = json.loads(json_string_from_db)
                list_of_python_dicts.append(python_dict)
            except (json.JSONDecodeError, TypeError):
                current_app.logger.warning(f"Skipping malformed JSON from DB: {json_string_from_db}")
                continue

        # Return the final Python list of dictionaries.
        # Flask will handle serializing this correctly.
        return list_of_python_dicts
        # --- END OF FIX ---
    except MySQLError as e:
        print(f"❌ DATABASE ERROR: {e}", flush=True)
        # conn.rollback() is a good practice here, though it happens automatically
        if conn:
            conn.rollback()
        return jsonify({"error": "A database error occurred"}), 500
    except Exception as e:
        # Catch other potential errors, like file.save() failing
        print(f"❌ UNEXPECTED ERROR: {e}", flush=True)
        if conn:
            conn.rollback()
        return jsonify({"error": "An internal server error occurred"}), 500
    finally:
        # 3. The ONLY place you should close the connection.
        # This guarantees it's always returned to the pool.
        if conn and conn.is_connected():
            conn.close()
            print("🔚 Connection returned to pool.\n", flush=True)



def get_tourlandingpages_version():
    try:
        conn = connection_pool.get_connection()
        cur = conn.cursor()
        cur.execute("SELECT v FROM tourpages_meta WHERE k='landingpage'")
        row = cur.fetchone()
        if not row:
            return None
        (v,) = row
        return str(v) if v is not None else None
    except MySQLError as e:
        print(f"❌ DATABASE ERROR: {e}", flush=True)
        # conn.rollback() is a good practice here, though it happens automatically
        if conn:
            conn.rollback()
        return jsonify({"error": "A database error occurred"}), 500
    except Exception as e:
        # Catch other potential errors, like file.save() failing
        print(f"❌ UNEXPECTED ERROR: {e}", flush=True)
        if conn:
            conn.rollback()
        return jsonify({"error": "An internal server error occurred"}), 500
    finally:
        # 3. The ONLY place you should close the connection.
        # This guarantees it's always returned to the pool.
        if conn and conn.is_connected():
            conn.close()
            print("🔚 Connection returned to pool.\n", flush=True)

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

# Renamed for clarity, as it now checks all layers.
def get_current_api_version():
    """
    Finds the current API version using a layered cache approach.
    L1 (Memory) -> L2 (Redis) -> L3 (Database).
    This function is responsible for populating the caches on a miss.
    """
    # --- STEP 1: Check L1 In-Memory Cache (Fastest) ---
    mem_ver = _memory_get(MEM_KEY_VER) # Use the specific version key
    if mem_ver:
        current_app.logger.debug(f"✅ L1 Cache Hit: Using in-memory ver={mem_ver}")
        return mem_ver

    # --- STEP 2: L1 Miss, Check L2 Redis Cache ---
    current_app.logger.info("🟡 L1 Cache Miss. Checking L2 Redis...")
    redis_ver = redis_client.get(REDIS_KEY_VER)
    if redis_ver:
        # redis_ver_str = redis_ver.decode('utf-8') # Redis stores bytes
        redis_ver_str = redis_ver
        current_app.logger.info(f"✅ L2 Cache Hit: Found ver={redis_ver_str} in Redis.")
        # Populate L1 cache for the next request
        _memory_set(MEM_KEY_VER, redis_ver_str, ttl=VER_CACHE_TTL_MS / 1000)
        return redis_ver_str

    # --- STEP 3: L2 Miss, The Last Resort: Database ---
    current_app.logger.warning("🔴 L2 Cache Miss. Hitting Database for version...")
    try:
        db_ver = get_tourlandingpages_version() # Your function that does "SELECT version FROM meta"
        db_ver_str = str(db_ver) # Ensure it's a string

        current_app.logger.warning(f"✅ DB Fetch OK: Got ver={db_ver_str}. Populating caches...")

        # Populate both L2 and L1 caches
        redis_client.set(REDIS_KEY_VER, db_ver_str) # No TTL on version in Redis, rely on invalidation
        _memory_set(MEM_KEY_VER, db_ver_str, ttl=VER_CACHE_TTL_MS / 1000)

        return db_ver_str

    except Exception as e:
        current_app.logger.error(f"❌ CRITICAL: Failed to fetch version from database: {e}")
        # Return a default/fallback version or raise an error
        # Returning None will likely cause the ETag check to fail and trigger a full data refresh, which is safe.
        return None


def get_full_payload():
    """
    Gets the full JSON payload using a layered cache.
    L1 (Redis) -> L2 (Database).
    Populates the cache on a miss.
    """
    # 1. Check Redis first
    try:
        redis_json = redis_client.get(REDIS_KEY_JSON)
        if redis_json:
            current_app.logger.info("✅ L1 Payload Hit: Serving from Redis.")
            return redis_json
    except Exception as e:
        current_app.logger.error(f"⚠️  Redis GET failed for payload: {e}")

    # 2. Redis Miss -> Fetch from DB
    current_app.logger.warning("🔴 L1 Payload Miss. Hitting database for full payload.")
    try:
        fresh_json = _fetch_tourlandingpages_json() # Your existing DB fetch function

         # --- ADD THIS LOG ---
        current_app.logger.info(f"DEBUG: Type from _fetch... is {type(fresh_json)}")
        if isinstance(fresh_json, list) and len(fresh_json) > 0:
            current_app.logger.info(f"DEBUG: First item type is {type(fresh_json[0])}")
        # --------------------


        # 3. Populate Redis for the next request
        try:
            # We also need the version to store alongside the JSON
            version = get_current_api_version() # This should be fast now (cached)

            json_string_to_cache = json.dumps(fresh_json)

            _redis_set_json_and_ver(json_string_to_cache, version) # Your helper to write both
            current_app.logger.info("✅ Populated Redis with fresh payload.")
        except Exception as e:
            current_app.logger.error(f"⚠️  Failed to populate Redis cache: {e}")

        response = Response(json_string_to_cache, mimetype='application/json')
    
        # Add the ETag header
        if version:
            response.headers['ETag'] = f'"{version}"'
        return response
        # return fresh_json

    except Exception as e:
        current_app.logger.critical(f"❌ CRITICAL: Failed to fetch payload from database: {e}")
        return None


# --- The New, Clean API Endpoint ---

@bp_tourlandingpages.route("/tour-landing", methods=["GET"])
def get_tourlandingpages():
    
    """
    Return tour landing pages JSON using a clean, layered caching architecture.
    """
    print("➡️ Entered /tour-landing route",flush=True)
    
    # ---- STEP 1: Handle Force Refresh (Admin override) ----
    force_key = request.args.get("refresh_key")
    force_refresh = force_key and force_key == os.getenv("TOURWISE_FORCE_KEY")
    if force_refresh:
        current_app.logger.warning("⚠️  Forced refresh initiated by admin key.")
        # Invalidate caches and proceed to fetch fresh data
        _redis_delete() # Your helper to delete Redis keys
        _memory_delete(MEM_KEY_VER) # Your helper to delete memory key

    # ---- STEP 2: Perform ETag Validation ----
    client_etag = request.headers.get('If-None-Match', '').strip('"')
    
    # This one function call hides all the complexity.
    server_version = get_current_api_version()

    # Log the state of the variables used in the comparison (client vs. server)
    print(f"DEBUG ETAG CHECK: force_refresh={force_refresh}, client_etag='{client_etag}', server_version='{server_version}'", flush=True)

    # We only send a 304 if a force refresh is NOT requested.
    if not force_refresh and client_etag and server_version and client_etag == server_version:
        current_app.logger.info(f"✅ ETag Match (v{server_version}). Sending 304 Not Modified.")
        headers = _default_headers()
        headers['ETag'] = f'"{server_version}"'
        return "", 304, headers

    # ---- STEP 3: ETag Mismatch or No ETag -> Get the Full Payload ----
    current_app.logger.info(f"💨 ETag Mismatch or no ETag provided. Client has '{client_etag}', server has '{server_version}'. Fetching full payload.")
    
    payload = get_full_payload()

     # --- 👇 ADD THESE LOGGING LINES --- 👇 ---
    current_app.logger.info(f"PAYLOAD TYPE: {type(payload)}")

    if payload is None:
        current_app.logger.error("❌ No payload available from cache or DB. Returning 503.")
        return jsonify({"error": "Service temporarily unavailable"}), 503

    # ---- STEP 4: Return the Fresh Payload ----
    # The server_version should already be cached from the ETag check
    # final_version = server_version or get_current_api_version()
    # headers = _default_headers()
    # headers['ETag'] = f'"{final_version}"'
    # The payload from Redis/DB might be a string, needs to be returned as a Flask Response
    # return Response(payload, mimetype='application/json', headers=headers)
    # return payload
    # return jsonify(payload), 200, headers

    # ---- STEP 4: Return the Fresh Payload ----
    final_version = server_version or get_current_api_version()
    headers = _default_headers()
    headers['ETag'] = f'"{final_version}"'
    
    # ✅ Return the string payload directly as a JSON response
    return Response(payload, mimetype='application/json', headers=headers), 200