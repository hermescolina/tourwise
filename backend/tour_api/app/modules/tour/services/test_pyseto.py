from flask import Blueprint, jsonify
from app.modules.tour.services.utils.paseto_utils import create_token, token_required

# Define the blueprint
paseto_test_bp = Blueprint('paseto_test', __name__)

@paseto_test_bp.route('/generate', methods=['GET'])
def generate_test_token():
    """Generates a real PASETO token for testing."""
    try:
        payload = {"user_id": 1, "role": "admin", "test": True}
        token = create_token(payload)
        return jsonify({"status": "Token Generated", "token": token}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@paseto_test_bp.route('/verify', methods=['GET'])
@token_required
def verify_test_token(current_user):
    """Verifies the token sent in the Authorization header."""
    return jsonify({
        "message": "Verification Successful!",
        "decoded_user_data": current_user
    }), 200
