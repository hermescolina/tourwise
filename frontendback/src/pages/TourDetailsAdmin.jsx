import { apiBaseTour } from '../config';
import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import styles from './TourDetailsAdmin.module.css';

// ✨ CACHE: add lightweight cache helpers + defaults
const nowMs = () => Date.now();
const CACHE_TTL_MS = 60 * 60 * 1000; // ✨ CACHE: 5 minutes default TTL
    // ✨ CACHE: simple time helper

    
function parseTips(tips) {
  if (!tips || !Array.isArray(tips)) return [];
  
  return tips
    .flatMap(item => item.split(",")) // split each element by comma
    .map(s => s.trim())               // trim whitespace
    .filter(Boolean);                 // remove empty strings
}



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
    console.log("....raw",raw);
    const obj = JSON.parse(raw);
    
    if (!obj || typeof obj !== 'object') return null;

    // normalize numeric fields (protect against strings)
    const now = nowMs();
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
    console.log("....obj", obj.expires,Date.now())
    if (expiresNum < now) return null;
    // normalize back into the object so callers see numbers
    obj.expires = expiresNum;
    if (!Number.isNaN(fetchedAtNum)) obj.fetchedAt = fetchedAtNum;
    // debug lines you had

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
  const payload = {
    data,
    etag,
    fetchedAt: incomingFetchedAt,
    expires: now + Math.max(0, CACHE_TTL_MS),
  };

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
    console.log(".... Inside", cached)
    if (cached?.data) setter(cached.data);
    return cached; // return to reuse its etag
}

async function probeBackend(clientVer) {
  const PROBE_URL = `${apiBaseTour}/api/ti/touritinerary-probe`;
  const res = await fetch(`${PROBE_URL}?ver=${encodeURIComponent(clientVer || "")}`, { cache: "no-store" });
  if (!res.ok) throw new Error("probe failed: " + res.status);
  const text = (await res.text()).trim();
  return text; // raw value from backend
}


export default function TourDetailsAdmin() {
    const { slug } = useParams();
    const [tour, setTour] = useState(null);
    const [message, setMessage] = useState('');

    const [searchParams] = useSearchParams();

    const PROBE_INTERVAL_MS = 60_000; // 1 minute

    
    function skipFetchUseCache(cachedEntry, ttl, setTour) {
        const now = Date.now();
        const expiresAt = cachedEntry.expires;
        const remainingMs = Math.max(0, expiresAt - now);
        const writtenAt = expiresAt - ttl;
        const ageMs = Math.max(0, now - writtenAt);
        console.log(".... Skipping fetch — TTL still valid:", {
            ttl,
            ageMs,
            remainingMs,
            writtenAt: new Date(writtenAt).toLocaleString(),
            expiresAt: new Date(expiresAt).toLocaleString()
        });
        setTour(cachedEntry.data || []);
        return; // important: skip network when TTL valid
    }

    
    // module-level (once)
    const inFlightProbes = new Map();  // key -> Promise
    const _lastProbeAt = new Map();    // key -> nextAllowedTimestamp
    let currentReqId = 0;
    let currentController = null;

    const fetchWithStrategy = async (slug) => {
    const TOUR_CACHE_KEY = `BrowseTours:/api/ti/touritinerary-data/${slug}`;
    const key = TOUR_CACHE_KEY;
    const reqId = ++currentReqId;
    let ttl_flag = 0;

    console.log("... check 11",slug, key)

    // Cancel previous pending fetch for fetch API (if any)
    if (currentController) {
        try { currentController.abort(); } catch (_) {}
    }
    // 1) Prime UI from cache (fast paint)
    const cachedEntry = primeStateFromCache(TOUR_CACHE_KEY, (cachedData) => {
        console.log("... cachedData", cachedData);
        setTour(cachedData);
        // setTourVideos(cachedData?.videos || []);
        if (cachedData?.title) document.title = `TourWise | ${cachedData.title}`;
    });

    
    const strategy = searchParams.get('strategy');
    const finalSTR = (strategy || window.__CACHE_STRATEGY__ || 'ETAGONLY').toUpperCase();
    const ttl = parseTTLms(finalSTR);
    // Only consider cache-based short-circuit when TTL valid
    console.log("...cachedEntry?.expires", cachedEntry?.expires, Date.now())
    console.log(".... ttl data", Date.now() < cachedEntry?.expires, ttl,cachedEntry)

    if (
        ttl > 0 &&
        cachedEntry &&
        typeof cachedEntry?.expires === 'number' &&
        Date.now() < cachedEntry?.expires
    ) {
        // ensure clientVer is defined
        
        const clientVer = cachedEntry?.etag ?? "";
        const now = Date.now();
        const nextAllowed = _lastProbeAt.get(key) || 0;

        console.log("...now < nextAllowed",now < nextAllowed,now, nextAllowed)
        // If still inside cooldown, use cache and stop
        if (now < nextAllowed) {
            console.log("⏳ Skipping fetch — still within probe interval", { now, nextAllowed });
            skipFetchUseCache(cachedEntry, ttl, setTour);
            return; // stop here
        }
        
        //1122
        // If a probe is already in flight for this key, wait on it, then reuse cache
        if (inFlightProbes.has(key)) {
            console.log("➡️ Probe already running for key, awaiting existing probe");
            try {
                await inFlightProbes.get(key);
            } catch (e) {
                console.warn("inFlight probe failed", e);
            }
            // after awaiting the probe, cachedEntry should still be valid — reuse it
            skipFetchUseCache(cachedEntry, ttl, setTour);
            return;
        }
        
        // Reserve next allowed probe time immediately to avoid races
        console.log("... inside probe",PROBE_INTERVAL_MS)
        _lastProbeAt.set(key, Date.now() + PROBE_INTERVAL_MS);
        console.log("... inside probe")
        // Start the probe (store the Promise so other callers can await)
        const probePromise = (async () => {
        try {
            
            const updateNeeded = await probeBackend(clientVer);
            console.log("... updatedneeded",updateNeeded)

            if (updateNeeded === "0") {
                console.log("... probe says no update — use cache");
                skipFetchUseCache(cachedEntry, ttl, setTour);
                return { stoppedEarly: true };
            } else {
                ttl_flag = 1;
            }

            // probe indicates update needed; caller will continue to actual fetch afterwards
            console.log("... probe says updateNeeded, proceed to network fetch");
            // return { stoppedEarly: false };
        } catch (err) {
            console.error("probeBackend error:", err);
            // Allow retry later by removing nextAllowed marker
            _lastProbeAt.delete(key);
            throw err;
        } finally {
            inFlightProbes.delete(key);
        }
        })();
        
        // save the promise so concurrent calls won't start a second probe
        inFlightProbes.set(key, probePromise);

        // wait for the probe to finish, and inspect result
        let probeResult;
        try {
            probeResult = await probePromise;
        } catch (err) {
        // probe failed — decide your fallback: here we bail out and reuse cache
            console.warn("probe failed, falling back to cache:", err);
            skipFetchUseCache(cachedEntry, ttl, setTour);
            return;
        }

        // If the probe told us to stop early, we already used cache above
        if (probeResult?.stoppedEarly) {
            return;
        }

        // else: probe indicates updateNeeded !== "0", so fallthrough to actual fetch
    }

    // ---- actual network fetch (runs only if TTL invalid or probe decided updateNeeded) ----
    const headers = {};
    if (cachedEntry?.etag) {
        headers['If-None-Match'] = cachedEntry.etag;
        console.log(".... → Sending If-None-Match:", headers['If-None-Match']);
    }

    currentController = new AbortController();
    const signal = currentController.signal;
    
    console.log("... check 3",signal)
    try {
        const res = await fetch(`${apiBaseTour}/api/ti/touritinerary-data/${encodeURIComponent(slug)}`);
        // stale-response guard
        if (reqId !== currentReqId && ttl_flag === 0) {
            console.warn('fetchWithStrategy: ignoring stale response (reqId)', { reqId, currentReqId });
            return;
        }

        console.log("... check 4",res.status)

        // 304 → reuse cached entry and update expires perhaps
        console.log("... res status", res.status)
        if (res.status === 304 && cachedEntry?.data) {
            console.log(".... ♻️ Using cached data, ETag matched:", cachedEntry.etag);
            cacheSet(TOUR_CACHE_KEY, { data: cachedEntry.data, etag: cachedEntry.etag, ttl, fetchedAt: Date.now() });
            setTour(cachedEntry.data || []);
            return;
        }
        console.log("... check 5",res.ok)
        if (!res.ok) {
            console.error('fetchWithStrategy: non-ok response', res.status);
            return;
        }

        let data;
        try {
            data = await res.json();
        } catch (error) {
            console.error('❌ Failed to parse data:', error);
            return;
        }
        
        const etag = res.headers.get('ETag') || null;

        console.log("... etag", etag)
        
        cacheSet(TOUR_CACHE_KEY, { data, etag, ttl, fetchedAt: Date.now() });
        console.log("... check 6",ttl_flag)
        if (reqId === currentReqId || ttl_flag === 1) {
            console.log("... check 7")
            // setTour(data || []);
            // setTour(Array.isArray(data) ? data : [data]);
            setTour(data);
            console.log("...done");
            console.log("reqId, currentReqId", reqId, currentReqId, "data", data);

        } else {
            console.warn('fetchWithStrategy: response arrived but request is stale, ignoring setTour');
        }
    } catch (err) {
        if (err.name === 'AbortError') {
            console.log('fetchWithStrategy: aborted previous fetch');
        } else {
            console.error('fetchWithStrategy: fetch failed', err);
        }
    }
    };
    
    useEffect(() => {
        fetchWithStrategy(slug);
    }, []);


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
    // console.log("... tour", tour.tour?.exclusions)
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
            {/* {console.log("...tips ",tour.tips ? tour.tips.split(",") : [])} */}
            <label>💡 Tips for Visitors:</label>
            <textarea
                className={styles.textarea}
                value={(tour.tips || []).join("\n")} // show each tip on its own line
                onChange={(e) => {
                    // Convert textarea back to array, split by newlines, remove empty lines
                    const updatedTips = e.target.value
                    .split("\n")
                    .map(s => s.trim())
                    .filter(Boolean);

                    console.log("Updated tips array:", updatedTips); // debug
                    handleChange('tips', updatedTips); // update tour state
                }}
            />


            <button onClick={addItinerary} className={styles.addBtn}>➕ Add Itinerary</button>
            <button onClick={handleSave} className={styles.saveBtn}>💾 Save All</button>

            {message && <p className={styles.success}>{message}</p>}
        </div>
    );
}
