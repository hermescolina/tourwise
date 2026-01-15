import os
from functools import wraps
from datetime import datetime, timedelta, timezone
from flask import request, jsonify
from pyseto import Key, encode, decode
from dotenv import load_dotenv

load_dotenv(".env.tours")

# Setup the Key once when the module loads
HEX_KEY = os.getenv("PASETO_SECRET_KEY")
if not HEX_KEY:
    raise ValueError("No PASETO_SECRET_KEY found in environment variables")

# Convert hex to bytes and create the Key object
SHARED_KEY = Key.new(version=4, purpose="local", key=bytes.fromhex(HEX_KEY))

def create_token(user_id):
    """Generates a new PASETO token for a user."""
    payload = {
        "user_id": user_id,
        "exp": (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
    }
    token = encode(SHARED_KEY, payload)
    return token.decode()

def token_required(f):
    """Decorator to protect Flask routes."""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        
        if not auth_header or not auth_header.startswith("Bearer "):
            return jsonify({"error": "Missing or invalid Authorization header"}), 401
        
        token = auth_header.split(" ")[1]
        
        try:
            # decode() verifies signature, expiration, and decrypts the data
            decoded = decode(SHARED_KEY, token)
            current_user = decoded.payload
        except Exception:
            return jsonify({"error": "Token is invalid or expired"}), 401

        return f(current_user, *args, **kwargs)
    return decorated
