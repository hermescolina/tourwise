# Assuming this is in: app/modules/tour/patch/patch_history_image.py

import os
from flask import request, jsonify, current_app, g, Blueprint
from mysql.connector import Error as MySQLError
from werkzeug.utils import secure_filename

# --- NEW REQUIRED IMPORTS ---
# 1. PASETO: For authentication and getting the user ID (from flask.g)
from app.services.security.paseto import paseto_required 
# 2. REDPANDA: To publish the event after a successful database commit
from app.services.messaging.producer import get_producer 
# ----------------------------

from db_pool import connection_pool
# Assuming invalidate_cache_on_cud() is a helper you can import
from app.services.cache.utils import invalidate_cache_on_cud 

# Use the Blueprint you defined
history_images_bp = Blueprint("history_images", __name__) 


# ----------------------------------------------------------------------
# 2. Refactored Route with PASETO and Redpanda Integration
# ----------------------------------------------------------------------

# We use the Blueprint's router instead of app.route
@history_images_bp.route("/history-image/<int:image_id>", methods=["PATCH"])
@paseto_required # <- 1. PASETO CHECK: Only authenticated users (admins) can run this
def update_history_image(image_id):
    print("🟡 UPDATE tour_history_images called", flush=True)

    caption = request.form.get("caption")
    file = request.files.get("image")
    
    # Get the authenticated user ID (PASETO passes this via flask.g)
    # user_id = g.user_id 

    if caption is None and not file:
        return jsonify({"message": "No caption or file provided, no changes made"}), 200

    conn = None
    try:
        conn = connection_pool.get_connection()
        cursor = conn.cursor()
        
        # [DB and File handling logic is exactly as you wrote it]
        changes_made = False
        # ... (Your existing DB and file queuing logic) ...
        
        # --- GATHER ALL DATABASE WORK ---

        # 🧩 Update caption if provided
        if caption is not None:
            query = "UPDATE tour_history_images SET caption=%s WHERE id=%s"
            params = (caption, image_id)
            print(f"📝 Queuing caption update: {query} | params={params}", flush=True)
            cursor.execute(query, params)
            changes_made = True

        # 🧩 Update file if provided
        if file:
            # Note: File system operations can also fail!
            filename = secure_filename(file.filename)
            filepath = os.path.join(app.config["UPLOAD_FOLDER"], filename)
            file.save(filepath)

            query = "UPDATE tour_history_images SET image_path=%s WHERE id=%s"
            params = (filename, image_id)
            print(f"🖼️ Queuing image path update: {query} | params={params}", flush=True)
            cursor.execute(query, params)
            changes_made = True

        # --- FINALIZE THE TRANSACTION ---
        
        if changes_made:
            conn.commit()
            invalidate_cache_on_cud()
            print("✅ Commit successful.", flush=True)

            # 2. REDPANDA INTEGRATION: Publish event after successful commit
            producer = current_app.extensions['redpanda_producer']
            producer.publish_event(
                event_name='history_image_updated',
                payload={
                    "image_id": image_id,
                    "user_id": g.user_id, # User ID is critical for tracing
                    "caption_changed": caption is not None,
                    "image_file_changed": file is not None,
                    "timestamp": datetime.now().isoformat()
                },
                topic=current_app.config['REDPANDA_CONFIG']['TOPICS']['CLICKSTREAM'] 
            )
            # ----------------------------------------------------------

            if cursor.rowcount == 0:
                 return jsonify({"error": f"No image found with id {image_id}"}), 404
            return jsonify({"message": "Image updated successfully"}), 200
        else:
            return jsonify({"message": "No changes made"}), 200

    except MySQLError as e:
        # ... (Your existing error handling logic) ...
        # ... (conn.rollback()) ...
        pass
    except Exception as e:
        # ... (Your existing general exception handling logic) ...
        # ... (conn.rollback()) ...
        pass
    finally:
        if conn and conn.is_connected():
            conn.close()
            print("🔚 Connection returned to pool.\n", flush=True)
            
# Finally, you must register this Blueprint in your main.py.
# app.register_blueprint(history_images_bp, url_prefix='/api')