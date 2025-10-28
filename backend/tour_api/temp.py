def _memory_get(key: str):
    if not USE_MEMORY_CACHE:
        return None

    cached = memory_cache.get(key)
    if not cached:
        return None

    return cached
