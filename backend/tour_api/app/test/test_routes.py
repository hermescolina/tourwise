import json
import logging
from flask import Blueprint, Response
from redis_client import redis_client   # direct import from same folder

logger = logging.getLogger(__name__)
test_bp = Blueprint('test_bp', __name__)

@test_bp.route('/test-redis')
def test_redis():
    try:
        redis_client.set("test_key", "TourWise Connected")
        value = redis_client.get("test_key")
        if isinstance(value, (bytes, bytearray)):
            try:
                value = value.decode("utf-8")
            except Exception:
                value = repr(value)
        payload = {"status": "success", "message": value}
        return Response(json.dumps(payload), status=200, mimetype="application/json")
    except Exception as e:
        logger.exception("Error in /api/test-redis: %s", e)
        payload = {"status": "error", "message": str(e)}
        return Response(json.dumps(payload), status=500, mimetype="application/json")
