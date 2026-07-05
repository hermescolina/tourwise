// @TourCardsAdminPage/hooks/useTourCardsAdminData.js
import { useState, useEffect, useRef } from 'react';
import { apiBaseTour } from '@/config';
import { parseAndNormalizeItems } from '@Common/utilities/dataProcessor';
import { performNetworkFetch } from '@TourCardsAdminPage/services/config/tourcardsAdmindataService';
import {
    TOUR_CARDS_ADMIN_CACHE_KEY,
    cacheSet,
    cacheGet,
} from '@Common/services/cache/cacheService';

/**
 * Custom Hook for fetching tour cards admin data using ETag/304 cache strategy.
 * @returns {{ items: Array, isLoading: boolean, error: Error | null }}
 */
export function useTourCardsAdminData() {
    const isMountedRef = useRef(false);
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const currentControllerRef = useRef(null);
    const currentReqIdRef = useRef(0);

    const fetchTourCardsAdminData = async () => {
        const reqId = ++currentReqIdRef.current;
        let cachedEntry = cacheGet(TOUR_CARDS_ADMIN_CACHE_KEY);
        const clientVer = cachedEntry?.etag;

        const headers = {};
        if (clientVer) {
            headers['If-None-Match'] = clientVer;
        }

        const controller = new AbortController();
        currentControllerRef.current = controller;
        const signal = controller.signal;
        const updateNeeded = [0];

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

            const finalEtag = status!== 304? data?.etag : cachedEntry.etag;

            if (status === 0) return;

            if (status === 304) {
                console.log("♻ Hook Logic: 304 received. Refreshing cache metadata.");
                cacheSet(TOUR_CARDS_ADMIN_CACHE_KEY, {
                    data: data,
                    etag: finalEtag,
                    fetchedAt: Date.now()
                });
                setItems(parseAndNormalizeItems(data, "tour"));

            } else if (status >= 200 && status < 300) {
                console.log("✅ Hook Logic: 200 OK received. Updating data and cache.");
                cacheSet(TOUR_CARDS_ADMIN_CACHE_KEY, {
                    data: data,
                    etag: finalEtag,
                    fetchedAt: Date.now()
                });
                setItems(parseAndNormalizeItems(data, "tour"));

            } else {
                console.error(`Hook Logic: Unexpected status ${status}.`);
            }

        } catch (err) {
            if (err.message === 'Aborted') {
                console.log('[useTourCardsAdminData] Fetch aborted by controller.');
                return;
            }
            console.error('[useTourCardsAdminData] Fetch failed:', err);
            setError(err);
            if (!cachedEntry) setIsLoading(false);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchTourCardsAdminData();

        if (!isMountedRef.current) {
            isMountedRef.current = true;
            return;
        }

        return () => {
            if (currentControllerRef.current) {
                try {
                    console.log("[useTourCardsAdminData] Cleanup: Aborting in-flight request.");
                    currentControllerRef.current.abort();
                } catch (_) {}
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { items, isLoading, error };
}