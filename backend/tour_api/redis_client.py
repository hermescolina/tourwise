# backend/tour_api/redis_client.py
import os
import redis
from logging import getLogger

logger = getLogger(__name__)

REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
# redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=False)
redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)


try:
    redis_client.ping()
    logger.info(f"Connected to Redis at {REDIS_HOST}:{REDIS_PORT}")
except Exception as e:
    logger.exception("Redis connection failed: %s", e)
