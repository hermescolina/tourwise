import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiBaseTour, frontendBase } from '../config';
import { useState, useEffect } from 'react';
import styles from './TourCards.module.css';
import { useCart } from '../components/CartContext'; 

const base = `${frontendBase}/tourism-analytics`;
const baseimageurl = `${apiBaseTour}`;

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

export default function BrowseTours() {
  const navigate = useNavigate();
  const [tours, setTours] = useState([]);
  const [minPrice, setMinPrice] = useState(1000);
  const [maxPrice, setMaxPrice] = useState(15000);
  const [searchTerm, setSearchTerm] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const { cartItems, addToCart, loadCart } = useCart();
  const [quantity, setQuantity] = useState({});
  const [selectedDate, setSelectedDate] = useState("");

  const [searchParams] = useSearchParams();


  const safeMinPrice = Number(minPrice) || 0;
  const safeMaxPrice = Number(maxPrice) || 15000;
  
  let currentReqId = 0;
  let currentController = null;
  
  useEffect(() => {
    const TOUR_CACHE_KEY = `tour-data`;
    const reqId = ++currentReqId;
    const startedAt = Date.now();  

    if (currentController) {
        currentController.abort();
    }

    currentController = new AbortController();
    const signal = currentController.signal;    

    // console.log(".. cachedData", cachedData)
    const cachedEntry = primeStateFromCache(TOUR_CACHE_KEY, (cachedData) => {
      setTours(cachedData);
      if (cachedData?.title) document.title = `TourWise | ${cachedData.title}`;
    });


    const strategy = searchParams.get('strategy');
    const finalSTR = (strategy || window.__CACHE_STRATEGY__ || 'ETAGONLY').toUpperCase();
    const ttl = parseTTLms(finalSTR);
    // 2) TTL check — skip fetch if cache still valid

    console.log("...Date.now() < cachedEntry?.expires", Date.now() < cachedEntry?.expires)
    console.log("... cachedEntry.data",cachedEntry.data[0].tourcard.item_type);


    if (
        ttl > 0 &&
        cachedEntry &&
        typeof cachedEntry?.expires === 'number' &&
        Date.now() < cachedEntry?.expires
    ) {
        const now = Date.now();
        const expiresAt = cachedEntry?.expires;
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

    // 3) Prepare headers for ETag
    const headers = {};
    // console.log("...cachedEntry?.etag 111",cachedEntry?.etag)
    if (cachedEntry?.etag) {
        headers['If-None-Match'] = cachedEntry.etag;
        console.log(".... → Sending If-None-Match:", headers['If-None-Match']);
    }

    const ac = new AbortController();
    const fetchSignal = ac.signal;

    fetch(`${apiBaseTour}/api/tc/tour-cards`, { method: 'GET', headers, signal: ac.signal,})
      .then(async res => {

        if (reqId !== currentReqId) {
            console.warn('fetchWithStrategy: ignoring stale response', { reqId, currentReqId });
            return {};
        }

        console.log("...RES STATUS ", res.status)

        if (res.status === 304 && cachedEntry?.data) {
            console.log(".... ♻️ Using cached data, ETag matched:", cachedEntry.etag);
            cacheSet(TOUR_CACHE_KEY, { data: cachedEntry.data, etag: cachedEntry.etag, ttl, fetchedAt: Date.now() });
            return { data: cachedEntry.data, etag: cachedEntry.etag, from304: true };
        }

        if (!res.ok) throw new Error("Tour not found");

        const text = await res.text();
        try {
          const data = JSON.parse(text);

          if (!data) return; // nothing to do

          const etag = res.headers.get("ETag") || null;

          if (fetchSignal.aborted) return;

          // Always cache fresh data (and bump TTL even for 304)
          cacheSet(TOUR_CACHE_KEY, { data, etag, ttl, fetchedAt: Date.now() });

          if (reqId === currentReqId) {
              setTours(data || []);
              if (data?.title) document.title = `TourWise | ${data.title}`;
              console.log("...done");
          } else {
              console.warn('fetchWithStrategy: response arrived but request is stale, ignoring setTour');
          }

        } catch (jsonErr) {
          console.error("❌ JSON parse error:", jsonErr);
        }
      })
      .catch(err => {
        console.error("❌ Fetch failed:", err);
      });
  }, []);


  function CartIcon() {
    const { cartItems } = useCart();

    return (
      <div style={{ position: 'relative', marginLeft: 'auto' }}>
        <Link to="/cart" style={{ fontSize: '2.2rem', textDecoration: 'none' }}>
          🛒
        </Link>

        {cartItems.length > 0 && (
          <span style={{
            position: 'absolute',
            top: '-0.3rem',
            right: '-0.6rem',
            backgroundColor: 'red',
            color: 'white',
            borderRadius: '50%',
            padding: '0.2rem 0.5rem',
            fontSize: '0.75rem',
            fontWeight: 'bold',
            lineHeight: '1',
            minWidth: '1.5rem',
            textAlign: 'center'
          }}>
            {cartItems.length}
          </span>
        )}
      </div>
    );
  }


  const handleCardClick = (tour) => {
    if (tour.tourcard.slug) {
      console.log(`🟢 Navigating to /tour/${tour.tourcard.slug} (ID: ${tour.tourcard.tour_id})`);

      navigate(`/tour/${tour.tourcard.slug}?strategy=ttl1h`);
    } else {
      console.warn('⚠️ Missing slug for tour:', tour);
    }
  };

  const normalize = str => str.toLowerCase().replace(/\s+/g, '');


  const filteredTours = tours.filter(tour => {
      const tc = tour?.tourcard;
      if (!tc) return false;
      if (tc.item_type !== "tour") return false;

      const searchNormalized = normalize(searchTerm || '');
      const locationFilterNormalized = normalize(locationFilter || '');
      const titleNormalized = normalize(tc.title || '');
      const locationNormalized = normalize(tc.location || '');
      const priceValue = Number(tc.price || 0);

      const matchesSearch = titleNormalized.startsWith(searchNormalized);
      const matchesLocation = locationNormalized.startsWith(locationFilterNormalized);
      const matchesPrice = priceValue >= safeMinPrice && priceValue <= safeMaxPrice;
      return matchesSearch && matchesLocation && matchesPrice;
    });


  useEffect(() => {
    const userId = 1; // Replace with dynamic ID if available
    loadCart(userId);
  }, []);

  return (
    <div className={styles.browseContainer}>
      <header className={styles.browseHeader}>
        <div className={styles.logoSection}>
          <Link to="/">
            <img src={`${base}/images/tourwise.png`} alt="TourWise Logo" className={styles.logoImage} />
          </Link>
          <Link to="/">
            <span className={styles.logoText}>TourWise</span>
          </Link>
        </div>
        <div className={styles.searchBarWrapper}>
          <input
            type="text"
            placeholder="🔍 Search tours"
            className={styles.searchBar}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => setLocationFilter('')}
          />
          <CartIcon />
        </div>
      </header>

      <div className={styles.browseWrapper}>
        <aside className={styles.filterPanel}>
          <h2 className={styles.filterTitle}>Filters</h2>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Location</label>
            <input
              type="text"
              className={styles.filterInput}
              placeholder="Enter location"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              onFocus={() => setSearchTerm('')}
            />
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Price Range</label>
            <div className={styles.priceRangeInputs}>
              <input
                type="number"
                min="0"
                value={minPrice}
                onChange={(e) => setMinPrice(Number(e.target.value))}
                className={styles.priceInput}
                placeholder="Min"
              />
              <span>to</span>
              <input
                type="number"
                min={minPrice}
                value={maxPrice}
                onChange={(e) => setMaxPrice(Number(e.target.value))}
                className={styles.priceInput}
                placeholder="Max"
              />
            </div>
            <input
              type="range"
              min={minPrice}
              max="15000"
              value={maxPrice}
              onChange={(e) => setMaxPrice(Number(e.target.value))}
              className={styles.filterRange}
            />
            <p className={styles.priceDisplay}>
              ₱ {minPrice.toLocaleString()} – ₱ {maxPrice.toLocaleString()}
            </p>
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Rating</label>
            <div className={styles.filterStars}>
              {[1, 2, 3, 4, 5].map(star => (
                <span key={star}>★</span>
              ))}
            </div>
          </div>
        </aside>

        <div className={styles.browseContent}>
          <div className={styles.tourGrid}>
          {filteredTours
                .filter(tour => tour?.tourcard?.item_type === 'tour')
                .map((tour, index) => {
                  const isInCart = cartItems.some(item => item.item_id === tour.tourcard.item_id);
                  // console.log('Checking if tour is in cart:', {
                  //   cartItems,
                  //   currentTourId: tour.tourcard.item_id
                  // });


                return (
                  <div
                    key={index}
                    className={styles.tourCard}
                    onClick={() => handleCardClick(tour)}
                  >
                    <img
                      src={tour.tourcard.image.includes('/images')
                        ? `${base}${tour.tourcard.image}`
                        : `${baseimageurl}${tour.tourcard.image}`}
                       

                      alt={tour.tourcard.title}
                      className={styles.tourCardImage}
                    />
                    <div className={styles.tourCardDetails}>
                      <h3 className={styles.tourTitle}>{tour.tourcard.title}</h3>
                      <p className={styles.tourDescription}>{tour.tourcard.description}</p>
                      <p className={styles.tourPrice}>₱ {Number(tour.tourcard.price).toLocaleString()}</p>
                      <p className={styles.tourSlots}>🎟️ {tour.tourcard.available_slots} slots available</p>
                      <p className={styles.tourDates}>
                        📅 {tour.tourcard.start_date && tour.tourcard.end_date ? (
                          <>
                            {new Date(tour.tourcard.start_date).toLocaleDateString('en-PH', {
                              weekday: 'short',
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric'
                            })} –{' '}
                            {new Date(tour.tourcard.end_date).toLocaleDateString('en-PH', {
                              weekday: 'short',
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric'
                            })}
                          </>
                        ) : 'Date not set'}
                      </p>

                      <label htmlFor="tourDate"> Select Tour Date:  </label>
                      <input
                        type="date"
                        onClick={(e) => e.stopPropagation()}
                        id="tourDate"
                        min="2025-06-03"
                        max="2026-06-28"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                      />


                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <input
                          type="number"
                          min="1"
                          value={quantity[tour.tourcard.item_id] || 1}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            const qty = Math.max(1, parseInt(e.target.value) || 1);
                            setQuantity(prev => ({ ...prev, [tour.tourcard.item_id]: qty }));
                          }}
                          style={{
                            width: '60px',
                            padding: '0.25rem',
                            borderRadius: '4px',
                            border: '1px solid #ccc'
                          }}
                        />



                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isInCart)
                              console.log('Adding to cart:', {
                                ...tour,
                                item_id: tour.tourcard.item_id,               // ✅ send legacy item_id (2) to backend
                                quantity: quantity[tour.tourcard.item_id] || 1,
                                type: 'tour',
                                selected_date: selectedDate
                              });
                            addToCart({
                              ...tour,
                              item_id: tour.tourcard.item_id,               // ✅ send legacy item_id (2) to backend
                              quantity: quantity[tour.tourcard.item_id] || 1,    // ✅ still use id (31) to track quantity locally in UI
                              type: 'tour',
                              selected_date: selectedDate
                            });

                            // { console.log('Adding to cart:', { tour }) }
                          }}
                          style={{
                            padding: '0.3rem 0.75rem',
                            backgroundColor: '#007bff',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          {isInCart ? '✅ Added' : '➕ Add to Cart'}
                        </button>
                      </div>

                      {/* ✅ Show computed price (price × quantity) */}
                      <p style={{ marginTop: '0.25rem', fontWeight: 'bold' }}>
                        🧮 Total: ₱{(parseFloat(tour.tourcard.price) * (quantity[tour.tourcard.item_id] || 1)).toFixed(2)}
                      </p>


                    </div>
                  </div>
                );
              })}

            {filteredTours.length === 0 && (
              <p className={styles.noResultsMessage}>No matching tours found.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
