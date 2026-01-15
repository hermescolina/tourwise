# tour_api/memory_cache.py (simplified)
import time

class memoryCache:
    def __init__(self, default_ttl=60, max_items=None):
        self._store = {}   # key -> (value, expire_ts)
        self.default_ttl = default_ttl
        self.max_items = max_items

    def _remove_expired(self):
        now = time.time()
        expired = [k for k, (_, exp) in self._store.items() if exp and exp <= now]
        for k in expired:
            self._store.pop(k, None)

    def set(self, key, value, ttl=None):
        ttl = ttl or self.default_ttl
        exp = None if ttl <= 0 else time.time() + ttl
        if self.max_items and len(self._store) >= self.max_items:
            self._store.pop(next(iter(self._store)))  # simple eviction
        self._store[key] = (value, exp)

    def get(self, key, default=None):
        self._remove_expired()
        val = self._store.get(key)
        if not val:
            return default
        value, exp = val
        if exp and exp <= time.time():
            self._store.pop(key, None)
            return default
        return value

    def delete(self, key):
        self._store.pop(key, None)

    def clear(self):
        self._store.clear()
