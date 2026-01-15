from werkzeug.security import check_password_hash # MUST ADD THIS
from app.modules.tour.services.utils.paseto_utils import create_token
from db_pool import connection_pool

class AuthService:
    @staticmethod
    def verify_and_login(username, password):
        print(f"DEBUG: Login attempt for user: {username}", flush=True)
        conn = None
        try:
            conn = connection_pool.get_connection()
            cursor = conn.cursor(dictionary=True)

            # 1. Fetch user
            query = "SELECT id, username, password, role FROM users WHERE username = %s"
            cursor.execute(query, (username,))
            user = cursor.fetchone()
            
            if not user:
                print(f"DEBUG: User {username} not found", flush=True)
                return None, "Invalid credentials"

            # 2. Verify Password
            try:
                db_hash = str(user['password']).strip()
                input_password = str(password).strip()
                
                is_valid = check_password_hash(db_hash, input_password)
                print(f"DEBUG: Password match result: {is_valid}", flush=True)
            except Exception as e:
                print(f"CRITICAL: check_password_hash failed: {str(e)}", flush=True)
                is_valid = False

            if not is_valid:
                return None, "Invalid credentials"

            # 3. Generate PASETO Token
            # Note: create_token should handle the pyseto.encode logic
            token = create_token({
                "sub": str(user['id']),
                "role": user['role'],
                "username": user['username']
            })

            return {
                "token": token, 
                "user": {"username": user['username'], "role": user['role']}
            }, None

        except Exception as e:
            print(f"Auth Error: {e}", flush=True)
            return None, "Internal Server Error"
        finally:
            if conn and conn.is_connected():
                cursor.close()
                conn.close()