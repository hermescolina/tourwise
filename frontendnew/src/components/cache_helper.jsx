// ✨ CACHE: add lightweight cache helpers + defaults
  const CACHE_TTL_MS = 15 * 60 * 1000; // ✨ CACHE: 5 minutes default TTL
  const nowMs = () => Date.now();     // ✨ CACHE: simple time helper

  // ✨ CACHE: read from localStorage, validate expiration
  function cacheGet(key) {
      try {
          const raw = localStorage.getItem(key);
          if (!raw) return null;
          const obj = JSON.parse(raw);
          if (!obj || typeof obj !== 'object') return null;
          if (obj.expires && obj.expires < nowMs()) return null; // expired
          return obj; // { data, etag, expires }
      } catch {
          return null;
      }
  }

  // ✨ CACHE: write to localStorage with TTL
  function cacheSet(key, { data, etag = null, ttl = CACHE_TTL_MS }) {
      try {
          const payload = {
              data,
              etag,
              expires: nowMs() + Math.max(1_000, ttl),
          };
          
          localStorage.setItem(key, JSON.stringify(payload));
      } catch {
          // ignore quota errors silently
      }
  }

  // ✨ CACHE: convenience to show cached data immediately if present
  function primeStateFromCache(cacheKey, setter) {
      const cached = cacheGet(cacheKey);
      if (cached?.data) setter(cached.data);
      return cached; // return to reuse its etag
  }