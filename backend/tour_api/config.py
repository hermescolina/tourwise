import os
from flask_cors import cross_origin
import mysql.connector # ⬅️ REQUIRED for DB connection
from flask import Flask, Blueprint, request, jsonify, current_app # ⬅️ REQUIRED Flask components
from flask import Blueprint, jsonify, current_app # Ensure jsonify and current_app are imported
from flask_cors import cross_origin
import mysql.connector
from mysql.connector import pooling
from dotenv import load_dotenv
from typing import Any, Optional
from werkzeug.utils import secure_filename
from db_pool import connection_pool

# ⭐️ NEW: Define a Blueprint for Configuration/Navigation Routes ⭐️
config_bp = Blueprint("config_bp", __name__)

# ✅ Load environment variables from .env.tours
load_dotenv(dotenv_path=".env.tours")

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

# Assuming this is inside your config_routes or app.py file

from flask import Blueprint, jsonify

# Define a Blueprint if you are organizing routes (recommended)
# config_bp = Blueprint('config', __name__, url_prefix='/api/config') 

# Hardcoded list of languages for demonstration
# In a production app, this might come from a DB or a config file
LANGUAGES = [
    {"code": "en", "name": "English", "flag": "🇬🇧"},
    {"code": "de", "name": "German", "flag": "🇩🇪"},
    {"code": "es", "name": "Spanish", "flag": "🇪🇸"},
    {"code": "fr", "name": "French", "flag": "🇫🇷"},
    {"code": "it", "name": "Italian", "flag": "🇮🇹"},
    {"code": "pt", "name": "Portuguese", "flag": "🇵🇹"},
    {"code": "ru", "name": "Russian", "flag": "🇷🇺"},
    {"code": "zh", "name": "Chinese (Simplified)", "flag": "🇨🇳"},
    {"code": "ja", "name": "Japanese", "flag": "🇯🇵"},
    {"code": "ko", "name": "Korean", "flag": "🇰🇷"},
    {"code": "ar", "name": "Arabic", "flag": "🇦🇪"},
    {"code": "hi", "name": "Hindi", "flag": "🇮🇳"},
    {"code": "th", "name": "Thai", "flag": "🇹🇭"},
    {"code": "id", "name": "Indonesian", "flag": "🇮🇩"},    
]

@config_bp.route('/languages', methods=['GET'])
# If not using a Blueprint, use: @app.route('/api/config/languages', methods=['GET'])
def get_languages():
    """
    Returns the list of supported languages for the application.
    Matches the data structure expected by the useLanguages hook.
    """
    # 200 OK: Return the JSON array of language objects
    return jsonify(LANGUAGES), 200

# Remember to register the Blueprint in your main application file:
# app.register_blueprint(config_bp)

@config_bp.route("/navbar/links", methods=["GET"])
@cross_origin() # Use the cross_origin decorator since you imported it
def get_navbar_links():
    """
    Fetches all active navigation items from the 'nav_items' MySQL table, 
    ordered by the 'order' column.
    """
    conn = cursor = None
    try:
        # Use your standard tours database configuration
        # db = mysql.connector.connect(**tours_db_config)
        conn = connection_pool.get_connection()
        
        # Use dictionary=True for JSON serialization compatibility
        cursor = conn.cursor(dictionary=True) 

        # 1. Query the nav_items table
        # We use backticks (`) around the reserved keyword `order` for safety.
        query = """
            SELECT title, path
            FROM nav_items
            WHERE is_active = TRUE
            ORDER BY `order` ASC;
        """
        cursor.execute(query)
        nav_items = cursor.fetchall()
        
        # 2. Return the fetched data
        return jsonify(nav_items), 200

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