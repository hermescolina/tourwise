// (no change) import lines kept the same
import { apiBaseTour, frontendBase } from '../config';
import { useRef, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import styles from './TourPage.module.css';
import './TourPage.css';
import VideoPlayer from '../components/VideoPlayer';
import TourItinerary from '../components/TourItinerary';
import WhatsIncluded from '../components/WhatsIncluded';
import ShareMenu from "../components/ShareMenu";

const base = '/tourism-analytics';
const apiBase = apiBaseTour;
const urlBase = `${frontendBase}${base}`;

const handleReaction = (videoId, type) => {
    // console.log(`User reacted with ${type} on video ${videoId}`);
};

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
    expires: now + Math.max(0, ttl),
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
    if (cached?.data) setter(cached.data);
    return cached; // return to reuse its etag
}
//1133
// probeBackend — returns an object with res, text, and json (if JSON)
async function probeBackend(clientVer, slug = "") {
  const PROBE_URL = `${apiBaseTour}/api/tp/tourpages-probe`;
  const TIMEOUT_MS = 7000;
  const url = `${PROBE_URL}?ver=${encodeURIComponent(clientVer || "")}&slug=${encodeURIComponent(slug || "")}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    console.log("[probeBackend] fetching:", url, "navigator.onLine:", navigator.onLine);
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });

    if (!res.ok) {
      throw new Error("probe failed: " + res.status + (res.statusText ? ` ${res.statusText}` : ""));
    }

    const text = (await res.text()).trim();

    // attempt to parse JSON if content-type says so
    let json = null;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      try { json = JSON.parse(text); } catch (e) { /* ignore parse error */ }
    }

    return { res, text, json };
  } catch (err) {
    if (err.name === "AbortError") throw new Error(`probe timed out after ${TIMEOUT_MS} ms`);
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}




export default function TourPage() {
    const videoRefs = useRef([]); // array of DOM <video> elements
    const [activeIndex, setActiveIndex] = useState(0);
    const { slug } = useParams();
    const [tour, setTour] = useState(null);
    const [history_images, setHistory_images] = useState(null);
    const [tips, setTips] = useState(null);
    const [tour_itinerary, setTour_itinerary] = useState(null);
    const [error, setError] = useState('');
    const [selectedCategory, setSelectedCategory] = useState("Tour Videos");
    const [tourVideos, setTourVideos] = useState([]);
    const [showOverlay, setShowOverlay] = useState(false);

    const dateInputRef = useRef(null);
    const [selectedDate, setSelectedDate] = useState("");

    const [showMenu, setShowMenu] = useState(false);

    const categoryRef = useRef(null);
    const videoRef = useRef(null);

    const [searchParams] = useSearchParams();

    const PROBE_INTERVAL_MS = 60_000; // 1 minute

    // ✅ define backgroundVideos only once
    const backgroundVideos = tourVideos
        ?.filter(v => v.category === 'Tour Videos' && v.video_id)
        ?.slice(0, 3) || [];

    // ✅ autoplay cycle effect
    useEffect(() => {
        if (backgroundVideos.length <= 1) return;

        const interval = setInterval(() => {
            setActiveIndex(prev => (prev + 1) % backgroundVideos.length);
        }, 15000);

        return () => clearInterval(interval);
    }, [backgroundVideos.length]);

    
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

    function normalizeTourPayload(raw) {
        if (!raw) return { tourObj: null, videos: [], tips: [], tour_itinerary: [], history_images: [] };

        // If backend returns an array, pick the first element
        const tourObj = Array.isArray(raw) ? (raw[0] || null) : raw;
        
        // console.log("... normal tips", tourObj?.tips)
        // Ensure videos is always an array
        
        const videos = Array.isArray(tourObj?.videos)
            ? tourObj.videos
            : tourObj?.videos ? [tourObj.videos] : [];

        const tips = Array.isArray(tourObj?.item?.tips)
            ? tourObj.item.tips
            : tourObj?.item?.tips ? [tourObj?.item?.tips] : [];
        
        const tour_itinerary = Array.isArray(tourObj?.item?.tour_itinerary)
            ? tourObj.item.tour_itinerary
            : tourObj?.item?.tour_itinerary ? [tourObj?.item?.tour_itinerary] : [];

        const history_images = Array.isArray(tourObj?.history_images)
            ? tourObj.history_images
            : tourObj?.history_images ? [tourObj.history_images] : [];

        // console.log("... history_images caption", history_images[0]?.caption)

        return { tourObj, videos, tips , tour_itinerary, history_images};
    }

    // module-level (once)
    const inFlightProbes = new Map();  // key -> Promise
    const _lastProbeAt = new Map();    // key -> nextAllowedTimestamp
    
    let currentReqId = 0;
    let currentController = null;

    const fetchWithStrategy = async (slug) => {
    const TOUR_CACHE_KEY = `tour:${slug}`;
    const key = TOUR_CACHE_KEY;
    const reqId = ++currentReqId;
    let ttl_flag = 0;


    // Cancel previous pending fetch for fetch API (if any)
    if (currentController) {
        try { currentController.abort(); } catch (_) {}
    }
    
    // normalize raw cached/raw network data into a single tour object and videos array

    const cachedEntry = cacheGet(TOUR_CACHE_KEY);
        if (cachedEntry?.data) {
        const { tourObj, videos, tips, tour_itinerary , history_images} = normalizeTourPayload(cachedEntry.data);
        setHistory_images(history_images);
        setTips(tips);
        setTour_itinerary(tour_itinerary);
        setTour(tourObj);
        setTourVideos(videos);
        if (tourObj?.title) document.title = `TourWise | ${tourObj.title}`;
    }

    
    const strategy = searchParams.get('strategy');
    const finalSTR = (strategy || window.__CACHE_STRATEGY__ || 'ETAGONLY').toUpperCase();
    const ttl = parseTTLms(finalSTR);
    // Only consider cache-based short-circuit when TTL valid
    
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

        // If still inside cooldown, use cache and stop
        if (now < nextAllowed) {
            console.log("⏳ Skipping fetch — still within probe interval", { now, nextAllowed });
            skipFetchUseCache(cachedEntry, ttl, setTour);
            return; // stop here
        }
        
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
        _lastProbeAt.set(key, Date.now() + PROBE_INTERVAL_MS);
        // Start the probe (store the Promise so other callers can await)
        const probePromise = (async () => {
        try {
            
            const probeData = await probeBackend(clientVer);

            console.log("probeData",probeData)
    
            if (probeData.text === "0") {
                skipFetchUseCache(cachedEntry, ttl, setTour);
                return { stoppedEarly: true };
            }
            
            const etag = probeData.res.headers.get('ETag') || null;

            cacheSet(TOUR_CACHE_KEY, { probeData, etag, ttl, fetchedAt: Date.now() });
            setTour(data);
            setTourVideos(data.videos);
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
     console.log("signal", signal)
    try {
        const res = await fetch(`${apiBaseTour}/api/tp/tourpages-data/${encodeURIComponent(slug)}`);
        // stale-response guard
        console.log("check 1")
        if (reqId !== currentReqId && ttl_flag === 0) {
            console.warn('fetchWithStrategy: ignoring stale response (reqId)', { reqId, currentReqId });
            return;
        }
         console.log("check 2")

        
        // 304 → reuse cached entry and update expires perhaps
        if (res.status === 304 && cachedEntry?.data) {
            console.log(".... ♻️ Using cached data, ETag matched:", cachedEntry.etag);
            cacheSet(TOUR_CACHE_KEY, { data: cachedEntry.data, etag: cachedEntry.etag, ttl, fetchedAt: Date.now() });
            setTour(cachedEntry.data || []);
            setTourVideos(cachedEntry?.videos || []);
            return;
        }
        console.log("check 3")

        if (!res.ok) {
            console.error('fetchWithStrategy: non-ok response', res.status);
           return;
        } 

        console.log("check 4")
        let data;
        try {
            data = await res.json();
        } catch (error) {
            console.error('❌ Failed to parse data:', error);
            return;
        }
        
        const etag = res.headers.get('ETag') || null;
        console.log("check 5")
        
        

        if (reqId === currentReqId || ttl_flag === 1) {
            // setTour(data || []);
            console.log("... data after probe",res.status, tips)
            // const tourData = Array.isArray(data) ? data : [data];
            // console.log("... data become tourData",res.status, tourData)
            cacheSet(TOUR_CACHE_KEY, { data, etag, ttl, fetchedAt: Date.now() });
            if(ttl_flag === 1){
                console.log(`...check ${res.status}, reqId = ${reqId}, currentReqId ${currentReqId}`, Array.isArray(data) ? data : [data])
            }
            // setTour(Array.isArray(tourData) ? tourData : [tourData]);
            setTour(data);
            // setTourVideos(Array.isArray(tourData.videos) ? tourData.videos : [tourData.videos]);
            setTourVideos(data.videos);
            // if(ttl_flag === 1){
            //     console.log(`...check ${res.status}, reqId = ${reqId}, currentReqId ${currentReqId}`)
            // } else {
            //     console.log(`...check ttl flag = 0 ${res.status}, reqId = ${reqId}, currentReqId ${currentReqId}`)
            // }
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

    
    

    useEffect(() => {
        const handleScroll = () => {
            setShowOverlay(window.scrollY > 100);
        };

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);


    useEffect(() => {
        let lastScrollY = window.scrollY;

        const handleScroll = () => {
            const currentScrollY = window.scrollY;
            const scrollingDown = currentScrollY > lastScrollY;
            const videoLayers = document.querySelectorAll('[data-index]');

            if (scrollingDown && currentScrollY > 100) {
                videoLayers.forEach(el => {
                    el.classList.remove('videoLayer', 'active');
                    el.style.display = 'none';
                    el.style.opacity = '';
                });

            } else if (!scrollingDown && currentScrollY <= 100) {
                videoLayers.forEach((el, idx) => {
                    if (!el.classList.contains('videoLayer')) {
                        el.classList.add('videoLayer');
                    }
                    el.style.display = 'block';
                    el.classList.toggle('active', idx === 0);

                    // 🩹 Fix opacity if first video
                    if (idx === 0) {
                        el.style.opacity = '1';
                    } else {
                        el.style.opacity = '';
                    }
                });
            }
            lastScrollY = currentScrollY;
        };

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    
    if (error) return <div className={styles.tourContainer}>{error}</div>;
    if (!tour) return <div className={styles.tourContainer}>Loading...</div>;

    // console.log("... history_images", history_images[0].caption)
    const imagePath = tour?.item?.image || '';
    console.log("333 image path", imagePath )
    const imageUrl = imagePath.startsWith('/images/')
        ? `${urlBase}${imagePath.replace('/uploads', '')}`
        : `${apiBase}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;

    console.log("333 image path", imageUrl )

    const categories = [
        "Tips for Visitors",
        "Tour Itinerary",
        "About the Tour",
        "What to Expect",
        "History and Culture",
        "Tour Videos",
        "Tour Guides",
        "Tour Owner Info" // 👈 Added new category
    ];

    const handleCategoryChange = (e) => {
        const value = e.target.value;
        setSelectedCategory(value);

        // 🪄 History section on top just in case
        const historySection = document.querySelector('.historySection');
        if (historySection) {
            historySection.style.zIndex = '999';
            historySection.style.position = 'relative';
        }

        const videoLayers = document.querySelectorAll('[data-index]');
        if (value === 'Tour Videos') {
            // ✅ Restore .videoLayer section
            videoLayers.forEach((el, idx) => {
                el.classList.add('videoLayer');
                el.style.display = 'block';                  // show wrapper
                el.classList.toggle('active', idx === 0);    // only first active

                const iframe = el.querySelector('iframe');
                if (iframe) iframe.style.display = 'block';  // show iframe
            });

        } else {
            // ✅ Restore iframes for other categories
            const matchingIframes = document.querySelectorAll(`[data-category="${value}"] iframe`);
            matchingIframes.forEach(iframe => {
                iframe.style.display = 'block';
            });

            // const matchingVideos = tour?.videos.filter(video => video.category === value);
            console.log("222 tourVideos", tourVideos, tour?.videos)
            const matchingVideos = tourVideos.filter(video => video.category === value);
            if (matchingVideos.length > 0 && videoRef.current) {
                videoRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
                document.getElementById('tourContentStart')?.scrollIntoView({ behavior: 'smooth' });
            }
        }
        console.log("222 11 tourVideos", tourVideos, tour?.videos)
        setTimeout(() => {
            if (value === 'Tour Videos') {
                videoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
                const matchingVideos = tour?.videos.filter(video => video.category === value);
                if (matchingVideos.length > 0 && videoRef.current) {
                    videoRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } else {
                    document.getElementById('tourContentStart')?.scrollIntoView({ behavior: 'smooth' });
                }
            }
        }, 50);
    };

    const handleAddToCart = async () => {
        if (!selectedDate) {
            // Trigger the date picker if date not selected
            dateInputRef.current.showPicker();
            return;
        }

        try {
            const payload = {
                user_id: 1,                // Replace with actual user ID
                item_type: "tour",
                item_id: tour?.item_id,
                quantity: 1,
                selected_date: selectedDate,
                total_price: tour?.price
            };
            
            const response = await fetch(`${apiBaseTour}/api/cr/cart`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (response.ok) {
                alert("✅ Added to cart successfully!");
                window.location.href = `${base}/tour-cards`;
            } else {
                alert(`❌ Failed to add: ${data.error || "Unknown error"}`);
            }
        } catch (err) {
            console.error("❌ Error adding to cart:", err);
            alert("Network or server error.");
        }
    };
    
    return (
        <div className={styles.tourContainer}>
            <header className={styles.browseHeader}>
                <div className={styles.logoSection}>
                    <Link to="/tour-cards">
                        <img src={imageUrl} alt="TourWise" className={styles.logoImage} />
                    </Link>
                    <Link to="/tour-cards">
                        <span className={styles.logoText}>TourWise</span>
                    </Link>
                </div>
                <h1 className={styles.browseTitleInline}>{tour?.title}</h1>
                <div className={styles.tourActions}>
                    {/* Hidden Date Picker */}
                    <input
                        type="date"
                        ref={dateInputRef}
                        style={{ display: "none" }}
                        onChange={(e) => setSelectedDate(e.target.value)}
                    />

                    {/* Add to Cart Button */}
                    <button
                        className={styles.actionButton}
                        onClick={handleAddToCart}  // ✅ Only one onClick here
                    >
                        Add to Cart
                    </button>

                    <button
                        className={styles.actionButton}
                        onClick={() => setShowMenu(!showMenu)}
                    >
                        Share
                    </button>

                    <ShareMenu showMenu={showMenu} onClose={() => setShowMenu(false)} />

                    <button className={styles.actionButton}>Contact Guide</button>
                </div>
            </header>

            {console.log("111 tourVideos",tourVideos)}
            {tourVideos.map((video, index) => (
                <div
                    key={video.video_id}
                    className={`videoLayer ${index === activeIndex ? 'active' : ''}`}
                    data-index={index}
                >
                    <iframe
                        src={`https://www.youtube.com/embed/${video.video_id}?autoplay=1&mute=1&loop=1&playlist=${video.video_id}&controls=0&disablekb=1&modestbranding=1&playsinline=1`}
                        title={`Tour Video ${index + 1}`}
                        frameBorder="0"
                        allow="autoplay; fullscreen"
                        allowFullScreen
                        width="100%"
                        height="100%"
                    />
                    <div className={styles.tourTitle}>
                        <h1>{tour?.tour_title}</h1>
                        <p>{tour?.tour_location}</p>
                    </div>
                </div>
            ))}

            <div style={{ display: "flex", alignItems: "center" }}>
                {/* Category List */}
                <div
                    ref={categoryRef}
                    className={styles.categorySelector}
                    style={{
                        display: "flex",
                        overflowX: "auto",
                        scrollBehavior: "smooth",
                        whiteSpace: "nowrap",
                        flex: 1
                    }}
                >
                    {categories.map((cat, i) => (
                        <label key={i} style={{ marginRight: "1rem", whiteSpace: "nowrap" }}>
                            <input
                                type="radio"
                                name="category"
                                value={cat}
                                checked={selectedCategory === cat}
                                onChange={handleCategoryChange}
                            />{" "}
                            {cat}
                        </label>
                    ))}
                </div>

                {/* Scroll Right Button */}
                <button
                    onClick={() => {
                        if (categoryRef.current) {
                            categoryRef.current.scrollLeft += 200; // scroll right
                        }
                    }}
                    style={{
                        marginLeft: "0.5rem",
                        background: "white",
                        border: "1px solid #ccc",
                        cursor: "pointer",
                        padding: "0.25rem 0.5rem"
                    }}
                >
                    &gt;
                </button>
            </div>

            <div style={{ height: '200px', position: 'relative', zIndex: -1 }}></div>

            <div ref={videoRef} style={{ height: '1px' }}></div>
            <div>
                {tourVideos
                    .filter(video => video.category === selectedCategory)
                    // .reverse()
                    .sort((a, b) => a.tour_day - b.tour_day) 
                    .map((video, idx) => (
                        <div key={idx} className={styles.videoCard}>
                        
                            <div className={`${styles.dayOverlay} ${showOverlay ? styles.visible : styles.hidden}`}>
                                Day {video.tour_day}
                            </div>
                            <VideoPlayer videoId={video.video_id} index={idx} />

                            <div style={{ marginTop: '1rem' }}>
                                <h4 style={{ marginBottom: '0.5rem' }}>{video.caption}</h4>

                                {/* Reaction Buttons */}
                                <div className={styles.reactionBar}>
                                    <button onClick={() => handleReaction(video.video_id, 'like')}>👍 Like</button>
                                    <button onClick={() => handleReaction(video.video_id, 'love')}>❤️ Love</button>
                                    <button onClick={() => handleReaction(video.video_id, 'laugh')}>😂 Laugh</button>
                                    {/* <button onClick={() => toggleCommentBox(video.video_id)}>💬 Comment</button> */}
                                    <Link to="/tour-cards" className={styles.reactionBar}>
                                        <button>🔙 Back</button>
                                    </Link>
                                </div>

                                <div style={{ marginTop: '0.5rem' }}>
                                    {categories.map((cat, i) => (
                                        <label key={i} style={{ marginRight: '1rem' }}>
                                            <input
                                                type="radio"
                                                name={`category-${idx}`}
                                                value={cat}
                                                checked={selectedCategory === cat}
                                                onChange={handleCategoryChange}
                                            />{' '}
                                            {cat}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}
            </div>

            

            {history_images && history_images?.length > 0 && (
                <div id="tourContentStart" className={styles.history}>
                    <section className={`${styles.tourSection} ${styles.historySection}`}>
                        <h2>{selectedCategory}</h2>

                        <div style={{ margin: '1rem 0' }}>
                            {categories.map((cat, i) => (
                                <label key={i} style={{ marginRight: '1rem' }}>
                                    <input
                                        type="radio"
                                        name="category-history"
                                        value={cat}
                                        checked={selectedCategory === cat}
                                        onChange={handleCategoryChange}
                                    />{' '}
                                    {cat}
                                </label>
                            ))}
                        </div>

                        <div className={styles.historyGallery}>
                            {history_images
                                .filter(item => item.image_path?.trim() && item.category === selectedCategory)
                                .slice(0, 10)
                                .map((item, index) => {
                                    const layoutClass = index % 2 === 0 ? styles.left : styles.right;
                                    const imageUrl = item.image_path.startsWith('/uploads/images/')
                                        ? `${urlBase}${item.image_path.replace('/uploads', '')}`
                                        : `${apiBase}${item.image_path.startsWith('/') ? '' : '/uploads/'}${item.image_path}`;

                                    return (
                                        <div key={index} className={`${styles.historyEntry} ${layoutClass}`}>
                                            <img
                                                src={imageUrl}
                                                alt={`History ${index + 1}`}
                                                className={styles.historyImage}
                                                onError={(e) => (e.target.style.display = 'none')}
                                            />
                                            {item.caption?.trim() && (
                                                <p className={styles.historyCaption}>{item.caption}</p>
                                            )}
                                            <div style={{ marginTop: '1rem' }}>
                                                {categories.map((cat, i) => (
                                                    <label key={i} style={{ marginRight: '1rem' }}>
                                                        <input
                                                            type="radio"
                                                            name={`category-${index}`}
                                                            value={cat}
                                                            checked={selectedCategory === cat}
                                                            onChange={handleCategoryChange}
                                                        />{' '}
                                                        {cat}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    </section>
                </div>
            )}
            
            {selectedCategory === "Tour Itinerary" && (
                <>
                    {tour?.inclusions && String(tour?.inclusions).trim().length > 0 && (
                        <section className={styles.tourSection}>
                            <h2>What’s Included</h2>
                            <WhatsIncluded
                                inclusions={String(tour?.inclusions).split(";").map(s => s.trim()).filter(Boolean)}
                                exclusions={String(tour?.exclusions || "").split(";").map(s => s.trim()).filter(Boolean)}
                            />
                        </section>
                    )}
                    {tour_itinerary && String(tour_itinerary).trim().length > 0 && (
                        <section className={styles.tourSection}>
                            <h2>Tour Itinerary</h2>
                            <TourItinerary
                                itineraries={(() => {
                                    try {
                                        // return JSON.parse(tour_itinerary || "[]");
                                        return (tour_itinerary || "[]");
                                    } catch {
                                        return [];
                                    }
                                })()}
                            />
                        </section>
                    )}

                    <div style={{ marginTop: "1rem" }}>
                        {categories.map((cat, i) => (
                            <label key={i} style={{ marginRight: "1rem" }}>
                                <input
                                    type="radio"
                                    name="tour-section-category"   // fixed: no undefined `index`
                                    value={cat}
                                    checked={selectedCategory === cat}
                                    onChange={handleCategoryChange}
                                />{" "}
                                {cat}
                            </label>
                        ))}
                    </div>
                </>
            )}
            

            {selectedCategory === "Tour Guides" && (
                <div className={styles.guideSection}>
                    <h3>🧑‍✈️✈️ Meet Your Tour Guides</h3>
                    {tour?.tour_guides?.length === 0 ? (
                        <p>No guides assigned yet for this tour?.</p>
                    ) : (
                        <div className={styles.guideList}>
                            {tour?.tour_guides.map((guide) => (

                                <div key={guide.guide_id} className={styles.guideCard}>
                                    <img
                                        src={guide.photo || "https://via.placeholder.com/100"}
                                        alt={guide.name}
                                        className={styles.guide}
                                    />
                                    <h4>{guide.name}</h4>
                                    <p><strong>Languages:</strong> {guide.language_spoken}</p>
                                    <p><strong>Location:</strong> {guide.location}</p>
                                    <p><strong>Rating:</strong> ⭐ {guide.rating} ({guide.total_reviews} reviews)</p>
                                    <p><strong>Availability:</strong></p>
                                    <ul>
                                        {guide.availability.map((a, idx) => (
                                            <li key={idx}>{a.date} – {a.slots.join(", ")}</li>
                                        ))}
                                    </ul>
                                    <button
                                        onClick={() => window.open(`https://wa.me/${guide.phone.replace(/\D/g, '')}`, '_blank')}
                                        className={styles.contactGuideButton}
                                    >
                                        📲 Contact Guide
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            

            {selectedCategory === "Tour Owner Info" && tour?.vendor && (
                <div className={styles.guideSection}>
                    <h3>🏢📋 About the Tour Vendor</h3>
                    <div className={styles.guideList}>
                        <div className={styles.guideCard}>
                            <img
                                src={`https://ui-avatars.com/api/?name=${encodeURIComponent(tour?.vendor?.name)}&background=random`}
                                alt={tour?.vendor?.name}
                                className={styles.guidePhoto}
                            />

                            <h4>{tour?.vendor?.name}</h4>
                            
                            <p><strong>Email:</strong> {tour?.vendor?.email || "Not provided"}</p>
                            <p><strong>Phone:</strong> {tour?.vendor?.phone || "Not provided"}</p>
                            <p><strong>WhatsApp:</strong> {tour?.vendor?.whatsapp || "Not provided"}</p>
                            <p><strong>Rating:</strong> ⭐ {tour?.vendor?.rating || "No rating yet"}</p>
                            
                            <p>
                                <strong>License:</strong>
                                {tour?.vendor?.license_number
                                    ? `${tour?.vendor?.license_number}${tour?.vendor?.license_expiry ? ` (expires on ${new Date(tour?.vendor?.license_expiry).toLocaleDateString()})` : ""}`
                                    : "No license information available"}
                            </p>
                            

                            <p><strong>Certifications:</strong></p>
                            <ul>
                                {tour?.vendor?.certifications?.length > 0
                                    ? tour?.vendor?.certifications.map((cert, idx) => {
                                        try {
                                        console.log(`Certification ${idx}:`, cert); // data are ok
                                        return <li key={idx}>{typeof cert === 'object' ? JSON.stringify(cert) : cert}</li>
                                        } catch (err) {
                                        console.error(`Error rendering certification ${idx}:`, err);
                                        return <li key={idx}>Error displaying certification</li>;
                                        }
                                    })
                                    : <li>No certifications listed</li>}
                            </ul>

                            

                            <p><strong>Awards:</strong></p>
                            <ul>
                                {tour?.vendor?.awards?.length > 0
                                    ? tour?.vendor?.awards.map((award, idx) => {
                                        try {
                                        return (
                                            <li key={idx}>
                                            {typeof award === 'object' ? JSON.stringify(award) : award}
                                            </li>
                                        );
                                        } catch (err) {
                                        console.error(`Error rendering award ${idx}:`, err);
                                        return <li key={idx}>Error displaying award</li>;
                                        }
                                    })
                                    : <li>No awards listed</li>}
                            </ul>
                            
                            <p><strong>Description:</strong></p>
                            <p>{tour?.vendor?.description || "No description available."}</p>

                            <button
                                disabled={!tour?.vendor?.whatsapp}
                                onClick={() => tour?.vendor?.whatsapp && window.open(`https://wa.me/${tour?.vendor?.whatsapp.replace(/\D/g, '')}`, '_blank')}
                                className={styles.contactGuideButton}
                            >
                                📲 Contact Vendor
                            </button>
                        </div>
                    </div>
                </div>
            )}

            
            {selectedCategory === 'Tips for Visitors' && (
                <section className={styles.tourSection} style={{ paddingTop: '0rem', marginTop: '5rem' , alignContent: "top"}}>
                    <ul>
                        {(() => {
                            let tips_ = tips;
                            if (typeof tips === 'string' && tips.trim().startsWith('[')) {
                                try {
                                    tips_ = JSON.parse(tips);
                                } catch (e) {
                                    console.error("Parsing error:", e);
                                    tips_ = [];
                                }
                            }

                            return (tips_ || []).map((item, idx) => (
                                <li key={idx}>{item.trim()}</li>
                            ));
                        })()}
                    </ul>
                </section>
            )}
        </div>
    );
}

