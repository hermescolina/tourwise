import { apiBaseTour, frontendBase } from '../config';
import { useEffect, useState } from 'react';
import './TourCardsAdmin.css'; 
import RoomTypeSelector from "./RoomTypeSelector";

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

  // ---------- Caching helpers (additions; nothing removed below) ----------
  const CACHE_KEY = 'BrowseTours:/api/touradmin-data';

  const qsStrategy = (() => {
    try {
      return new URLSearchParams(window.location.search).get('strategy');
    } catch {
      return null;
    }
  })();

  const STRATEGY = (qsStrategy || window.__CACHE_STRATEGY__ || 'ETAGONLY').toUpperCase();

 
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


  const loadFromCache = () => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const saveToCache = (data, etag) => {
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ data, etag: etag || null, ts: Date.now() })
      );
    } catch {}
  };

  const fetchWithStrategy = async () => {
    const ttl = parseTTLms(STRATEGY);
    const cached = loadFromCache();

    // TTL short-circuit: trust cache if still fresh
    if (ttl > 0 && cached && Date.now() - cached.ts < ttl) {
      setTours(cached.data?.topTours || []);
      return; // honor "refresh at most every X"
    }

    // Build headers (ETag + strategy for backend)
    const headers = {};
    if (cached?.etag) headers['If-None-Match'] = cached.etag;
    headers['X-Cache-Strategy'] = STRATEGY;

    // Build URL (FORCEREFRESH → ?refresh=1)
    let url = `${apiBaseTour}/api/touradmin-data`;


    if (STRATEGY === 'FORCEREFRESH') {
      url += (url.includes('?') ? '&' : '?') + 'refresh=1';
    }

    try {
      const res = await fetch(url, { headers });

      // 304 → use cache
      if (res.status === 304 && cached) {
        setTours(cached.data?.topTours || []);
        return;
      }

      // Non-OK but have cache → graceful fallback
      if (!res.ok) {
        if (cached) {
          setTours(cached.data?.topTours || []);
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }

      // OK → store new data + ETag
      // const data = await res.json();
      let data;
      try {
          data = await res.json();
      } catch (e) {
          console.error("Failed to fetch Data:",e)
          return null;
      }

      // const etag = res.headers.get('ETag');
      let etag;
      try {
        etag = res.headers.get('ETag');
      } catch (e) {
        console.error("Failed to get ETag:", e)
        return null;
      }
      try {
        saveToCache(data, etag);
      } catch (e) {
      }

      try {
        setTours(data.topTours || []);
      } catch (e) {
      }
    } catch (err) {
      console.error('❌ Failed to load tours:', err);
      // Network error fallback: cache if present
      if (cached) {
        setTours(cached.data?.topTours || []);
      } else {
        setTours([]); // preserve existing behavior
      }
    }
  };
  // ---------- end helpers ----------

  useEffect(() => {
    fetchWithStrategy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // keep original lifecycle: run once on mount

  const handleOptionChange = (slug, option) => {
    setSelectedOptions(prev => ({
      ...prev,
      [slug]: option,
    }));
  };


  const handleCardClick = (tour) => { 
    const slug = tour?.slug;
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

    window.location.href = `/tourism-analytics/${path}/${encodeURIComponent(slug)}`;
  };


  const getImageUrl = (imagePath, title) => {
    if (!imagePath) return '/default.jpg';
    // console.log('Image Path:', imagePath);
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

  const filteredTours = tours.filter(tour => {
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

  console.log("data",filteredTours)
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
              .filter((tour) => {
                const match = selectedChildId.id === 0 || tour.category_id === selectedChildId.id;
                // console.log(`Selected: ${selectedChildId.id} | Tour category_id: ${tour.category_id} | Match: ${match}`);
                return match;
              })
              .map((tour, index) => (
                <div key={index} className="tour-card">
                  {/* {console.log("CAT ID ", tour.category_id)} */}
                  {/* {console.log('Tour image URL:', getImageUrl(tour.image, tour.title))} */}
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
                  {console.log("TOUR TYPE ==?",tour.item_type)}
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
                      onClick={() => handleCardClick(tour)}
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
              ))}

            {tours.length === 0 && (
              <p className="no-results-message">No tours to display.</p>
            )}
          </div>
        </div>
    </div>  
  );
}
