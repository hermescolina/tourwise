// @TourCardsAdminPage/services/config/tourcardsAdmindataService.js
/**
 * Executes the network fetch for tour cards admin data, handling 304/ETag.
 * @param {string} apiBaseTour - The base API URL.
 * @param {object} headers - Headers object containing ETag, etc.
 * @param {AbortSignal} signal - Signal used to abort the request.
 * @param {number} reqId - The ID of the current request.
 * @param {object} currentReqIdRef - React ref holding the latest request ID.
 * @param {object} cachedEntry - The currently cached data entry.
 * @param {Array} updateNeeded - Array indicating probe status.
 * @returns {Promise<{status: number, data: object|null}>}
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
    const TOUR_ENDPOINT = '/api/tca/tourcardsadmin-data';

    try {
        const res = await fetch(`${apiBaseTour}${TOUR_ENDPOINT}`, { headers, signal });

        // Stale response guard
        if (reqId!== currentReqIdRef.current) {
            console.warn('NetworkFetch: ignoring stale response', { reqId, currentReqId: currentReqIdRef.current });
            return { status: 0, data: null };
        }

        // 304 Not Modified
        if (res.status === 304 && cachedEntry?.data && updateNeeded[0] === 0) {
            console.log("♻ NetworkFetch: 304, Using cached data.");
            return { status: 304, data: cachedEntry.data };
        }

        if (!res.ok) {
            console.error('NetworkFetch: non-ok response', res.status);
            throw new Error(`HTTP Error: ${res.status}`);
        }

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