import { useEffect, useState } from 'react';
import { apiBaseTour, frontendBase } from '../config';
import styles from './TourWiseLanding.module.css';
import { useNavigate, useLocation, useParams , useSearchParams} from 'react-router-dom';



import '@fortawesome/fontawesome-free/css/all.min.css';


// ✨ CACHE: add lightweight cache helpers + defaults
const CACHE_TTL_MS = 15 * 60 * 1000; // ✨ CACHE: 5 minutes default TTL
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
        if (obj.expires && obj.expires < nowMs()) return null; // expired
        return obj; // { data, etag, expires }
    } catch {
        return null;
    }
}

// ✨ CACHE: write to localStorage with TTL
function cacheSet(key, { data, etag = null, ttl = CACHE_TTL_MS }) {
    try {
        const payload = {
            data,
            etag,
            expires: nowMs() + Math.max(1_000, ttl),
        };
        localStorage.setItem(key, JSON.stringify(payload));
    } catch {
        // ignore quota errors silently
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
        useEffect(() => {
            const TOUR_CACHE_KEY = `tour-data-landing`;
            console.log("222 useEffect running. Strategy from URL is:")
            const strategy = searchParams.get('strategy');
            console.log("222 useEffect running. Strategy from URL is:", strategy);
    
            // GUARD: If the router hasn't synced the URL parameters yet, wait.
            // This is the key to preventing the unnecessary fetch on the first render.
            if (strategy === null) {
                console.log("Strategy is null, waiting for router to sync...");
                return; // Stop and wait for the re-render when the strategy is ready.
            }
    
            // If we are here, the strategy EXISTS in the URL. Proceed with data logic.
            const finalSTR = (strategy || 'ETAGONLY').toUpperCase();
            const ttl = parseTTLms(finalSTR);
            console.log(`222 ✅ Strategy is "${finalSTR}", TTL is ${ttl}. Proceeding.`);
    
            const cachedEntry = primeStateFromCache(TOUR_CACHE_KEY, (cachedData) => {
                setItems(cachedData);
                if (cachedData?.title) document.title = `TourWise | ${cachedData.title}`;
            });
    
            if (ttl > 0 && cachedEntry?.expires && Date.now() < cachedEntry.expires) {
                console.log("✅ Skipping fetch — TTL is valid and cache is fresh.");
                return;
            }
    
            console.log("🔥 Cache is invalid or TTL expired. Fetching new data...");
            const ac = new AbortController();
            const headers = {};
            if (cachedEntry?.etag) headers["If-None-Match"] = cachedEntry.etag;
    
            fetch(`${apiBaseTour}/api/tl/tour-landing`, { method: 'GET', headers, signal: ac.signal })
                .then(async res => {
                    if (ac.signal.aborted) return;
    
                    if (res.status === 304 && cachedEntry?.data) {
                        console.log("♻️ 304 Not Modified. Reusing cached data.");
                        setItems(cachedEntry.data);
                        return;
                    }
                    
                    if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
    
                    const data = await res.json();
                    const etag = res.headers.get("ETag") || null;
                    
                    setItems(data);
                    cacheSet(TOUR_CACHE_KEY, { data, etag, ttl });
                })
                .catch(err => {
                    if (!ac.signal.aborted) {
                        console.error("❌ Fetch failed:", err);
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
                                <a href={`${base}/tour-cards`} target="_blank" rel="noopener noreferrer">
                                    <i className="fas fa-map-marked-alt" style={{ marginRight: '0.5rem' }}></i>
                                    View Tours
                                </a>

                                <a href={`${base}/admin/items`} target="_blank" rel="noopener noreferrer">
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
                <h2 className={styles.sectionTitle}>Top Destinations</h2>
                <div className={styles.tourCards}>
                    
                    {items
                        .map(item => {
                            if (typeof item === "string") {
                            try {
                                return JSON.parse(item);
                            } catch (e) {
                                console.error("Failed to parse item:", e);
                                return null;
                            }
                            }
                            return item; // already an object
                        })
                        .filter(item => item?.tour?.type === 'tour') // filter properly
                        .map((item, index) => {
                            const tour = item.tour; // extract tour object

                            return (
                            <div
                                className={styles.tourCard}
                                key={index}
                                onClick={() => navigate(`/tour/${tour.slug}`)}
                            >
                                {tour.image && (
                                <img
                                    src={getStaticImageUrl(tour.image)}
                                    alt={tour.title || 'No title'}
                                    className={styles.tourImage}
                                />
                                )}

                                <div className={styles.tourInfo}>
                                <h3>{tour.title}</h3>
                                <p className={styles.description}>
                                    {tour.description || 'No description available.'}
                                </p>
                                {tour.location && <p className={styles.location}>{tour.location}</p>}
                                <p className={styles.price}>
                                    {Number(tour.price.replace(/,/g, '')).toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    })}
                                </p>
                                </div>
                            </div>
                            );
                        })}
                </div>
            </section>



            <section className={styles.sectionFeatured}>
                <h2 className={styles.sectionTitle}>Top Hotels</h2>
                <div className={styles.tourCards}>
                    {items
                        .filter(item => item.type === 'hotel') // ✅ Show only hotels
                        .map((hotel, index) => (
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
                        ))}
                </div>
            </section>


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