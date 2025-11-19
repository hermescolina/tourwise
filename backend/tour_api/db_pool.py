# db_pool.py

import mysql.connector
from mysql.connector import pooling
import os # Often used for getting credentials securely
from dotenv import load_dotenv

print("Attempting to create a database connection pool...")

# --- Your Database Configuration ---
# It's best practice to get these from environment variables
# For now, you can hardcode them to get started.
env_file = ".env.development" if os.getenv("bp_tourlandingpages_ENV") == "development" else ".env.tours"
load_dotenv(dotenv_path=env_file)

tours_db_config = {
    "host": os.getenv("TOUR_DB_HOST"),
    "user": os.getenv("TOUR_DB_USER"),
    "password": os.getenv("TOUR_DB_PASS"),
    "database": os.getenv("TOUR_DB_NAME"),
    "port": int(os.getenv("TOUR_DB_PORT", "3306")),
}
#-----------------------------------

try:
    # This is the line that creates your pool.
    # We will import `connection_pool` from this file into other files.
    connection_pool = mysql.connector.pooling.MySQLConnectionPool(**tours_db_config)
    print("✅ Database connection pool created successfully.")

except Exception as e:
    print(f"❌ CRITICAL ERROR: Failed to create database connection pool: {e}")
    # If the pool can't be created, the application can't run.
    # It's often best to exit here.
    exit(1)