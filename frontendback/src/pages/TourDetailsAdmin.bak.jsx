import { apiBaseTour } from '../config';
import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import styles from './TourDetailsAdmin.module.css';

// ✨ CACHE: add lightweight cache helpers + defaults
const CACHE_TTL_MS = 360 * 60 * 1000; // ✨ CACHE: 5 minutes default TTL
const nowMs = () => Date.now();     // ✨ CACHE: simple time helper

const parseTTLms = (strategy) => {
    if (typeof strategy !== "string" || !strategy.startsWith("TTL")) return 0;

    const unit = strategy.slice(3).toUpperCase(); // e.g., "5M", "1H"
    const n = parseInt(unit, 10);

    if (!Number.isFinite(n) || n <= 0) return 0;

    if (unit.endsWith("S")) return n * 1000;               // seconds
    if (unit.endsWith("M")) return n * 60 * 1000;          // minutes
    if (unit.endsWith("H")) return n * 60 * 60 * 1000;     // hours
    if (unit.endsWith("D")) return n * 24 * 60 * 60 * 1000; // days

    return 0; // unknown unit
};

// ✨ CACHE: read from localStorage, validate expiration
function cacheGet(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return null;

    // normalize numeric fields (protect against strings)
    const now = nowMs();
    console.log("222 now from cacheGet", nowMs())
    console.log("333 expires from cacheGet", obj.expires)
    const expiresNum = obj.expires ? Number(obj.expires) : NaN;
    const fetchedAtNum = obj.fetchedAt ? Number(obj.fetchedAt) : NaN;

    if (Number.isNaN(expiresNum)) {
      console.warn(`cacheGet: ${key} has non-numeric expires ->`, obj.expires);
      return null;
    }

    // If expires is way far in the future, warn (helps detect wrong-ttl writes)
    const remaining = expiresNum - now;
    if (remaining > 24 * 60 * 60 * 1000) { // greater than 24 hours
      console.warn(`cacheGet: ${key} expires far in future (${(remaining/3600000).toFixed(2)}h). Possible stale write?`, { expires: expiresNum, now });
    }

    // expired -> treat as not found
    if (expiresNum < now) return null;

    // normalize back into the object so callers see numbers
    obj.expires = expiresNum;
    if (!Number.isNaN(fetchedAtNum)) obj.fetchedAt = fetchedAtNum;

    // debug lines you had
    console.log("... obj expires", obj.expires);
    console.log("... date now", now);

    return obj; // { data, etag, expires, fetchedAt? }
  } catch (e) {
    console.error("cacheGet: failed to read/parse cache key", key, e);
    return null;
  }
}


// ✨ CACHE: write to localStorage with TTL and fetchedAt guard
function cacheSet(key, { data, etag = null, ttl = CACHE_TTL_MS, fetchedAt = null }) {
  const now = nowMs();
  const incomingFetchedAt = fetchedAt ? Number(fetchedAt) : now;
  console.log("222 now from cacheSet", nowMs())
  const payload = {
    data,
    etag,
    fetchedAt: incomingFetchedAt,
    expires: now + Math.max(0, ttl),
  };

  console.log("333 expires from cacheSet",now + Math.max(0, ttl))

  try {
    const rawExisting = localStorage.getItem(key);
    if (rawExisting) {
      try {
        const existing = JSON.parse(rawExisting);
        const existingFetchedAt = existing && existing.fetchedAt ? Number(existing.fetchedAt) : 0;
        // Prevent stale overwrite: only write when incoming is newer-or-equal
        if (existingFetchedAt > incomingFetchedAt) {
          console.warn(`cacheSet: skipping stale write for ${key} (existing ${existingFetchedAt} > incoming ${incomingFetchedAt})`);
          return false;
        }
      } catch (e) {
        console.warn('cacheSet: failed to parse existing payload, will overwrite', e);
        // fallthrough to write
      }
    }

    localStorage.setItem(key, JSON.stringify(payload));
    console.log(`cacheSet: wrote ${key}`, { fetchedAt: incomingFetchedAt, expires: payload.expires, etag });
    return true;
  } catch (err) {
    console.error('cacheSet: localStorage.setItem failed', err);
    return false;
  }
}

// ✨ CACHE: convenience to show cached data immediately if present
function primeStateFromCache(cacheKey, setter) {
    const cached = cacheGet(cacheKey);
    if (cached?.data) setter(cached.data);
    return cached; // return to reuse its etag
}


export default function TourDetailsAdmin() {
    const { slug } = useParams();
    const [tour, setTour] = useState(null);
    const [message, setMessage] = useState('');

    const [searchParams] = useSearchParams();

    let currentReqId = 0;
    let currentController = null;

    useEffect(() => { 
        if (!slug) return;

        let cancelled = false;

        const TOUR_CACHE_KEY = `tour:${slug}`;
        const reqId = ++currentReqId;
        const startedAt = Date.now();
        
        // Cancel any previous pending fetch
        if (currentController) currentController.abort();
        currentController = new AbortController();
        const signal = currentController.signal;

        // 1) Prime UI from cache (fast paint)
        const cachedEntry = primeStateFromCache(TOUR_CACHE_KEY, (cachedData) => {
            setTour(cachedData);
            setTourVideos(cachedData?.videos || []);
            if (cachedData?.title) document.title = `TourWise | ${cachedData.title}`;
        });

        const strategy = searchParams.get('strategy');
        const finalSTR = (strategy || window.__CACHE_STRATEGY__ || 'ETAGONLY').toUpperCase();
        const ttl = parseTTLms(finalSTR);

        console.log(`....ttl data", ${cachedEntry}`)
        // console.log(`....ttl data", ${cachedEntry.expires} | ${cachedEntry.etag} | ${Date.now()}`)

        // 2) TTL check — skip fetch if cache still valid
        if (ttl > 0 && cachedEntry?.expires && Date.now() < cachedEntry.expires) {
            const now = Date.now();
            const expiresAt = cachedEntry.expires;
            const remainingMs = Math.max(0, expiresAt - now);
            const writtenAt = expiresAt - ttl;
            const ageMs = Math.max(0, now - writtenAt);

            console.log(".... Skipping fetch — TTL still valid:", {
                ttl,
                ageMs,
                remainingMs,
                writtenAt: new Date(writtenAt).toISOString(),
                expiresAt: new Date(expiresAt).toISOString()
            });

            // return; // optional skip
        }

        // 3) Prepare headers for ETag
        const headers = { Accept: 'application/json' };
        if (cachedEntry?.etag) {
            // headers['If-None-Match'] = cachedEntry.etag;
            console.log(".... → Sending If-None-Match:", headers['If-None-Match']);
        }

        (async () => {
            try {
                const url = `${apiBaseTour}/api/tour-itinerary/${encodeURIComponent(slug)}`;
                const res = await fetch(url, { headers, signal });

                if (
                    reqId !== currentReqId) {
                    console.log('...fetchWithStrategy: ignoring stale response', { reqId, currentReqId });
                    // console.warn('fetchWithStrategy: ignoring stale response', { reqId, currentReqId });
                    // return;
                }

                const text = await res.text(); // read once
                const contentType = (res.headers.get('content-type') || '').toLowerCase();
                
                console.log("... res.status", res.status)

                // Handle 304 / 204 / 404
                if (res.status === 304 && cachedEntry?.data) {
                    console.log(".... ♻️ Using cached data, ETag matched:", cachedEntry.etag);
                    cacheSet(TOUR_CACHE_KEY, { data: cachedEntry.data, etag: cachedEntry.etag, ttl, fetchedAt: Date.now() });
                    // return;
                }
                
                if ([204, 404].includes(res.status)) {
                    if (!cancelled) {
                        setTour({ slug, itinerary: [] });
                        setMessage('No itinerary yet');
                        console.log("...No itinerary yet");
                    }
                    // return;
                }

                if (!res.ok) {
                    const snippet = text.slice(0, 200);
                    // throw new Error(`HTTP ${res.status}: ${snippet}`);
                }

                let data = null;
                if (text && contentType.includes('application/json')) {
                    try { data = JSON.parse(text); } catch {}
                }
                // if (!data) return;

                cacheSet(TOUR_CACHE_KEY, { data, etag: res.headers.get("ETag") || null, ttl, fetchedAt: Date.now() });
                console.log("... done cacheSet", { data, etag: res.headers.get("ETag") || null, ttl, fetchedAt: Date.now() })
                if (reqId === currentReqId && !cancelled) {
                    const safe = data ?? { slug, tour_itinerary: [] };
                    setTour(safe);
                    console.log("111.... set tour done", safe)
                    if (!Array.isArray(safe.tour_itinerary) || safe.tour_itinerary.length === 0) {
                        setMessage('No itinerary yet');
                    }
                } else {
                    console.warn('fetchWithStrategy: response arrived but request is stale, ignoring setTour');
                }

                console.log(".... done")
            } catch (err) {
                if (!cancelled) {
                    console.error('❌ Error loading tour:', err);
                    setTour({ slug, tour_itinerary: [] });
                    setMessage('Failed to load tour');
                }
            }
        })();

        return () => { cancelled = true; currentController?.abort(); };
    }, [slug, apiBaseTour]);


    const handleChange = (field, value) => {
        setTour(prev => ({ ...prev, [field]: value }));
    };

    const handleItineraryChange = (index, key, value) => {
        const updated = [...tour.tour_itinerary];
        updated[index][key] = key === 'stops' ? value.split(',').map(s => s.trim()) : value;
        setTour(prev => ({ ...prev, tour_itinerary: updated }));
    };

    const addItinerary = () => {
        setTour(prev => ({
            ...prev,
            tour_itinerary: [...(prev.tour_itinerary || []), { label: '', title: '', time: '', stops: [] }]
        }));
    };

    // tiny helper: safely PUT JSON and return {ok,message}
    
    const putJSON = async (url, payload) => {
        const res = await fetch(url, {
            method: 'PUT',
            headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            },
            body: JSON.stringify(payload ?? {}),
        });

        // Treat 204 as success with no message
        if (res.status === 204) return { ok: true, message: '' };

        const ct = (res.headers.get('content-type') || '').toLowerCase();
        const text = await res.text();
        let data = null;
        if (text && ct.includes('application/json')) {
            try { data = JSON.parse(text); } catch { /* fall through */ }
        }

        if (!res.ok) {
            throw new Error(data?.error || `HTTP ${res.status}: ${text.slice(0,200)}`);
        }

        return { ok: true, message: data?.message || '' };
        };

//I am here: need to fix saves
    const handleSaveTips = async () => {
        const url = `${apiBaseTour}/api/tour-tips/${encodeURIComponent(slug)}`;
        const tips = Array.isArray(tour.tips)
            ? tour.tips
            : (typeof tour.tips === 'string' && tour.tips.trim() ? JSON.parse(tour.tips) : []);
        console.log("PAYLOAD ===>", tips)
        const r = await putJSON(url, { tips });
        return r.message || 'Tips saved!';
        };

    const handleSave = async () => {
        try {
            let combinedMessage = '';
            // ✅ correct endpoint (includes /api/tr)
            const itineraryUrl = `${apiBaseTour}/api/tour-itinerary/${encodeURIComponent(slug)}`;
            const r1 = await putJSON(itineraryUrl, tour);
            combinedMessage += (r1.message || 'Itinerary saved!') + ' ';
            const tipsMessage = await handleSaveTips();  // now returns a message
            combinedMessage += tipsMessage;
            setMessage(combinedMessage.trim());
            setTimeout(() => setMessage(''), 3000);
        } catch (err) {
            console.error('❌ Failed to save:', err);
            setMessage('Failed to save');
            setTimeout(() => setMessage(''), 3000);
        }
        };

    const removeItinerary = (indexToRemove) => {
        const updated = tour.tour_itinerary.filter((_, idx) => idx !== indexToRemove);
        setTour(prev => ({ ...prev, tour_itinerary: updated }));
    };

    if (!slug) return <p>Invalid or missing tour ID</p>;
    if (!tour) return <p>Loading...</p>;

    return (
        <div className={styles.tourAdmin}>
            <h2 className={styles.heading}>Tour Admin Interface</h2>

            <label>✅ Inclusions:</label>
            <textarea
                className={styles.textarea}
                value={tour.inclusions || ''}
                onChange={(e) => handleChange('inclusions', e.target.value)}
            />

            <label>⛔ Exclusions:</label>
            <textarea
                className={styles.textarea}
                value={tour.exclusions || ''}
                onChange={(e) => handleChange('exclusions', e.target.value)}
            />

            <h3 className={styles.subheading}>🧭 Tour Itinerary</h3>
            {(tour.tour_itinerary || []).map((item, idx) => (
                <div key={idx} className={styles.itineraryBox}>
                    <input
                        className={styles.input}
                        placeholder="Label (e.g., Tour A)"
                        value={item.label}
                        onChange={(e) => handleItineraryChange(idx, 'label', e.target.value)}
                    />
                    <input
                        className={styles.input}
                        placeholder="Title (e.g., Lagoons & Beaches)"
                        value={item.title}
                        onChange={(e) => handleItineraryChange(idx, 'title', e.target.value)}
                    />
                    <input
                        className={styles.input}
                        placeholder="Time (e.g., ~9AM–4PM)"
                        value={item.time}
                        onChange={(e) => handleItineraryChange(idx, 'time', e.target.value)}
                    />
                    <textarea
                        className={styles.textarea}
                        placeholder="Stops (comma-separated)"
                        value={item.stops.join(', ')}
                        onChange={(e) => handleItineraryChange(idx, 'stops', e.target.value)}
                        rows={2}
                    />
                    <button
                        onClick={() => removeItinerary(idx)}
                        className={styles.removeBtn}
                    >
                        🗑 Remove
                    </button>
                </div>
            ))}

            <label>💡 Tips for Visitors:</label>
            <textarea
                className={styles.textarea}
                value={tour.tips || ''}
                onChange={(e) => handleChange('tips', e.target.value)}
            />

            <button onClick={addItinerary} className={styles.addBtn}>➕ Add Itinerary</button>
            <button onClick={handleSave} className={styles.saveBtn}>💾 Save All</button>

            {message && <p className={styles.success}>{message}</p>}
        </div>
    );
}
