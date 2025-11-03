import { useEffect, useRef, useState } from 'react';
import { apiBaseTour, frontendBase } from '../config';
import styles from './TourWiseLanding.module.css';
import { useNavigate, useLocation, useParams,  useSearchParams} from 'react-router-dom';


import '@fortawesome/fontawesome-free/css/all.min.css';

// ✨ CACHE: add lightweight cache helpers + defaults
const CACHE_TTL_MS = 360 * 60 * 1000; // ✨ CACHE: 5 minutes default TTL
const nowMs = () => Date.now();     // ✨ CACHE: simple time helper
const PROBE_INTERVAL_MS = 6_000; // 1 minute
const _lastProbeAt = new Map();    // key -> nextAllowedTimestamp
const TOUR_CACHE_KEY = 'tour-data-landing';
const key = TOUR_CACHE_KEY;  
let nextAllowed = _lastProbeAt.get(key) || 0;





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

async function probeBackend(ver) {
  const PROBE_URL = `${apiBaseTour}/api/tl/tourlandingpages-probe`;
  const url = `${PROBE_URL}?ver=${encodeURIComponent(ver)}`;
  
  // timeout (ms) — tune to your environment
  const TIMEOUT_MS = 7000;

  // AbortController for fetch timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  
  
  try {
    console.log("[probeBackend] fetching:", url, "navigator.onLine:", navigator.onLine);

    const res = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: { 
        "Accept": "text/plain"         // existing header
      }
    });
    
    clearTimeout(timeoutId);

    console.log("[probeBackend] fetch completed status:", res.status, "ok:", res.ok);

    // catch non-OK early
    if (!res.ok) {
      // read body if possible for debugging
      const body = await res.text().catch(() => "<body read failed>");
      console.error("[probeBackend] non-ok response:", res.status, body.slice(0, 200));
      throw new Error("probe failed: " + res.status);
    }

    const text = (await res.text()).trim();
    console.log("text from probe", text)
    const returnedRedisTTL = res.headers.get("X-Redis-TTL");
    console.log("returnedRedisTTL", returnedRedisTTL)
    return [text, returnedRedisTTL];

    // return text;
  } catch (err) {
    clearTimeout(timeoutId); // ensure cleanup

    if (err.name === "AbortError") {
      console.error("[probeBackend] fetch aborted due to timeout:", TIMEOUT_MS, "ms", url);
      throw new Error("probe timeout");
    }

    console.error("[probeBackend] fetch error:", err);
    throw err; // rethrow so caller can handle retry logic
  }
}


const base = `${frontendBase}/tourism-analytics/`;
const baseurl = `${apiBaseTour}/uploads`;

const isValidUrl = (str) => str.startsWith('http://') || str.startsWith('https://');

const getStaticImageUrl = (path) => {
    if (!path) return '';
    if (isValidUrl(path)) return path;
    const cleaned = path.startsWith('/') ? path : `/${path}`;
    return cleaned.startsWith('/images/')
        ? `${base}${cleaned}`
        : `${baseurl}${cleaned}`;
};



export default function TourWiseLanding() {
    const [items, setItems] = useState(null);
    const navigate = useNavigate();
    const [language, setLanguage] = useState('');
    const [showLangBanner, setShowLangBanner] = useState(true);
    const [languagesList, setLanguagesList] = useState([]);
    const [languageFlags, setLanguageFlags] = useState({});

    const [currency, setCurrency] = useState('USD');
    const [currencyList, setCurrencyList] = useState({});
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const currentControllerRef = useRef(null);
    const currentReqIdRef = useRef(0);
    const inFlightRef = useRef(false);


    useEffect(() => {
        const cached = localStorage.getItem('languageData');
        if (cached) {
            const { langs, flags, codeMap: timestamp } = JSON.parse(cached);
            const isFresh = Date.now() - timestamp < 24 * 60 * 60 * 1000;
            if (isFresh) {
                setLanguagesList(langs);
                setLanguageFlags(flags);
                // setLanguageCodeMap(storedCodeMap);  // ✅ renamed to storedCodeMap
                if (!language) {
                    const fallback = langs.find(l => l.includes('English')) || langs[0];
                    setLanguage(fallback);
                }
                return;
            }
        }

        // These are for fresh API load
        const langs = new Set();
        const flags = {};
        const codeMapFresh = {};  // ✅ renamed to avoid conflict

        fetch('https://restcountries.com/v3.1/all?fields=languages,flags')
            .then(res => res.json())
            .then(data => {
                data.forEach(country => {
                    if (country.languages) {
                        Object.entries(country.languages).forEach(([code, name]) => {
                            langs.add(name);
                            codeMapFresh[name] = code;
                            if (!flags[name] && country.flags?.png) {
                                flags[name] = country.flags.png;
                            }
                        });
                    }
                });

                const sortedLangs = Array.from(langs).sort();
                setLanguagesList(sortedLangs);
                setLanguageFlags(flags);
                // setLanguageCodeMap(codeMapFresh);

                localStorage.setItem('languageData', JSON.stringify({
                    langs: sortedLangs,
                    flags,
                    codeMap: codeMapFresh,  // ✅ stored with original name
                    timestamp: Date.now()
                }));

                if (!language) {
                    const fallback = sortedLangs.find(l => l.includes('English')) || sortedLangs[0];
                    setLanguage(fallback);
                }
            })
            .catch(err => console.error('❌ Error fetching languages and flags:', err));
    }, []);

    useEffect(() => {
        const cached = localStorage.getItem('currencyData');
        if (cached) {
            const { data, timestamp } = JSON.parse(cached);
            const isFresh = Date.now() - timestamp < 24 * 60 * 60 * 1000;
            if (isFresh) {
                setCurrencyList(data);
                return;
            }
        }

        fetch('https://api.frankfurter.dev/v1/currencies')
            .then(res => res.json())
            .then(data => {
                setCurrencyList(data);
                localStorage.setItem('currencyData', JSON.stringify({
                    data,
                    timestamp: Date.now()
                }));
            })
            .catch(err => console.error('❌ Error fetching currencies:', err));
    }, []);


    const handleLanguageChange = async (e) => {
        const selectedLang = e.target.value;
        setLanguage(selectedLang);
        localStorage.setItem('selectedLanguage', selectedLang);
    };
    const handleCurrencyChange = (e) => {
        const curr = e.target.value;
        setCurrency(curr);
        localStorage.setItem('selectedCurrency', curr);
        console.log("💱 Currency selected:", curr);
    };

    const handleLanguageConfirm = () => {
        setShowLangBanner(false);
        console.log("🌐 Language selected:", language);
    };


    useEffect(() => {
        const params = new URLSearchParams(location.search);
        if (!params.has('strategy')) {
            params.set('strategy', 'ttl1h');

            // ✅ Always add trailing slash
            const path = location.pathname.endsWith('/')
            ? location.pathname
            : `${location.pathname}/`;

            navigate({ pathname: path, search: params.toString() }, { replace: true });
        }
    }, [location, navigate]);


    function skipFetchUseCache(cachedEntry, ttl, redisTTL, setItems) {
            const now = Date.now();
            const expiresAt = cachedEntry.expires;
            const remainingMs = Math.max(0, expiresAt - now);
            const writtenAt = expiresAt - ttl;
            const ageMs = Math.max(0, now - writtenAt);
            console.log("Skipping fetch — TTL` still valid:", {
                ttl,
                ageMs,
                remainingMs,
                writtenAt: new Date(writtenAt).toLocaleString(),
                expiresAt: new Date(expiresAt).toLocaleString(),
                redisTTL
            });
            setItems(cachedEntry.data || []);
            return; // important: skip network when TTL valid
        }


    // ========================================================================
    // ✅ UNIFIED DATA FETCHING `useEffect` (This is the core fix)
    // ========================================================================

    // const inFlightProbes = new Map();  // key -> Promise
    let currentReqId = 0;
    let currentController = null;
    
    const inFlightProbes = new Map();  // key -> Promise
    
    const fetchWithStrategy = async () => {
        // use `key` consistently
        const reqId = ++currentReqId;
        let ttl_flag = 0;

        // Cancel previous pending fetch for fetch API (if any)
        if (currentController) {
            try { currentController.abort(); } catch (_) {}
        }
        
        // 1) Prime UI from cache (fast paint)
        const cachedEntry = primeStateFromCache(TOUR_CACHE_KEY, (cachedData) => {
            setItems(cachedData);
            if (cachedData?.title) document.title = `TourWise | ${cachedData.title}`;
        });
    
    
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
            // Reserve next allowed probe time immediately to avoid races
            const clientVer = cachedEntry?.etag ?? "";
            const now = Date.now();
            
            //If still inside cooldown, use cache and stop
            nextAllowed = _lastProbeAt.get(key) || 0;
            if (now < nextAllowed) {
                console.log("⏳ Skipping fetch — still within probe interval", { now, nextAllowed });
                skipFetchUseCache(cachedEntry, ttl, setItems); 
                return; // stop here
            }

            _lastProbeAt.set(key, nowMs() + PROBE_INTERVAL_MS);
            
            //If a probe is already in flight for this key, wait on it, then reuse cache
            console.log("inFlightProbes.has(key)", inFlightProbes.has(key))
            if (inFlightProbes.has(key)) {
                console.log("➡️ Probe already running for key, awaiting existing probe");
                try {
                    await inFlightProbes.get(key);
                } catch (e) {
                    console.warn("inFlight probe failed", e);
                }
                // after awaiting the probe, cachedEntry should still be valid — reuse it
                skipFetchUseCache(cachedEntry, ttl, setItems);
                return { stoppedEarly: true };
            }

            // Start the probe (store the Promise so other callers can await)
            const probePromise = (async () => {
            try {
                const updateNeeded = await probeBackend(clientVer);
    
                if (updateNeeded[0] === "0") {
                    console.log("... probe says no update — use cache");
                    skipFetchUseCache(cachedEntry, ttl, setItems);
                    return { stoppedEarly: true };
                } else {ttl_flag = 1; }

                // probe indicates update needed; caller will continue to actual fetch afterwards
                console.log("... probe says updateNeeded, proceed to network fetch");
                return { stoppedEarly: false };
            } catch (err) {
                console.error("probeBackend error:", err);
                // Allow retry later by removing nextAllowed marker
                _lastProbeAt.delete(key);
                // throw err;
                return { stoppedEarly: false }; // continue to actual fetch
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
                skipFetchUseCache(cachedEntry, ttl, setItems);
                return { stoppedEarly: true };
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
    
        try {
            const res = await fetch(`${apiBaseTour}/api/tl/tour-landing`, { headers, signal });
            // stale-response guard 1234
            if (reqId !== currentReqId && ttl_flag === 0) { 
                console.warn('fetchWithStrategy: ignoring stale response (reqId)', { reqId, currentReqId });
                return;
            }
    
            // 304 → reuse cached entry and update expires perhaps
            if (res.status === 304 && cachedEntry?.data) {
                console.log(".... ♻️ Using cached data, ETag matched:", cachedEntry.etag);
                cacheSet(TOUR_CACHE_KEY, { data: cachedEntry.data, etag: cachedEntry.etag, ttl, fetchedAt: Date.now() });
                setItems(cachedEntry.data || []);
                return;
            }
    
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
            
            cacheSet(TOUR_CACHE_KEY, { data, etag, ttl, fetchedAt: Date.now() });
    
            if (reqId === currentReqId || ttl_flag === 1) {
                setItems(data || []);
                console.log("...done");
            } else {
                console.warn('fetchWithStrategy: response arrived but request is stale, ignoring setItems');
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
        fetchWithStrategy();
    }, []); 
      

    const Navbar = () => {
        const [menuOpen, setMenuOpen] = useState(false);
        const base = '/tourism-analytics'; // Adjust if needed

        return (
            <header className={styles.navbar}>
                <div className={styles.navbarLogo} onClick={() => window.location.href = '/'}>
                    TourWise
                </div>

                <div className={styles.dropdown}>
                    <button
                        className={styles.menuToggle}
                        onClick={() => setMenuOpen(!menuOpen)}
                        aria-label="Toggle Menu"
                    >
                        ☰
                    </button>

                    {menuOpen && (
                        <div className={styles.dropdownMenu}>
                            <div className={styles.menuGroup}>
                                <strong>items</strong>
                                <a href={`${base}/tour-cards?strategy=ttl1h`} target="_blank" rel="noopener noreferrer">
                                    <i className="fas fa-map-marked-alt" style={{ marginRight: '0.5rem' }}></i>
                                    View Tours
                                </a>

                                <a href={`${base}/admin/items?strategy=ttl1h`} target="_blank" rel="noopener noreferrer">
                                    <i className="fas fa-plus" style={{ marginRight: '0.5rem' }}></i>
                                    Add New Tours
                                </a>

                                <a href={`${base}/admin/tour-cards?strategy=ttl1h`} target="_blank" rel="noopener noreferrer">
                                    <i className="fas fa-photo-video" style={{ marginRight: '0.5rem' }}></i>
                                    Update Tours Media
                                </a>
                            </div>

                            <div className={styles.menuGroup}>
                                <strong>Hotels</strong>
                                <a href={`${base}/hotel-cards`} target="_blank" rel="noopener noreferrer">
                                    <i className="fas fa-hotel" style={{ marginRight: '0.5rem' }}></i>
                                    View Hotels
                                </a>

                                <a href={`${base}/admin/hotel`} target="_blank" rel="noopener noreferrer">
                                    <i className="fas fa-plus-square" style={{ marginRight: '0.5rem' }}></i>
                                    Add New Hotel
                                </a>

                            </div>

                            <div className={styles.menuGroup}>
                                <strong>Cars</strong>
                                <a href={`${base}/car-cards`} target="_blank" rel="noopener noreferrer">View Cars</a>
                                <a href={`${base}/admin/car-cards`} target="_blank" rel="noopener noreferrer">Update Car Listings</a>
                            </div>
                        </div>
                    )}
                </div>
            </header >
        );
    };

    console.log("items",items)
    // ✅ Show loading or empty state
    if (!items) {
        return <p>Loading data...</p>; // API still fetching
    }
    if (items.length === 0) {
        return <p>No data available.</p>; // API returned no items
    }

    // Add this helper anywhere near the top of your component file
    
    let parsed = [];
    let normalizedItems = [];
    function tryParse(value) {
        if (value === null || value === undefined) return null;
        // If already an object, return as-is
        if (typeof value === "object") {
            return value;
        }
        
        // If not a string, ignore
        if (typeof value !== "string") return null;

        try {
            return JSON.parse(value);
        } catch (err) {
            console.warn("❌ Failed to parse JSON:", err.message, "\nValue:", value.slice(0, 200));
            return null;
        }
    }
    
    return (
        <>
        {   
            (() => {
                // Step 1: Parse each item safely
                console.log("Array.isArray(items)",Array.isArray(items))
                if (Array.isArray(items)) {
                    try {
                        parsed = items
                            .map(item => {
                                try {
                                return tryParse(item);
                                } catch (err) {
                                console.error("Failed to parse item:", item, err);
                                return null;
                                }
                            })
                            .filter(Boolean);

                    } catch (outerErr) {
                        console.error("Unexpected error while parsing items:", outerErr);
                        parsed = [];
                    }

                } else {
                    parsed = tryParse(items.body) || [];
                }


                // Step 2: Normalize the parsed data

                normalizedItems = Array.isArray(parsed)
                    ? parsed
                        .map(el => (typeof el === "string" ? tryParse(el) : el))
                        .filter(Boolean)
                    : [];
                
                // Step 3: Filter only tours
                const tours2 = normalizedItems.filter(it => it?.tour?.type === "tour");
                console.log("tours2",tours2)
            })()

            
        }
        <div className={styles.tourwiseLanding}>
            {showLangBanner && (
                <div className={styles.languageBanner}>
                    <span>Choose your preferred language for localized experiences</span>
                    <p>Currency: <strong>{currency}</strong></p>
                    <select value={language} onChange={handleLanguageChange}>
                        {languagesList.map((lang, idx) => (
                            <option key={idx} value={lang}>
                                {languageFlags[lang] ? `🌐 ${lang}` : lang}
                            </option>
                        ))}
                    </select>

                    {languageFlags[language] && (
                        <div style={{ margin: '0.5rem 0' }}>
                            <img src={languageFlags[language]} alt="flag" style={{ height: '20px', marginRight: '0.5rem' }} />
                            <strong>{language}</strong>
                        </div>
                    )}

                    <div style={{ marginTop: '0.5rem' }}>
                        <label style={{ marginRight: '0.5rem' }}>Currency:</label>
                        <select value={currency} onChange={handleCurrencyChange}>
                            {Object.entries(currencyList).map(([code, name]) => (
                                <option key={code} value={code}>{code} - {name}</option>
                            ))}
                        </select>
                    </div>

                    <button onClick={handleLanguageConfirm}>Go</button>
                    <button onClick={() => setShowLangBanner(false)}>✕</button>
                </div>
            )}
            <Navbar />
            <div className={styles.movingGroup}>
                <section className={`${styles.hero} ${styles.heroImage1}`}>
                    <div className={styles.heroContent}>
                        <h1>Explore the World with TourWise</h1>
                        <p>Discover amazing destinations and items tailored for you.</p>
                        {/* <button className={styles.btnPrimary} onClick={() => window.open(`${base}/bookpage`, '_blank')}>Book Now</button> */}
                    </div>
                    <div className={styles.scrollIndicator}>⌄</div>
                </section>
                <section className={`${styles.hero} ${styles.heroImage2}`}>
                    <div className={styles.heroContent}>
                        <h1>Explore the World with TourWise</h1>
                        <p>Discover amazing destinations and items tailored for you.</p>
                        {/* <button className={styles.btnPrimary} onClick={() => window.open(`${base}/bookpage`, '_blank')}>Book Now</button> */}
                    </div>
                    <div className={styles.scrollIndicator}>⌄</div>
                </section>
                <section className={`${styles.hero} ${styles.heroImage3}`}>
                    <div className={styles.heroContent}>
                        <h1>Explore the World with TourWise</h1>
                        <p>Discover amazing destinations and items tailored for you.</p>
                        {/* <button className={styles.btnPrimary} onClick={() => window.open(`${base}/bookpage`, '_blank')}>Book Now</button> */}
                    </div>
                    <div className={styles.scrollIndicator}>⌄</div>
                </section>
            </div>

            <section className={styles.sectionFeatured}>
                {/* parse items once and build tours list (move logs out of JSX if you want) */}
                {(() => {
                    const tours = normalizedItems.filter(it => it?.tour?.type === "tour");
                    
                    if (tours.length === 0) return null;
                    
                    return (
                    <>
                        <h2 className={styles.sectionTitle}>Top Destinations</h2>
                        
                        <div className={styles.tourCards}>
                        {tours.map((it, idx) => {
                            const tour = it.tour || {};
                            const key = tour.item_id ?? tour.id ?? tour.slug ?? idx;
                            // safe price formatting
                            let price = '';
                            try {
                            const raw = (tour.price ?? '').toString().replace(/,/g, '').trim();
                            price = raw ? Number(raw).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '';
                            } catch (e) {
                            price = tour.price ?? '';
                            }

                            return (
                            <div
                                className={styles.tourCard}
                                key={key}
                                onClick={() => navigate(`/tour/${tour.slug}`)}
                            >
                                {tour.image && (
                                <img
                                    src={getStaticImageUrl(tour.image)}
                                    alt={tour.title ?? 'No title'}
                                    className={styles.tourImage}
                                />
                                )}

                                <div className={styles.tourInfo}>
                                <h3>{tour.title}</h3>
                                <p className={styles.description}>
                                    {tour.description ?? 'No description available.'}
                                </p>
                                {tour.location && <p className={styles.location}>{tour.location}</p>}
                                {price !== '' && <p className={styles.price}>{price}</p>}
                                </div>
                            </div>
                            );
                        })}
                        </div>
                    </>
                    );
                })()}
                </section>

            {/* {console.log("before items hotel section", items)}
            {items
                .filter(item => item.type === 'hotel') // ✅ Show only hotels
                .map((hotel, index) => (
                    <section className={styles.sectionFeatured}>
                        <h2 className={styles.sectionTitle}>Top Hotels</h2>
                            <div
                                className={styles.tourCard}
                                key={index}
                                onClick={() => navigate(`/hotel/${hotel.slug}`)}
                            >
                                {hotel.image && ( // ✅ Use correct field: card_image (from API)
                                    <img
                                        src={getStaticImageUrl(hotel.image)}
                                        alt={hotel.name || 'Hotel Image'}
                                        className={styles.tourImage}
                                    />
                                )}
                                <div className={styles.tourInfo}>
                                    <h3>{hotel.name}</h3>
                                    <p className={styles.description}>
                                        {hotel.description || 'No description available.'}
                                    </p>
                                    {hotel.location && <p className={styles.location}>{hotel.location}</p>}
                                    {hotel.price && (
                                        <p className={styles.price}>
                                            {Number(hotel.price).toLocaleString(undefined, {
                                                minimumFractionDigits: 2,
                                            })}
                                        </p>
                                    )}
                                </div>
                            </div>
                </section>
            ))}

            <section className={styles.sectionTips}>
                <h2 className={styles.sectionTitle}>Travel Tips</h2>
                <div className={styles.tipsGrid}>
                    <p>Enjoy seamless travel planning with expert guidance every step of the way.</p>
                    <p>Experience unforgettable destinations with personalized recommendations.</p>
                    <p>Explore the world in comfort — your perfect trip starts here.</p>
                </div>
            </section> */}
        </div >
        </>
    );
}