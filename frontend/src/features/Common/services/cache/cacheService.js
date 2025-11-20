// cacheService.js

// Constants
export const TOUR_LANDING_CACHE_KEY = 'tour-data-landing';
export const TOUR_CARDS_CACHE_KEY = 'tour-cards-data';

// Utility to get current timestamp
const nowMs = () => Date.now();

/**
 * Reads data from localStorage. No expiration check is performed here; 
 * freshness is dictated by the ETag/304 response in the main fetch.
 * * @param {string} key 
 * @returns {{ data: any, etag: string, fetchedAt: number } | null}
 */
export function cacheGet(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;

        const obj = JSON.parse(raw);
        if (!obj || typeof obj !== 'object') return null;

        obj.fetchedAt = Number(obj.fetchedAt) || nowMs();
        
        console.log(`[CacheService] cacheGet: Found data for ${key}. ETag: ${obj.etag}`);
        return obj; // { data, etag, fetchedAt }
    } catch (e) {
        console.error("[CacheService] cacheGet: failed to read/parse cache key", key, e);
        return null;
    }
}


/**
 * Writes data to localStorage. Stores data, ETag, and fetchedAt timestamp.
 * Uses a basic stale-write guard.
 * * @param {string} key 
 * @param {{ data: any, etag?: string, fetchedAt?: number }} payload
 * @returns {boolean} success
 */
export function cacheSet(key, { data, etag = null, fetchedAt = null }) {
    const now = nowMs();
    const incomingFetchedAt = fetchedAt ? Number(fetchedAt) : now;
    const payload = {
        data,
        etag,
        fetchedAt: incomingFetchedAt,
        // Using a near-infinite expiry as cache control is ETag-driven
        expires: incomingFetchedAt + (365 * 24 * 60 * 60 * 1000) 
    };

    try {
        const rawExisting = localStorage.getItem(key);
        if (rawExisting) {
            try {
                const existing = JSON.parse(rawExisting);
                const existingFetchedAt = Number(existing?.fetchedAt) || 0;
                // Prevent stale overwrite
                if (existingFetchedAt > incomingFetchedAt) {
                    console.warn(`[CacheService] cacheSet: skipping stale write for ${key}`);
                    return false;
                }
            } catch (e) {
                // Ignore parse error on existing, will overwrite
            }
        }

        localStorage.setItem(key, JSON.stringify(payload));
        console.log(`[CacheService] cacheSet: wrote ${key} (ETag: ${etag})`);
        return true;
    } catch (err) {
        console.error('[CacheService] cacheSet: localStorage.setItem failed', err);
        return false;
    }
}

/**
 * Convenience to show cached data immediately if present (SWR Phase 1: Render Stale).
 * * @param {string} cacheKey 
 * @param {function} setter State setter function (e.g., setItems)
 * @returns {object | null} cached entry
 */
export function primeStateFromCache(cacheKey, setter) {
    const cached = cacheGet(cacheKey);
    if (cached?.data) {
        setter(cached.data);
        if (cached.data?.title) {
            document.title = `TourWise | ${cached.data.title}`;
        }
    }
    return cached; // return to reuse its etag
}

/**
 * Safely parses a JSON string, useful for cleaning up API array data.
 * @param {*} value 
 * @returns {object | null}
 */
export function tryParse(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === "object") return value;
    if (typeof value !== "string") return null;
    try {
        return JSON.parse(value);
    } catch (err) {
        return null;
    }
}