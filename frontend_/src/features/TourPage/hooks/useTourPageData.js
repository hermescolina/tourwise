import { useState, useEffect, useRef } from 'react';
import { apiBaseTour } from '@/config'; 
import { performNetworkFetch } from '@TourPage/services/config/tourpagesdataService'; 
import { cacheSet, cacheGet } from '@Common/services/cache/cacheService'; 

const memoryCache = new Map(); 
const MEMORY_TTL = 30 * 1000; // 30 seconds in milliseconds

export function useTourPageData(slug) {
    const [tourState, setTourState] = useState({
        tour: null, history_images: [], tips: [], tour_itinerary: [], tourVideos: []
    });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const currentReqIdRef = useRef(0);
    const currentControllerRef = useRef(null);

    const normalize = (raw) => {
        const tourObj = Array.isArray(raw) ? (raw[0] || null) : raw;
        return {
            tour: tourObj,
            tourVideos: Array.isArray(tourObj?.videos) ? tourObj.videos : [],
            tips: Array.isArray(tourObj?.item?.tips) ? tourObj.item.tips : [],
            tour_itinerary: Array.isArray(tourObj?.item?.tour_itinerary) ? tourObj.item.tour_itinerary : [],
            history_images: Array.isArray(tourObj?.history_images) ? tourObj.history_images : []
        };
    };

    const fetchData = async () => {
        const CACHE_KEY = `TP-${slug}.json`;
        const reqId = ++currentReqIdRef.current;

        const now = Date.now();

        // 2. Phase I CHECK MEMORY CACHE FIRST
        const memEntry = memoryCache.get(CACHE_KEY);
        if (memEntry && (now - memEntry.timestamp < MEMORY_TTL)) {
            console.log("🧠 MEMORY HIT: Returning fresh RAM data (No network call needed)");
            setTourState(normalize(memEntry.data));
            setIsLoading(false);
            return; // EXIT EARLY: We are within 30 seconds, don't even talk to the server
        }

        // Phase II: Cache Load
        const cached = cacheGet(CACHE_KEY);
        if (cached?.data) {
            setTourState(normalize(cached.data));
            setIsLoading(false);
        }

        console.group(`🔍 Tour Fetch Strategy: ${slug} (Req #${reqId})`);

        const controller = new AbortController();
        currentControllerRef.current = controller;

        try {
            const { status, data, etag } = await performNetworkFetch({
                apiBaseTour, slug, reqId, currentReqIdRef, 
                cachedEntry: cached, signal: controller.signal,
                headers: cached?.etag ? { 'If-None-Match': cached.etag } : {},
            });
            console.log("status",status)
            if (status === 200) {
                cacheSet(CACHE_KEY, { data, etag, fetchedAt: Date.now() });
                setTourState(normalize(data));
            }
        } catch (err) {
            if (err.message !== 'Aborted') setError(err); 
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        return () => currentControllerRef.current?.abort();
    }, [slug]);

    return { ...tourState, isLoading, error };
}