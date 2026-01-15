import os
import json
from functools import wraps
from datetime import datetime, timedelta, timezone
from flask import request, jsonify
from pyseto import Key, encode, decode
from dotenv import load_dotenv

# This logic climbs up 4 levels to find the backend root where .env.tours lives
# utils -> services -> app -> tour_api -> backend
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
load_dotenv(os.path.join(BASE_DIR, ".env.tours"))

def _get_key():
    hex_key = os.getenv("PASETO_SECRET_KEY")
    print("hex key", hex_key, flush=True)
    if not hex_key:
        raise ValueError("PASETO_SECRET_KEY not found in .env.tours")
    return Key.new(version=4, purpose="local", key=bytes.fromhex(hex_key))

# Cache the key for performance
SHARED_KEY = _get_key()

def create_token(claims, expires_in_hours=24):
    payload = claims.copy()
    payload["exp"] = (datetime.now(timezone.utc) + timedelta(hours=expires_in_hours)).isoformat()
    token = encode(SHARED_KEY, json.dumps(payload))
    return token.decode()

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith("Bearer "):
            return jsonify({"error": "Missing Authorization Header"}), 401
        
        token = auth_header.split(" ")[1]
        try:
            decoded = decode(SHARED_KEY, token)
            current_user = json.loads(decoded.payload)
        except Exception:
            return jsonify({"error": "Invalid or expired token"}), 401

        return f(current_user, *args, **kwargs)
    return decorated
