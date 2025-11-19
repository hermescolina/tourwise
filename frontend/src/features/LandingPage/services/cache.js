const TOUR_CACHE_KEY = 'tourLandingData';

/**
 * Reads the cache.
 * It looks for an object with 'data' and 'etag' properties.
 */
export const getCachedTourData = () => {
  try {
    // 1. Get the raw string from localStorage.
    const raw = localStorage.getItem(TOUR_CACHE_KEY);
    if (!raw) {
      console.log("CACHE [GET]: No entry found.");
      return null; // A "cache miss"
    }

    // 2. Safely parse the JSON string into an object.
    const cached = JSON.parse(raw);
    
    // 3. Validate the object. Does it have the properties we need?
    if (cached && cached.data && typeof cached.etag === 'string') {
      console.log("CACHE [GET]: Hit! Found data and etag.", { etag: cached.etag });
      return { data: cached.data, etag: cached.etag };
    }

    // If the data is corrupted or in an old format, treat it as a miss.
    console.warn("CACHE [GET]: Found an invalid cache entry. Ignoring.");
    return null;

  } catch (error) {
    // If JSON.parse fails, the cache is corrupted.
    console.error("CACHE [GET]: Error reading or parsing cache.", error);
    return null;
  }
};

/**
 * Writes to the cache.
 * It stores the data, the ETag, and a timestamp for debugging.
 */
export const setCachedTourData = (data, etag) => {
  // 1. Basic validation to prevent writing bad data.
  if (!data || !etag) {
    console.error("CACHE [SET]: Aborted. Missing data or etag.");
    return;
  }

  try {
    // 2. Create the object we want to store.
    const cacheEntry = {
      data,
      etag,
      fetchedAt: Date.now(),
    };
    
    // 3. Convert the object to a JSON string and save it.
    localStorage.setItem(TOUR_CACHE_KEY, JSON.stringify(cacheEntry));
    console.log("CACHE [SET]: Wrote new data successfully.", { etag });

  } catch (err) {
    // This can happen if localStorage is full.
    console.error('CACHE [SET]: Failed to write to localStorage.', err);
  }
};