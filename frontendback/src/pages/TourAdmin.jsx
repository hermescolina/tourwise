import React, { useState, useEffect } from 'react';
import { apiBaseTour, frontendBase } from '../config';
import { Link, useSearchParams } from 'react-router-dom';
import styles from './TourAdmin.module.css';

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
  const PROBE_URL = `${apiBaseTour}/api/ta/touradmin-probe`;
  const res = await fetch(`${PROBE_URL}?ver=${encodeURIComponent(clientVer || "")}`, { cache: "no-store" });
  if (!res.ok) throw new Error("probe failed: " + res.status);
  const text = (await res.text()).trim();
  return text; // raw value from backend
}


export default function TourAdmin() {
    const [isEditing, setIsEditing] = useState(false);
    const [editingSlug, setEditingSlug] = useState(null);
    const [tours, setTours] = useState([]);
    const [categories, setCategories] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const base = `${frontendBase}/tourism-analytics/`;
    const imageBase = `${apiBaseTour}`;

    const PROBE_INTERVAL_MS = 60_000; // 1 minute

    const [form, setForm] = useState({
        title: '', slug: '', location: '', price: '',
        description: '', start_date: '', end_date: '',
        available_slots: '', category_id: '', image: null, existingImage: null
    });

    const [cats, setCats] = useState([]);

    const [searchParams] = useSearchParams();

    // put this near top of component scope so it survives re-renders
    let currentReqId = 0;
    let currentController = null;

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

    
    // module-level (once)
    const inFlightProbes = new Map();  // key -> Promise
    const _lastProbeAt = new Map();    // key -> nextAllowedTimestamp

    const fetchWithStrategy = async () => {
    const TOUR_CACHE_KEY = 'BrowseTours:/api/ta/touradmin-data';
    const key = TOUR_CACHE_KEY;                   // use `key` consistently
    const reqId = ++currentReqId;
    let ttl_flag = 0;

    // Cancel previous pending fetch for fetch API (if any)
    if (currentController) {
        try { currentController.abort(); } catch (_) {}
    }

    // 1) Prime UI from cache (fast paint)
    const cachedEntry = primeStateFromCache(TOUR_CACHE_KEY, (cachedData) => {
        console.log("... cachedData", cachedData);
        setTours(cachedData);
        if (cachedData?.title) document.title = `TourWise | ${cachedData.title}`;
    });

    const strategy = searchParams.get('strategy');
    const finalSTR = (strategy || window.__CACHE_STRATEGY__ || 'ETAGONLY').toUpperCase();
    const ttl = parseTTLms(finalSTR);

    // Only consider cache-based short-circuit when TTL valid
    if (
        ttl > 0 &&
        cachedEntry &&
        typeof cachedEntry.expires === 'number' &&
        Date.now() < cachedEntry.expires
    ) {
        // ensure clientVer is defined
        
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

        // Reserve next allowed probe time immediately to avoid races
        _lastProbeAt.set(key, Date.now() + PROBE_INTERVAL_MS);

        // Start the probe (store the Promise so other callers can await)
        const probePromise = (async () => {
        try {
            const updateNeeded = await probeBackend(clientVer);

            if (updateNeeded === "0") {
                console.log("... probe says no update — use cache");
                skipFetchUseCache(cachedEntry, ttl, setTours);
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
            skipFetchUseCache(cachedEntry, ttl, setTours);
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
    console.log(".... check pass 1",signal)
    
    try {
        const res = await fetch(`${apiBaseTour}/api/ta/touradmin-data`, { headers, signal });
        console.log(".... check pass 2")
        // stale-response guard
        if (reqId !== currentReqId && ttl_flag === 0) {
            console.warn('fetchWithStrategy: ignoring stale response (reqId)', { reqId, currentReqId });
            console.log(".... check pass 3")
            return;
        }
        console.log(".... check pass 4")

        console.log(".... res status", res.status);

        // 304 → reuse cached entry and update expires perhaps
        if (res.status === 304 && cachedEntry?.data) {
            console.log(".... ♻️ Using cached data, ETag matched:", cachedEntry.etag);
            cacheSet(TOUR_CACHE_KEY, { data: cachedEntry.data, etag: cachedEntry.etag, ttl, fetchedAt: Date.now() });
            setTours(cachedEntry.data || []);
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
            console.log("...b4 done data",data);
            setTours(data || []);
            console.log("...done",tours);
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


    useEffect(() => {
        const header = document.querySelector(`.${styles.topNav}`);

        const handleScroll = () => {
            const rect = header?.getBoundingClientRect();
        };

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);


    useEffect(() => {
        fetchWithStrategy();
        fetchCategories();
    }, []);

    const fetchCategories = async () => {
        try {
            const res = await fetch(`${apiBaseTour}/api/categories`);
            const data = await res.json();
            setCategories(data);
        } catch (err) {
            console.error('Failed to fetch categories:', err);
        }
    };

    const handleChange = (e) => {
        setForm({ ...form, [e.target.name]: e.target.value });
    };

    const handleFileChange = (e) => {
        setForm({ ...form, image: e.target.files[0] });
    };

    const handleEdit = (tour) => {
        function formatDate(dateString) {
            if (!dateString) return '';
            const d = new Date(dateString);
            return d.toISOString().split("T")[0]; // "2025-08-26"
            }
            console.log("...tour",tour)
            setForm({
                title: tour.title || '',
                slug: tour.slug || '',
                location: tour.location || '',
                price: tour.price || '',
                description: tour.description || '',
                start_date: formatDate(tour.start_date),
                end_date: formatDate(tour.end_date),
                available_slots: tour.available_slots || '',
                category_id: tour.category_id || '',
                image: null,
                existingImage: tour.image || null
            });


        setIsEditing(true);
        setEditingSlug(tour.slug);

        // Optional: Log what is being set in the form
        console.log("🧾 Form state being set:", {
            title: tour.title || '',
            slug: tour.slug || '',
            location: tour.location || '',
            price: tour.price || '',
            description: tour.description || '',
            start_date: tour.start_date || '',
            end_date: tour.end_date || '',
            available_slots: tour.available_slots || '',
            category_id: tour.category_id || '',
            image: null,
            existingImage: tour.image || null
        });
        console.log("✏️ Editing slug:", tour.slug);
    };


    function handleDelete(slug) {
        if (window.confirm('Are you sure you want to delete this tour?')) {
            fetch(`${apiBaseTour}/api/delete-tour/${slug}`, {
                method: 'DELETE',
            })

                .then(res => res.json())
                .then(data => {
                    alert('Tour deleted successfully!');
                    // Optionally refresh list
                    window.location.reload();
                })
                .catch(err => {
                    console.error('Delete failed:', err);
                    alert('Error deleting tour.');
                });
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);

        const formData = new FormData();
        for (const key in form) {
            if (key !== 'image' && key !== 'existingImage') {
                formData.append(key, form[key]);
            }
        }
        if (form.image instanceof File) {
            formData.append('image', form.image);
        }

        const endpoint = isEditing
            ? `${apiBaseTour}/api/tours/${editingSlug}`
            : `${apiBaseTour}/api/tours`;
        const method = isEditing ? 'PUT' : 'POST';

        try {
            const response = await fetch(endpoint, { method, body: formData });
            if (!response.ok) {
                const error = await response.json();
                alert(`\u274C Error: ${error.error}`);
                return;
            }

            alert(isEditing ? '✅ Tour updated successfully!' : '✅ Tour added successfully!');
            setForm({ title: '', slug: '', location: '', price: '', description: '', start_date: '', end_date: '', available_slots: '', category_id: '', image: null, existingImage: null });
            setIsEditing(false);
            setEditingSlug(null);
        } catch (err) {
            console.error(err);
            alert('❌ Something went wrong. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className={styles.tourAdminContainer}>
            <div className={styles.topNav}>
                <div className={styles.logoSection}>
                    <Link to="/tour-cards">
                        <img
                            src={`${base}/tourwise.png`}
                            alt="TourWise"
                            className={styles.logoImage}
                        />
                    </Link>
                    <Link to="/tour-cards">
                        <div className={styles.titleBlock}>
                            <span className={styles.navTitle}>TourWise</span>
                            <span className={styles.subTitle}>Admin Panel</span>
                        </div>
                    </Link>

                </div>

            </div>

            <div className={styles.pageTitleBar}>
                <h2>{isEditing ? 'Edit Tour' : 'Add Tour'}</h2>
            </div>

            <form onSubmit={handleSubmit} className={styles.tourForm}>
                {['title', 'slug', 'location', 'price', 'description', 'start_date', 'end_date', 'available_slots'].map((field, i) => (
                    <div className={styles.formGroup} key={i}>
                        <label>
                            {field.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </label>

                        {field === 'description' ? (
                            <>
                                <textarea
                                    name={field}
                                    rows="6"
                                    maxLength={200}
                                    value={form[field]}
                                    onChange={handleChange}
                                    required
                                />
                                <p>{form[field]?.length || 0} / 200 characters</p>
                            </>
                        ) : (
                            <input
                                type={
                                    field.includes('date')
                                        ? 'date'
                                        : field === 'price' || field === 'available_slots'
                                            ? 'number'
                                            : 'text'
                                }
                                name={field}
                                value={form[field]}
                                onChange={handleChange}
                                required
                            />
                        )}
                    </div>

                ))}

                <div className={styles.formGroup}>
                    <label>Category</label>
                    <select name="category_id" value={form.category_id} onChange={handleChange} required>
                        <option value="">-- Select Category --</option>
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

                <div className={styles.formGroup}>
                    <label>Tour Image</label>
                    <input type="file" name="image" accept="image/*" onChange={handleFileChange} />

                    {form.image ? (
                        <div className={styles.imagePreview}>
                            <p>Preview:</p>
                            <img src={URL.createObjectURL(form.image)} alt="Preview" />
                        </div>
                    ) : form.existingImage ? (
                        (() => {
                            console.log("🖼️ Existing image:", form.existingImage);
                            const imageSrc = form.existingImage.startsWith('/images')
                                ? `${base}${form.existingImage}`
                                : `${imageBase}${form.existingImage}`;


                            // console.log("📸 Preview image src:", imageSrc);

                            return (
                                <div className={styles.imagePreview}>
                                    <p>Current Image:</p>
                                    <img src={imageSrc} alt="Current Tour" />
                                </div>
                            );
                        })()
                    ) : null}


                </div>

                {isEditing && (
                    <div className={styles.formGroup}>
                        <button className={styles.button} type="button" onClick={() => {
                            setIsEditing(false);
                            setEditingSlug(null);
                            setForm({ title: '', slug: '', location: '', price: '', description: '', start_date: '', end_date: '', available_slots: '', category_id: '', image: null, existingImage: null });
                        }
                        } style={{ marginBottom: '1rem' }}>
                            Cancel Edit
                        </button>
                    </div>
                )}

                <div className={styles.formGroup}>
                    <button className={styles.button} type="submit" disabled={isSubmitting}>
                        {isSubmitting ? 'Saving...' : 'Save Tour'}
                    </button>
                </div>
            </form>

            <table className={styles.adminTable}>
                <thead>
                    <tr>
                        <th>Title</th>
                        <th>Location</th>
                        <th>Price</th>
                        <th>Actions</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {/* {console.log("... tours",tours[0]?.tour.item_type)} */}
                    {tours 
                        .filter(t => t?.tour?.item_type === 'tour')
                        .map(t => {
                            const imageSrc = t.tour.image.startsWith('/images')
                                ? `${base}${t.tour.image}`
                                : `${imageBase}/uploads/${t.tour.image}`; //1234
                            return (
                                    <tr key={t?.tour?.slug}>
                                    <td>{t.tour.title}</td>
                                    <td>{t.tour.location}</td>
                                    <td>₱ {Number(t.tour.price).toLocaleString()}</td>
                                    <td>
                                        <img src={imageSrc} alt={t.tour.title} style={{ width: '80px', borderRadius: '6px' }} />
                                    </td>
                                    <td>
                                        <button onClick={() => handleEdit(t.tour)}>Edit</button>
                                        <button
                                            onClick={() => handleDelete(t.tour.slug)}
                                            style={{ backgroundColor: 'red', color: 'white' }}
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                </tbody>

            </table>
        </div>
    );
}