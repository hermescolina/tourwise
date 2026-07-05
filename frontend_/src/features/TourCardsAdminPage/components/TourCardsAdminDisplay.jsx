import { useSearchParams } from 'react-router-dom';
import { apiBaseTour, frontendBase } from '@/config';
import { useEffect, useState } from 'react';
import './TourCardsAdmin.css'; 
import RoomTypeSelector from "../../Common/components/RoomTypeSelector";

// ---------- Caching helpers (additions; nothing removed below) ----------
// ---------- Caching helpers (additions; nothing removed below) ----------
const nowMs = () => Date.now();
const CACHE_TTL_MS = 360 * 60 * 1000; // ✨ CACHE: 5 minutes default TTL
    // ✨ CACHE: simple time helper

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

async function probeBackend(clientVer) {
  const PROBE_URL = `${apiBaseTour}/api/tca/tourcardsadmin-probe`;
  const res = await fetch(`${PROBE_URL}?ver=${encodeURIComponent(clientVer || "")}`, { cache: "no-store" });
  if (!res.ok) throw new Error("probe failed: " + res.status);
  const text = (await res.text()).trim();
  return text; // raw value from backend
}

export default function BrowseTours() {
  const [tours, setTours] = useState([]);
  const [selectedOptions, setSelectedOptions] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [minPrice, setMinPrice] = useState(1000);
  const [maxPrice, setMaxPrice] = useState(15000);
  // Categories + selection
  const [cats, setCats] = useState([]);          // [{id,name,slug,children:[{id,name,...}]}]
  const [selectedChildId, setSelectedChildId] = useState({id: 0 , name: ""}); // store as string for select

  const safeMinPrice = Number(minPrice) || 0;
  const safeMaxPrice = Number(maxPrice) || 15000;

  const [searchParams] = useSearchParams();

  const PROBE_INTERVAL_MS = 60_000; // 1 minute

  function skipFetchUseCache(cachedEntry, ttl, setTours) {
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
        setTours(cachedEntry.data || []);
        return; // important: skip network when TTL valid
    }

  let currentReqId = 0;
  let currentController = null;

  // module-level (once)
  const inFlightProbes = new Map();  // key -> Promise
  const _lastProbeAt = new Map();    // key -> nextAllowedTimestamp

  const fetchWithStrategy = async () => {
    const TOUR_CACHE_KEY = 'BrowseTours:/api/tca/tourcardsadmin-data';
    const key = TOUR_CACHE_KEY;                   // use `key` consistently
    const reqId = ++currentReqId;
    let ttl_flag = 0;
    console.log("...check 1");
    // Cancel previous pending fetch for fetch API (if any)
    if (currentController) {
        try { currentController.abort(); } catch (_) {}
    }
    console.log("...check 2");
    
    // 1) Prime UI from cache (fast paint)
    const cachedEntry = primeStateFromCache(TOUR_CACHE_KEY, (cachedData) => {
        setTours(cachedData);
        if (cachedData?.title) document.title = `TourWise | ${cachedData.title}`;
    });

    console.log("...check 3");

    const strategy = searchParams.get('strategy');
    const finalSTR = (strategy || window.__CACHE_STRATEGY__ || 'ETAGONLY').toUpperCase();
    const ttl = parseTTLms(finalSTR);
    // Only consider cache-based short-circuit when TTL valid
    console.log("...check 3.1")
    if (
        ttl > 0 &&
        cachedEntry &&
        typeof cachedEntry?.expires === 'number' &&
        Date.now() < cachedEntry?.expires
    ) {
        // ensure clientVer is defined
        ttl_flag = 1;
        console.log("... ttl_flag", ttl_flag);
        const clientVer = cachedEntry?.etag ?? "";
        const now = Date.now();
        const nextAllowed = _lastProbeAt.get(key) || 0;

        // If still inside cooldown, use cache and stop
        if (now < nextAllowed) {
            console.log("⏳ Skipping fetch — still within probe interval", { now, nextAllowed });
            skipFetchUseCache(cachedEntry, ttl, setTours);
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
            skipFetchUseCache(cachedEntry, ttl, setTours);
            return;
        }
        console.log("...check 4");

        // Reserve next allowed probe time immediately to avoid races
        _lastProbeAt.set(key, Date.now() + PROBE_INTERVAL_MS);
        console.log("...check 4.1");
        // Start the probe (store the Promise so other callers can await)
        const probePromise = (async () => {
        try {
            const updateNeeded = await probeBackend(clientVer);
            console.log("... updateNeeded", updateNeeded)

            if (updateNeeded === "0") {
                console.log("... probe says no update — use cache");
                skipFetchUseCache(cachedEntry, ttl, setTours);
                return { stoppedEarly: true };
            }

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
            console.log("... final needed")
            inFlightProbes.delete(key);
        }
        })();
        console.log("...check 5");
        // save the promise so concurrent calls won't start a second probe
        inFlightProbes.set(key, probePromise);
        // wait for the probe to finish, and inspect result
        let probeResult;
        try {
            probeResult = await probePromise;
        } catch (err) {
        // probe failed — decide your fallback: here we bail out and reuse cache
            console.warn("probe failed, falling back to cache:", err);
            skipFetchUseCache(cachedEntry, ttl, setTours);
            return;
        }
        // If the probe told us to stop early, we already used cache above
        if (probeResult?.stoppedEarly) {
            return;
        }

        // else: probe indicates updateNeeded !== "0", so fallthrough to actual fetch
    }
    console.log("...ttl_flag outside", ttl_flag)
    // ---- actual network fetch (runs only if TTL invalid or probe decided updateNeeded) ----
    const headers = {};
    if (cachedEntry?.etag) {
        headers['If-None-Match'] = cachedEntry.etag;
        console.log(".... → Sending If-None-Match:", headers['If-None-Match']);
    }

    currentController = new AbortController();
    const signal = currentController.signal;
    console.log("... signal", signal)

    try {
        const res = await fetch(`${apiBaseTour}/api/tca/tourcardsadmin-data`, { headers, signal });
        console.log(".... check pass 1")
        // stale-response guard 1234
        if (reqId !== currentReqId && ttl_flag === 0) { 
            console.warn('fetchWithStrategy: ignoring stale response (reqId)', { reqId, currentReqId });
            console.log(".... check pass 13")
            return;
        }
        console.log(".... check pass 2")

        // 304 → reuse cached entry and update expires perhaps
        if (res.status === 304 && cachedEntry?.data) {
            console.log(".... ♻️ Using cached data, ETag matched:", cachedEntry.etag);
            cacheSet(TOUR_CACHE_KEY, { data: cachedEntry.data, etag: cachedEntry.etag, ttl, fetchedAt: Date.now() });
            setTours(cachedEntry.data || []);
            return;
        }

        console.log(".... check pass 3")

        if (!res.ok) {
            console.error('fetchWithStrategy: non-ok response', res.status);
            return;
        }

        console.log(".... check pass 4")
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
            setTours(data || []);
            console.log("...done");
        } else {
            console.warn('fetchWithStrategy: response arrived but request is stale, ignoring setTours');
        }
    } catch (err) {
        if (err.name === 'AbortError') {
            console.log('fetchWithStrategy: aborted previous fetch');
        } else {
            console.error('fetchWithStrategy: fetch failed', err);
        }
    }
  };
  
  // ---------- end helpers ----------

  useEffect(() => {
    fetchWithStrategy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // keep original lifecycle: run once on mount

  // useEffect(() => {
  //   const timeout = setTimeout(() => fetchWithStrategy(), 200);
  //   return () => clearTimeout(timeout);
  // }, [dependencies]);


  const handleOptionChange = (slug, option) => {
    setSelectedOptions(prev => ({
      ...prev,
      [slug]: option,
    }));
  };


  const handleCardClick = (slug) => { 
    if (!slug) return; // guard

    const selectedOption = selectedOptions[slug] || 'itinerary';

    // normalize: lower-case, collapse spaces -> hyphens
    const key = String(selectedOption).trim().toLowerCase().replace(/\s+/g, '-');

    // extended, tolerant map (includes your originals)
    const path =
      {
        'itinerary': 'upload-itinerary',
        'history': 'upload-history',
        'culture': 'upload-culture',

        // extras / aliases
        'inclusion': 'upload-inclusion',
        'inclusions': 'upload-inclusion',
        'exclusion': 'upload-exclusion',
        'exclusions': 'upload-exclusion',
        'tips': 'upload-tips',
        'expectations': 'upload-expectations',
        'videos': 'upload-videos',
        'tour-videos': 'upload-videos',
        'guides': 'upload-guides',
        'owner': 'upload-owner',
        'owner-info': 'upload-owner',

        // friendly phrases you’ve used elsewhere
        'about-the-tour': 'upload-about',
        'what-to-expect': 'upload-expectations',
        'history-and-culture': 'upload-culture',
        'tour-guides': 'upload-guides',
        'tour-owner-info': 'upload-owner',
      }[key] || 'upload-itinerary';

    window.location.href = `/tourism-analytics/${path}/${encodeURIComponent(slug)}?strategy=ttl1h`;
  };


  const getImageUrl = (imagePath, title) => {
    if (!imagePath) return '/default.jpg';
    return imagePath.startsWith('/images/')
      ? `${frontendBase}/tourism-analytics${imagePath}`
      : `${apiBaseTour}${imagePath}`;

  };

  useEffect(() => {
    (async () => {
      try {
        const urls = [
          `${apiBaseTour}/api/cat/categories`,
        ];
        for (const url of urls) {
          const r = await fetch(url, { headers: { Accept: 'application/json' } });
          if (r.ok) {
            const json = await r.json();
            if (Array.isArray(json)) setCats(json);
            break;
          }
        }
      } catch (e) {
        console.error('❌ Failed to load categories:', e);
      }
    })();
  }, []);
  
  const normalize = str => str.toLowerCase().replace(/\s+/g, '');

  const filteredTours = tours.filter(item => {
    const tour = item.tour; // adjust to actual structure
    if (!tour) return false;
    const searchNormalized = normalize(searchTerm);
    const locationFilterNormalized = normalize(locationFilter);
    const titleNormalized = normalize(tour.title || '');
    const locationNormalized = normalize(tour.location || '');
    const priceValue = Number(tour.price);

    const matchesSearch = titleNormalized.startsWith(searchNormalized);
    const matchesLocation = locationNormalized.startsWith(locationFilterNormalized);
    const matchesPrice = priceValue >= safeMinPrice && priceValue <= safeMaxPrice;

    return matchesSearch && matchesLocation && matchesPrice;
});


  // console.log("data",filteredTours)
  return (
    <div className="browse-container">
      <div className="browseWrapper">
        <aside className="filterPanel">
        <h2 className="browse-title">
          {selectedChildId.name ? selectedChildId.name : "Tour Cards"}
        </h2>

          <input
          type="text"
          placeholder={`🔍 Search ${selectedChildId.name ? selectedChildId.name : "Tour Cards"}`}
          className="searchBar"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={() => setLocationFilter('')}
        />
          <h2 className="filterTitle">Filters</h2>

          <div className="filterGroup">
            <label className="filterLabel">Location</label>
            <input
              type="text"
              className="filterInput"
              placeholder="Enter location"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              onFocus={() => setSearchTerm('')}
            />
          </div>

          <div className="filterGroup">
            <label className="filterLabel">Price Range</label>
            <div className="priceRangeInputs">
              <input
                type="number"
                min="0"
                value={minPrice}
                onChange={(e) => setMinPrice(Number(e.target.value))}
                className="priceInput"
                placeholder="Min"
              />
              <span>to</span>
              <input
                type="number"
                min={minPrice}
                value={maxPrice}
                onChange={(e) => setMaxPrice(Number(e.target.value))}
                className="priceInput"
                placeholder="Max"
              />
            </div>
            <input
              type="range"
              min={minPrice}
              max="15000"
              value={maxPrice}
              onChange={(e) => setMaxPrice(Number(e.target.value))}
              className="filterRange"
            />
            <p className="priceDisplay">
              ₱ {minPrice.toLocaleString()} – ₱ {maxPrice.toLocaleString()}
            </p>
          </div>

          <div className="filterGroup">
            <label className="filterLabel">Rating</label>
            <div className="filterStars">
              {[1, 2, 3, 4, 5].map(star => (
                <span key={star}>★</span>
              ))}
            </div>
          </div>
          <div>
            <label className="filterLabel">Category</label>
            <select
              className="priceInput" // reuse your input style; or add your own class
              value={selectedChildId.id}
              onChange={(e) => {
                const selectedId = Number(e.target.value || 0);
                const selectedOption = e.target.options[e.target.selectedIndex].text
                setSelectedChildId({id: selectedId, name: selectedOption})
              }}
            >
              <option value="">All categories</option>
              {cats.map((parent) => (
                <optgroup key={parent.id} label={parent.name}>
                  {(parent.children || []).map((child) => (
                    <option key={child.id} value={String(child.id)}>
                      {child.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </aside>

        {/* {console.log("Max Price ==>",maxPrice)} */}
        {/* {console.log("Data",filteredTours)} */}
      
        <div className="tour-grid">
            {filteredTours
              .filter((item) => {
                const tour = item.tour; 
                const match = selectedChildId.id === 0 || tour.category_id === selectedChildId.id;
                return match;
              })
              .map((item, index) => {
                    const tour = item.tour;
                  return (
                  <div key={index} className="tour-card">
                  <img
                    src={getImageUrl(tour.image, tour.title)}
                    alt={tour.title}
                    className="tour-card-image"
                  />
                  <div className="tour-card-details">
                    <h3 className="tour-title">{tour.title}</h3>
                    <p className="tour-description">{tour.description}</p>
                    <p className="tour-price">
                      ₱ {Number(tour.price).toLocaleString()}
                    </p>

                    {/* ✅ Category Buttons */}
                  {tour.item_type === "tour" && (
                      <div>
                        {/* Tour-specific UI here */}

                        <div className="tour-category-buttons" style={{ marginTop: '0.5rem' }}>
                      {['itinerary', 'history', 'Inclusion'].map(option => (
                        <button
                          key={option}
                          onClick={() => handleOptionChange(tour.slug, option)}
                          style={{
                            marginRight: '0.5rem',
                            padding: '5px 10px',
                            borderRadius: '5px',
                            border: 'none',
                            backgroundColor: selectedOptions[tour.slug] === option ? '#007bff' : '#e0e0e0',
                            color: selectedOptions[tour.slug] === option ? '#fff' : '#000',
                            cursor: 'pointer',
                            fontSize: '0.9rem'
                          }}
                        >
                          {option.charAt(0).toUpperCase() + option.slice(1)}
                        </button>
                      ))}
                    </div>
                      </div>
                    )}

                    {/* {tour.item_type === "hotel" && (
                      <div>
                        <h3>Hotel Booking</h3>
                        <RoomTypeSelector
                          value="Standard"
                          onChange={(val) => console.log("Selected room:", val)}
                        />
                      </div>
                    )} */}


                    {tour.item_type === "hotel" && (
                      <div>
                        <h3>Hotel Booking</h3>
                        <RoomTypeSelector
                          hotelId={tour.item_id}                // 👈 pass the hotel_id from your tour
                          value={null}                          // optional: start with no selection
                          onChange={(val) => console.log("Selected room:", val)}
                        />
                      </div>
                    )}

                    
                    {tour.item_type === "car" && (
                      <div>
                        <h3>Car Rental</h3>
                        {/* Car-specific UI */}
                        <label>Car Model:</label>
                        <select>
                          <option value="sedan">Sedan</option>
                          <option value="suv">SUV</option>
                          <option value="van">Van</option>
                        </select>
                      </div>
                    )}

                    
                    {/* ✅ Go Button */}
                    <button
                      onClick={() => handleCardClick(tour?.slug)}
                      style={{
                        marginTop: '0.8rem',
                        padding: '6px 14px',
                        backgroundColor: '#28a745',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        fontSize: '0.9rem'
                      }}
                    >
                      Go
                    </button>
                  </div>
                </div>
              )})}

            {tours.length === 0 && (
              <p className="no-results-message">No tours to display.</p>
            )}
          </div>
        </div>
    </div>  
  );
}
