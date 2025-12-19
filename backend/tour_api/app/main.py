import os
import time
import secrets
import json
import hashlib   


# from redis_client import redis_client

from decimal import Decimal, InvalidOperation

from flask import (
    Flask,
    current_app,
    request,
    jsonify,
    make_response,
    send_from_directory,
)

from mysql.connector import Error as MySQLError
from werkzeug.utils import secure_filename
from db_pool import connection_pool

from datetime import datetime, timezone

import mimetypes

try:
    import db_pool
    print("db_pool module imported, pool should be initialized.")
except Exception as e:
    print(f"Failed to import or initialize db_pool: {e}")
    # You might want to prevent the app from starting if the DB pool fails.
    exit(1)

from flask_cors import CORS
from werkzeug.utils import secure_filename
# import mysql.connector
from dotenv import load_dotenv

# --- CRITICAL: REDPANDA/KAFKA IMPORTS (FUTURE USE) ---
try:
    from confluent_kafka import Producer 
    # NOTE: Assuming these are in place based on the planned modular structure
    from app.services.messaging.producer import RedpandaProducer, get_producer 
    REDPANDA_IMPORTS_SUCCESS = True
except ImportError as e:
    print(f"INFO: Redpanda imports skipped. Install 'confluent-kafka' later: {e}")
    REDPANDA_IMPORTS_SUCCESS = False
# -----------------------------------------------------

from fb_auto_post import fb_bp, post_tour_to_facebook_internal
from cart_routes import cart_bp
from voucher_routes import voucher_bp
from payment_routes import payment_bp
from booking_routes import confirm_bp
from tour_routes import tours_bp
from app_categories import bp_categories
from bp_hotel_rooms import rooms_bp
from bp_xendit_webhook import bp_xendit
from app.modules.tour.cache.cache_tourpage import bp_tourpages
from app.modules.tour.cache.cache_tour_landing import bp_tourlandingpages
from app.modules.tour.cache.cache_touradmin import bp_touradmin
from app.modules.tour.cache.cache_tourcards import bp_tourcards
from app.modules.tour.cache.cache_tourcardsadmin import bp_tourcardsadmin
from app.modules.tour.cache.cache_touritinerary import bp_touritinerary
r
from config import config_bp
from test_routes import test_bp


from voucher_routes import send_confirmation_email

# --- Flask app FIRST ---
app = Flask(__name__)

print("... env", app.config.get("ENV"),flush=True)

CORS(app,
    resources={r"/api/*": {
        "origins": [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "https://app.tourwise.shop"
        ],
        "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        # ⬇️ keep your existing headers and ADD the two custom ones
        "allow_headers": ["Content-Type", "Authorization", "If-None-Match", "X-Cache-Strategy"],
        # ⬇️ expose ETag so your JS can read res.headers.get('ETag')
        "expose_headers": ["ETag", "X-Redis-TTL"],
    }},
    # optional, only if you use cookies:
    # supports_credentials=True
)

from tours_db_helpers import (
    get_tour_from_db_by_slug,
    update_tour_in_db_by_id,
    get_tour_tips_from_db_by_slug,
    update_tour_tips_by_slug,
    post_tour_tips_from_db_by_slug,
)


# Register MIME types
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")

# ✅ Load environment variables from .env.tours
env_file = ".env.development" if os.getenv("APP_ENV") == "development" else ".env.tours"
load_dotenv(dotenv_path=env_file)

# ✅ DB config from environment
db_name = os.getenv("TOUR_DB_NAME")
print(f"💢️  Loaded database name from .env: {db_name}")

# Define database config
# ✅ Tours DB Config
tours_db_config = {
    "host": os.getenv("TOUR_DB_HOST"),  # from .env.tours
    "user": os.getenv("TOUR_DB_USER"),
    "password": os.getenv("TOUR_DB_PASS"),
    "database": os.getenv("TOUR_DB_NAME"),
    "port": 3306,
}

# ✅ Hotels DB Config
hotels_db_config = {
    "host": os.getenv("HOTEL_DB_HOST"),  # use separate variables in .env.hotels
    "user": os.getenv("HOTEL_DB_USER"),
    "password": os.getenv("HOTEL_DB_PASS"),
    "database": os.getenv("HOTEL_DB_NAME"),
    "port": 3306,
}

# ✅ Cars DB Config
cars_db_config = {
    "host": os.getenv("CAR_DB_HOST"),  # use separate variables in .env.cars
    "user": os.getenv("CAR_DB_USER"),
    "password": os.getenv("CAR_DB_PASS"),
    "database": os.getenv("CAR_DB_NAME"),
    "port": 3306,
}


# --- REDPANDA/KAFKA CONFIGURATION (NEW) ---
# NOTE: The host will be 'redpanda' when running inside Docker Compose
REDPANDA_BROKERS = os.getenv("REDPANDA_BROKERS", "localhost:9092")
print(f"✨ Redpanda Brokers set to: {REDPANDA_BROKERS}")

REDPANDA_CONFIG = {
    "BROKERS": REDPANDA_BROKERS,
    # Define your main topics for events
    "TOPICS": {
        "CLICKSTREAM": "user_clickstream_events", # For page views, searches (high volume)
        "BOOKINGS": "transactional_bookings"      # For checkout, payment success (low volume, critical)
    },
    # Configuration to pass directly to confluent_kafka.Producer
    "PRODUCER_CONF": {
        "bootstrap.servers": REDPANDA_BROKERS,
        "client.id": os.getenv("FLASK_APP", "tour_api_producer"),
        "compression.type": "snappy"
    }
}
# ------------------------------------------


# def generate_confirmation_token(email):
def generate_token(length=32):
    return secrets.token_urlsafe(length)
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://app.tourwise.shop",

# ✅ One-time reusable connection function


def get_db_connection():
    return mysql.connector.connect(**tours_db_config)

#===============================ROUTES==============================================

#===============================END ROUTES==============================================

#===============================BLUE PRINTS==============================================
app.register_blueprint(fb_bp, url_prefix="/api/fb")
app.register_blueprint(cart_bp, url_prefix="/api/cr")
app.register_blueprint(payment_bp, url_prefix="/api/pay")
app.register_blueprint(confirm_bp, url_prefix="/api/cf")
app.register_blueprint(voucher_bp, url_prefix="/api/vr")
app.register_blueprint(tours_bp, url_prefix="/api/tr")
app.register_blueprint(bp_categories, url_prefix="/api/cat")
app.register_blueprint(rooms_bp, url_prefix="/api/hr")
app.register_blueprint(bp_xendit, url_prefix="/api/xen")
app.register_blueprint(bp_tourpages, url_prefix="/api/tp")
app.register_blueprint(bp_tourlandingpages, url_prefix="/api/tl")
app.register_blueprint(bp_touradmin, url_prefix="/api/ta")
app.register_blueprint(bp_tourcards, url_prefix="/api/tc")
app.register_blueprint(bp_tourcardsadmin, url_prefix="/api/tca")
app.register_blueprint(bp_touritinerary, url_prefix="/api/ti")
app.register_blueprint(bp_history_images, url_prefix="/api/th")
app.register_blueprint(config_bp, url_prefix="/api/config")
app.register_blueprint(test_bp, url_prefix="/api/tred")

#===============================END BLUE PRINTS==============================================


# ✅ Debug route to list all registered routes
@app.get("/__routes")
def __routes():
    return [str(r) for r in app.url_map.iter_rules()]

# ✅ Run locally or with Gunicorn/Render
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3001))

    # Optional: print all routes on startup
    print("\n📅 Registered routes:")
    for rule in app.url_map.iter_rules():
        print(f"{rule} → {', '.join(rule.methods)}")

    app.run(host="0.0.0.0", port=port, debug=True)



@app.after_request
def set_response_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    # optional: remove old headers
    response.headers.pop("X-XSS-Protection", None)
    return response