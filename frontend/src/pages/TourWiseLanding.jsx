import { useEffect, useState } from 'react';
import { apiBaseTour, frontendBase } from '../config';
import styles from './TourWiseLanding.module.css';
import { useNavigate, useLocation, useParams,  useSearchParams} from 'react-router-dom';


import '@fortawesome/fontawesome-free/css/all.min.css';

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

    // ========================================================================
    // ✅ UNIFIED DATA FETCHING `useEffect` (This is the core fix)
    // ========================================================================

    let currentReqId = 0;
    let currentController = null;

    useEffect(() => {
        const TOUR_CACHE_KEY = `tour-data-landing`;
        const reqId = ++currentReqId;
        const startedAt = Date.now();
        // Cancel any previous pending fetch

        if (currentController) {
            currentController.abort();
        }

        currentController = new AbortController();
        const signal = currentController.signal;
        const cachedEntry = primeStateFromCache(TOUR_CACHE_KEY, (cachedData) => {
            setItems(cachedData);
            if (cachedData?.title) document.title = `TourWise | ${cachedData.title}`;
        });

        const strategy = searchParams.get('strategy');
        const finalSTR = (strategy || window.__CACHE_STRATEGY__ || 'ETAGONLY').toUpperCase();
        const ttl = parseTTLms(finalSTR);
        // console.log(`...Data fetch effect running. Strategy: ${cachedEntry?.expires} | TTL: ${startedAt}`);

        if (
            ttl > 0 &&
            cachedEntry &&
            typeof cachedEntry?.expires === 'number' &&
            Date.now() < cachedEntry?.expires
        ) {
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
            // prime UI already done, so optionally skip fetch entirely
            return; 
        }

        const headers = {};
        if (cachedEntry?.etag) {
            headers['If-None-Match'] = cachedEntry.etag;
            console.log(".... → Sending If-None-Match:", headers['If-None-Match']);
        }

        const ac = new AbortController();
        const fetchSignal = ac.signal;

        fetch(`${apiBaseTour}/api/tl/tour-landing`, { method: 'GET', headers, signal: ac.signal })
            .then(async res => {
                if (ac.signal.aborted) return;

                if (reqId !== currentReqId) {
                    console.warn('fetchWithStrategy: ignoring stale response', { reqId, currentReqId });
                    return {};
                }
                console.log("...res.status", res.status)
                if (res.status === 304 && cachedEntry?.data && !ac.signal.aborted) {
                    console.log("...♻️ Using cached data, ETag matched:", cachedEntry.expires);
                    setItems(cachedEntry.data);
                    return;
                }

                if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);

                const text = await res.text();

                try {
                    const data = JSON.parse(text);

                    if (!data) return; // nothing to do
                    console.log("... set items")
                    setItems(data);

                    if (fetchSignal.aborted) return;

                    const etag = res.headers.get("ETag") || null;

                    // Always cache fresh data (and bump TTL even for 304)
                    cacheSet(TOUR_CACHE_KEY, { data, etag, ttl, fetchedAt: Date.now() });
                } catch (jsonErr) {
                    console.error("❌ JSON parse error:", jsonErr);
                }
            })
            .catch(err => {
                if (!ac.signal.aborted) {
                    console.error("222 ❌ Fetch failed:", err);
                }
            });
        return () => ac.abort();
    }, [searchParams]);

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

    useEffect(() => {
        if (items?.length > 0) {
            const parsedItems = items.map(item => typeof item === "string" ? JSON.parse(item) : item);
            console.log("parse",parsedItems[0]?.tour?.type);
        }

    }, [items]);

    // ✅ Show loading or empty state
    if (!items) {
        return <p>Loading data...</p>; // API still fetching
    }
    if (items.length === 0) {
        return <p>No data available.</p>; // API returned no items
    }

    return (
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
                    const parsed = (items || [])
                    .map(it => {
                        if (typeof it === "string") {
                        try {
                            return JSON.parse(it);
                        } catch (e) {
                            console.error("Failed to parse item:", e);
                            return null;
                        }
                        }
                        return it;
                    })
                    .filter(Boolean); // remove nulls

                    const tours = parsed.filter(it => it?.tour?.type === "tour");

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
                                {console.log("222 hotel: ",hotel)}
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
            </section>
        </div >
    );
}