/**
 * Service to fetch specific tour page data by slug.
 */
export async function performNetworkFetch({ 
    apiBaseTour, 
    slug,
    headers, 
    signal, 
    reqId, 
    currentReqIdRef, 
    cachedEntry, 
    updateNeeded 
}) {
    const TOUR_ENDPOINT = `/api/tp/tourpages-data/${encodeURIComponent(slug)}`;

    try {
        const res = await fetch(`${apiBaseTour}${TOUR_ENDPOINT}`, { headers, signal });
        
        // 1. Stale Response Guard
        if (reqId !== currentReqIdRef.current) {
            return { status: 0, data: null, etag: null }; 
        }

        // 2. 304 Not Modified Check
        if (res.status === 304 && cachedEntry?.data) {
            return { status: 304, data: cachedEntry.data, etag: cachedEntry.etag };
        }

        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);

        const data = await res.json();
        const etag = res.headers.get('ETag'); 

        return { status: res.status, data, etag };

    } catch (err) {
        if (err.name === 'AbortError') throw new Error('Aborted');
        throw err;
    }
}