// (no change) import lines kept the same
import { apiBaseTour, frontendBase } from '../config';
import { useRef, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import styles from './TourPage.module.css';
import './TourPage.css' // This is used for the video player styles
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
const CACHE_TTL_MS = 15 * 60 * 1000; // ✨ CACHE: 5 minutes default TTL
const nowMs = () => Date.now();     // ✨ CACHE: simple time helper

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

export default function TourPage() {
    const [activeIndex, setActiveIndex] = useState(0);
    const { slug } = useParams();
    const [tour, setTour] = useState(null);
    const [error, setError] = useState('');
    const [selectedCategory, setSelectedCategory] = useState("Tour Videos");
    const [tourVideos, setTourVideos] = useState([]);
    const [showOverlay, setShowOverlay] = useState(false);

    const dateInputRef = useRef(null);
    const [selectedDate, setSelectedDate] = useState("");

    const [showMenu, setShowMenu] = useState(false);

    const [guides, setGuides] = useState([]);
    const [vendor, setVendor] = useState(null);
    const [loading, setLoading] = useState(false);

    const categoryRef = useRef(null);
    const videoRef = useRef(null);


   useEffect(() => {
        console.log("RES STATUS --------->111");
        const TOUR_CACHE_KEY = `tour:${slug}`;

        // 1) Prime UI from cache (fast paint)
        const cachedEntry = primeStateFromCache(TOUR_CACHE_KEY, (cachedData) => {
            setTour(cachedData);
            setTourVideos(cachedData?.videos || []);
            if (cachedData?.title) document.title = `TourWise | ${cachedData.title}`;
        });
        // ^ expected shape: { data, etag } returned, and callback receives the *data*.
        // If your helper returns something else, adjust names accordingly.

        // 2) Prepare headers with prior ETag (exact string as received, quotes included)
        const headers = {};
        if (cachedEntry?.etag) {
            headers["If-None-Match"] = cachedEntry.etag;
            console.log("→ Sending If-None-Match:", headers["If-None-Match"]);
        }

        // 3) Abort setup (avoid setState after slug changes)
        const ac = new AbortController();
        console.log("RES STATUS --------->");
        fetch(`${apiBase}/api/tp/tours/${slug}`, { headers, signal: ac.signal })
            .then(async (res) => {
            console.log("RES STATUS --------->", res.status);
                
            // 304 path: reuse cached
            if (res.status === 304 && cachedEntry?.data) {
                console.log("♻️ Using cached data, ETag matched:", cachedEntry.etag);
                return { data: cachedEntry.data, etag: cachedEntry.etag, from304: true };
            }

            if (!res.ok) throw new Error("Tour not found");

            const data = await res.json();
            // NOTE: requires server CORS header:
            //   Access-Control-Expose-Headers: ETag
            const etag = res.headers.get("ETag") || null;
            console.log("📡 Response status:", res.status, "ETag from server:", etag);

            return { data, etag, from304: false };
            })
            .then(({ data, etag, from304 }) => {
            if (ac.signal.aborted) return; // guard

            // Only cache fresh bodies (not 304)
            if (!from304) cacheSet(TOUR_CACHE_KEY, { data, etag });

            setTour(data);
            setTourVideos(data?.videos || []);
            if (data?.title) document.title = `TourWise | ${data.title}`;
            })
            .catch((err) => {
            if (ac.signal.aborted) return;
            console.error("❌ Failed to load tour:", err);
            if (!cachedEntry?.data) setError("Tour not found or server error.");
            });

        return () => ac.abort();
        }, [slug]);


    useEffect(() => {
        const handleScroll = () => {
            setShowOverlay(window.scrollY > 100);
        };

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);    

    // console.log('API BASE', apiBase);

//    useEffect(() => {
//         const TOUR_CACHE_KEY = `tour:${slug}`;

//         // 1) Prime UI from cache (fast paint)
//         const cachedEntry = primeStateFromCache(TOUR_CACHE_KEY, (cachedData) => {
//             setTour(cachedData);
//             setTourVideos(cachedData?.videos || []);
//             if (cachedData?.title) document.title = `TourWise | ${cachedData.title}`;
//         });
//         // ^ expected shape: { data, etag } returned, and callback receives the *data*.
//         // If your helper returns something else, adjust names accordingly.

//         // 2) Prepare headers with prior ETag (exact string as received, quotes included)
//         const headers = {};
//         if (cachedEntry?.etag) {
//             headers["If-None-Match"] = cachedEntry.etag;
//             console.log("→ Sending If-None-Match:", headers["If-None-Match"]);
//         }

//         // 3) Abort setup (avoid setState after slug changes)
//         const ac = new AbortController();

//         fetch(`${apiBase}/api/tours/${slug}`, { headers, signal: ac.signal })
//             .then(async (res) => {
//             console.log("RES STATUS --------->", res.status);

//             // 304 path: reuse cached
//             if (res.status === 304 && cachedEntry?.data) {
//                 console.log("♻️ Using cached data, ETag matched:", cachedEntry.etag);
//                 return { data: cachedEntry.data, etag: cachedEntry.etag, from304: true };
//             }

//             if (!res.ok) throw new Error("Tour not found");

//             const data = await res.json();

//             // NOTE: requires server CORS header:
//             //   Access-Control-Expose-Headers: ETag
//             const etag = res.headers.get("ETag") || null;
//             console.log("📡 Response status:", res.status, "ETag from server:", etag);

//             return { data, etag, from304: false };
//             })
//             .then(({ data, etag, from304 }) => {
//             if (ac.signal.aborted) return; // guard

//             // Only cache fresh bodies (not 304)
//             if (!from304) cacheSet(TOUR_CACHE_KEY, { data, etag });

//             setTour(data);
//             setTourVideos(data?.videos || []);
//             if (data?.title) document.title = `TourWise | ${data.title}`;
//             })
//             .catch((err) => {
//             if (ac.signal.aborted) return;
//             console.error("❌ Failed to load tour:", err);
//             if (!cachedEntry?.data) setError("Tour not found or server error.");
//             });

//         return () => ac.abort();
//         }, [slug]);


//     useEffect(() => {
//         const handleScroll = () => {
//             setShowOverlay(window.scrollY > 100);
//         };

//         window.addEventListener('scroll', handleScroll);
//         return () => window.removeEventListener('scroll', handleScroll);
//     }, []);


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

    const backgroundVideos = tourVideos.filter(v => v.category === 'Tour Videos' && v.video_id).slice(0, 3);

    useEffect(() => {
        if (backgroundVideos.length <= 1) return;

        const interval = setInterval(() => {
            setActiveIndex(prev => (prev + 1) % backgroundVideos.length);
        }, 15000);

        return () => clearInterval(interval);
    }, [backgroundVideos.length]);

    useEffect(() => {
        if (!tour?.item_id) return; // ✅ Safe guard with optional chaining

        // ✨ CACHE: key per tour item_id for guides
        const GUIDES_CACHE_KEY = `guides:${tour.item_id}`;

        // ✨ CACHE: prime guides list quickly if cached
        primeStateFromCache(GUIDES_CACHE_KEY, (cachedGuides) => {
            setGuides(cachedGuides.guides || []);
        });

        // ✨ CACHE: Try conditional fetch for guides (if server supports ETag)
        const cached = cacheGet(GUIDES_CACHE_KEY);
        const headers = {};
        if (cached?.etag) headers['If-None-Match'] = cached.etag; // ✨ CACHE

        fetch(`${apiBase}/api/tr/tours/${tour.item_id}/guides`, { headers }) // ✨ CACHE
            .then(async res => {
                if (res.status === 304 && cached?.data) {
                    return { data: cached.data, etag: cached.etag, from304: true };
                }
                const data = await res.json();
                const etag = res.headers?.get?.('ETag') || null; // ✨ CACHE
                return { data, etag, from304: false };
            })
            .then(({ data, etag, from304 }) => {
                if (!from304) cacheSet(GUIDES_CACHE_KEY, { data, etag }); // ✨ CACHE
                setGuides(data.guides || []);
            })
            .catch(err => console.error("Error fetching guides:", err));
    }, [tour]);

    useEffect(() => {
        // console.log("📌 Tour data:", tour); // Log tour to confirm vendor_id presence

        if (!tour || !tour?.vendor?.vendor_id) {
            // console.log("⚠️ No tour or vendor_id found, skipping vendor fetch.");
            return;
        }

        async function fetchVendor() {
            // ✨ CACHE: vendor cache key
            const VENDOR_CACHE_KEY = `vendor:${tour?.vendor?.vendor_id}`;

            // ✨ CACHE: prime vendor UI with cached
            primeStateFromCache(VENDOR_CACHE_KEY, (cachedVendor) => {
                setVendor(cachedVendor);
            });

            setLoading(true);
            try {
                const cached = cacheGet(VENDOR_CACHE_KEY);
                const headers = {};
                if (cached?.etag) headers['If-None-Match'] = cached.etag; // ✨ CACHE

                const response = await fetch(`${apiBase}/api/tr/vendors/${tour?.vendor?.vendor_id}`, { headers }); // ✨ CACHE
                if (response.status === 304 && cached?.data) {
                    setVendor(cached.data);
                    return;
                }

                if (!response.ok) throw new Error(`Failed to fetch vendor: ${response.status}`);
                const data = await response.json();

                // Convert certifications and awards to arrays
                data.certifications = data.certifications
                    ? data.certifications.split(",").map((c) => c.trim())
                    : [];
                data.awards = data.awards
                    ? data.awards.split(",").map((a) => a.trim())
                    : [];

                const etag = response.headers.get('ETag') || null; // ✨ CACHE
                cacheSet(VENDOR_CACHE_KEY, { data, etag });        // ✨ CACHE
                setVendor(data);
            } catch (err) {
                console.error("❌ Error fetching vendor:", err);
                setVendor(null);
            } finally {
                setLoading(false);
            }
        }

        fetchVendor();
    }, [tour]);

    if (error) return <div className={styles.tourContainer}>{error}</div>;
    if (!tour) return <div className={styles.tourContainer}>Loading...</div>;

    const imagePath = tour.image || '';
    const imageUrl = imagePath.startsWith('/uploads/images/')
        ? `${urlBase}${imagePath.replace('/uploads', '')}`
        : `${apiBase}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;

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

            const matchingVideos = tour.videos.filter(video => video.category === value);
            if (matchingVideos.length > 0 && videoRef.current) {
                videoRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
                document.getElementById('tourContentStart')?.scrollIntoView({ behavior: 'smooth' });
            }
        }

        setTimeout(() => {
            if (value === 'Tour Videos') {
                videoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
                const matchingVideos = tour.videos.filter(video => video.category === value);
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
                item_id: tour.item_id,
                quantity: 1,
                selected_date: selectedDate,
                total_price: tour?.price
            };
            // console.log("TOTAL PRICE ===>", tour?.total_price)
            // console.log("🛒 Adding to cart with payload:", payload);

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
                <h1 className={styles.browseTitleInline}>{tour.title}</h1>
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
                        <h1>{tour.tour_title}</h1>
                        <p>{tour.tour_location}</p>
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
                    .reverse()
                    .map((video, idx) => (
                        <div key={idx} className={styles.videoCard}>
                            <div className={`${styles.dayOverlay} ${showOverlay ? styles.visible : styles.hidden}`}>
                                Day {idx + 1}
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

            {tour.history_images && tour.history_images.length > 0 && (
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
                            {tour.history_images
                                .filter(item => item.image_path?.trim() && item.category === selectedCategory)
                                .slice(0, 10)
                                .map((item, index) => {
                                    const layoutClass = index % 2 === 0 ? styles.left : styles.right;
                                    const imageUrl = item.image_path.startsWith('/uploads/images/')
                                        ? `${urlBase}${item.image_path.replace('/uploads', '')}`
                                        : `${apiBase}${item.image_path.startsWith('/') ? '' : '/'}${item.image_path}`;

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
                    {tour.inclusions && String(tour.inclusions).trim().length > 0 && (
                        <section className={styles.tourSection}>
                            <h2>What’s Included</h2>
                            <WhatsIncluded
                                inclusions={String(tour.inclusions).split(";").map(s => s.trim()).filter(Boolean)}
                                exclusions={String(tour.exclusions || "").split(";").map(s => s.trim()).filter(Boolean)}
                            />
                        </section>
                    )}

                    {tour.tour_itinerary && String(tour.tour_itinerary).trim().length > 0 && (
                        <section className={styles.tourSection}>
                            <h2>Tour Itinerary</h2>
                            <TourItinerary
                                itineraries={(() => {
                                    try {
                                        return JSON.parse(tour.tour_itinerary || "[]");
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
                    {guides.length === 0 ? (
                        <p>No guides assigned yet for this tour.</p>
                    ) : (
                        <div className={styles.guideList}>
                            {guides.map((guide) => (
                                <div key={guide.guide_id} className={styles.guideCard}>
                                    <img
                                        src={guide.photo || "https://via.placeholder.com/100"}
                                        alt={guide.name}
                                        className={styles.guidePhoto}
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

            {selectedCategory === "Tour Owner Info" && tour.vendor && (
                <div className={styles.guideSection}>
                    <h3>🏢📋 About the Tour Vendor</h3>
                    <div className={styles.guideList}>
                        <div className={styles.guideCard}>
                            <img
                                src={`https://ui-avatars.com/api/?name=${encodeURIComponent(tour.vendor.name)}&background=random`}
                                alt={tour.vendor.name}
                                className={styles.guidePhoto}
                            />

                            <h4>{tour.vendor.name}</h4>
                            <p><strong>Email:</strong> {tour.vendor.email || "Not provided"}</p>
                            <p><strong>Phone:</strong> {tour.vendor.phone || "Not provided"}</p>
                            <p><strong>WhatsApp:</strong> {tour.vendor.whatsapp || "Not provided"}</p>
                            <p><strong>Rating:</strong> ⭐ {tour.vendor.rating || "No rating yet"}</p>
                            <p>
                                <strong>License:</strong>
                                {tour.vendor.license_number
                                    ? `${tour.vendor.license_number}${tour.vendor.license_expiry ? ` (expires on ${new Date(tour.vendor.license_expiry).toLocaleDateString()})` : ""}`
                                    : "No license information available"}
                            </p>

                            <p><strong>Certifications:</strong></p>
                            <ul>
                                {tour.vendor.certifications?.length > 0
                                    ? tour.vendor.certifications.map((cert, idx) => <li key={idx}>{cert}</li>)
                                    : <li>No certifications listed</li>}
                            </ul>

                            <p><strong>Awards:</strong></p>
                            <ul>
                                {tour.vendor.awards?.length > 0
                                    ? tour.vendor.awards.map((award, idx) => <li key={idx}>{award}</li>)
                                    : <li>No awards listed</li>}
                            </ul>

                            <p><strong>Description:</strong></p>
                            <p>{tour.vendor.description || "No description available."}</p>

                            <button
                                disabled={!tour.vendor.whatsapp}
                                onClick={() => tour.vendor.whatsapp && window.open(`https://wa.me/${tour.vendor.whatsapp.replace(/\D/g, '')}`, '_blank')}
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
                            let tips = tour.tips;
                            if (typeof tips === 'string' && tips.trim().startsWith('[')) {
                                try {
                                    tips = JSON.parse(tips);
                                } catch (e) {
                                    console.error("Parsing error:", e);
                                    tips = [];
                                }
                            }

                            return (tips || []).map((item, idx) => (
                                <li key={idx}>{item.trim()}</li>
                            ));
                        })()}
                    </ul>
                </section>
            )}
        </div>
    );
}
