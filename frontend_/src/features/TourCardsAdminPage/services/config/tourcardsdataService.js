/**
 * Executes the network fetch for tour landing data, handling immediate response checks (304, etc.).
 * * @param {string} apiBaseTour - The base API URL.
 * @param {object} headers - Headers object containing ETag, etc.
 * @param {AbortSignal} signal - Signal used to abort the request.
 * @param {number} reqId - The ID of the current request (for stale-response guard).
 * @param {object} currentReqIdRef - React ref object holding the latest request ID.
 * @param {object} cachedEntry - The currently cached data entry.
 * @param {Array} updateNeeded - Array indicating probe status (updateNeeded[0] is the status code).
 * @returns {Promise<{status: number, data: object|null}>} The response status and parsed data.
 */
export async function performNetworkFetch({ 
    apiBaseTour, 
    headers, 
    signal, 
    reqId, 
    currentReqIdRef, 
    cachedEntry, 
    updateNeeded 
}) {
    const TOUR_ENDPOINT = '/api/tc/tour-cards';

    try {
        const res = await fetch(`${apiBaseTour}${TOUR_ENDPOINT}`, { headers, signal });
        
        // 1. Stale Response Guard (Prevents an old fetch from overwriting a new one)
        if (reqId !== currentReqIdRef.current) {
            console.warn('NetworkFetch: ignoring stale response (reqId)', { reqId, currentReqId: currentReqIdRef.current });
            // Return status 0 to indicate the request was ignored/stale
            return { status: 0, data: null }; 
        }

        // 2. 304 Not Modified Check (ETag matched, use cache)
        // Note: The logic for checking updateNeeded[0] === 0 assumes 0 means "no update needed/stale"
        if (res.status === 304 && cachedEntry?.data && updateNeeded[0] === 0) {
            console.log("♻️ NetworkFetch: 304, Using cached data.");
            // Return 304 status and the cached data
            return { status: 304, data: cachedEntry.data };
        }

        // 3. Non-OK Response Check
        if (!res.ok) {
            console.error('NetworkFetch: non-ok response', res.status);
            throw new Error(`HTTP Error: ${res.status}`);
        }

        // 4. Successful JSON Parsing
        let data;
        try {
            data = await res.json();
            return { status: res.status, data };
        } catch (error) {
            console.error('❌ NetworkFetch: Failed to parse data:', error);
            throw new Error('Failed to parse response JSON.');
        }

    } catch (err) {
        if (err.name === 'AbortError') {
            console.log('NetworkFetch: aborted by controller.');
            throw new Error('Aborted');
        }
        console.error('NetworkFetch: fetch failed', err);
        throw err;
    }
}