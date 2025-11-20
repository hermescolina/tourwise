// src/hooks/useTourData.js
import { useState, useEffect, useRef } from 'react';
import { apiBaseTour } from '@/config'; 
import { parseAndNormalizeItems } from '@LandingPage/utilities/dataProcessor'; 
import { performNetworkFetch } from '@LandingPage/services/config/tourdataService'; 


// Import necessary functions from your cache service
// Assuming the path is correct relative to the hook's location:
import { 
    TOUR_LANDING_CACHE_KEY, 
    cacheSet, 
    cacheGet, 
} from '@Common/services/cache/cacheService'; 

/**
 * Custom Hook for fetching tour data using an ETag/304 (Redis-SET-driven) cache strategy (SWR pattern).
 * @returns {{ items: Array, isLoading: boolean, error: Error | null }}
 */
export function useTourData() {
    const isMountedRef = useRef(false); // ✨ NEW: Ref to track initial mount cycle
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const currentControllerRef = useRef(null);
    const currentReqIdRef = useRef(0);
  
    // Inside fetchTourData in your useTourData.js hook

    const fetchTourData = async () => {
        // ... (State setup, cache retrieval, clientVer, headers, AbortController setup) ...
        const reqId = ++currentReqIdRef.current;
        let cachedEntry = cacheGet(TOUR_LANDING_CACHE_KEY); 
        const clientVer = cachedEntry?.etag;
        
        // --- Step 1: Pre-fetch Setup ---
        const headers = {};
        if (clientVer) {
            headers['If-None-Match'] = clientVer;
        }
        const controller = new AbortController();
        currentControllerRef.current = controller;
        const signal = controller.signal;
        
        // Note: If you are using probeBackend(), you need to call it here to get 'updateNeeded'
        // Assuming for simplicity that updateNeeded is always [0, ...] for now,
        // or you call probeBackend before this step.
        const updateNeeded = [0]; 

        // --- Step 2: Execute Network Fetch and Handle Side Effects ---
        try {
            const { status, data } = await performNetworkFetch({ 
                apiBaseTour, 
                headers, 
                signal, 
                reqId, 
                currentReqIdRef, 
                cachedEntry, 
                updateNeeded 
            });

            // Get the current version from the server's cache/database (needed for cacheSet)
            const finalEtag = status !== 304 ? data?.etag : cachedEntry.etag; 

            if (status === 0) {
                // Stale request was ignored. Do nothing.
                return;
            }

            if (status === 304) {
                // A. Handle 304 Not Modified
                console.log("♻️ Hook Logic: 304 received. Refreshing cache metadata.");
                
                // Re-cache metadata to update fetchedAt time
                cacheSet(TOUR_LANDING_CACHE_KEY, { 
                    data: data, // data contains cachedEntry.data from the network service
                    etag: finalEtag,
                    fetchedAt: Date.now() 
                });
                // Ensure items are displayed if they weren't already (SWR)
                setItems(parseAndNormalizeItems(data)); 

            } else if (status >= 200 && status < 300) {
                // B. Handle 200 OK (New Data)
                console.log("✅ Hook Logic: 200 OK received. Updating data and cache.");

                // Update cache with fresh data
                cacheSet(TOUR_LANDING_CACHE_KEY, { 
                    data: data, 
                    etag: finalEtag, // Use the ETag received in the 200 response header
                    fetchedAt: Date.now() 
                });
                setItems(parseAndNormalizeItems(data));

            } else {
                // C. Handle unexpected status code returned by the service (e.g., 500)
                console.error(`Hook Logic: Unexpected status ${status}.`);
                // Fallback: If error occurred and cache was present, do nothing (keep stale data).
            }
            
        } catch (err) {
            // D. Handle Network/Aborted Errors
            if (err.message === 'Aborted') {
                console.log('[useTourData] Fetch aborted by controller. (Ignored)'); 
                return; 
            }

            console.error('[useTourData] Fetch failed:', err);
            setError(err);
            
            // Only stop the loader if there was no existing cache data
            if (!cachedEntry) {
                setIsLoading(false);
            }

        } finally {
            // Stop loading indicator only after the network call finishes
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchTourData();

            if (!isMountedRef.current) {
                isMountedRef.current = true;
                // Skip the cleanup setup on the very first mount
                return;
            }
            
            // Cleanup function only runs if the component has fully mounted previously
            return () => {
                if (currentControllerRef.current) {
                    try {
                        console.log("[useTourData] Cleanup: Aborting in-flight request.");
                        currentControllerRef.current.abort();
                    } catch (_) {}
                }
            };
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []); // Dependency array remains empty

    return { items, isLoading, error };
}