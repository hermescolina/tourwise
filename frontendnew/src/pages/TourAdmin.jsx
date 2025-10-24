import React, { useState, useEffect } from 'react';
import { apiBaseTour, frontendBase } from '../config';
import { Link } from 'react-router-dom';

import styles from './TourAdmin.module.css';


export default function TourAdmin() {
    const [isEditing, setIsEditing] = useState(false);
    const [editingSlug, setEditingSlug] = useState(null);
    const [tours, setTours] = useState([]);
    const [categories, setCategories] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const base = `${frontendBase}/tourism-analytics/`;
    const imageBase = `${apiBaseTour}`;

    const [form, setForm] = useState({
        title: '', slug: '', location: '', price: '',
        description: '', start_date: '', end_date: '',
        available_slots: '', category_id: '', image: null, existingImage: null
    });

    const [cats, setCats] = useState([]);

    // ---------- Caching helpers (additions; nothing removed below) ----------
    const CACHE_KEY = 'BrowseTours:/api/ta/touradmin-data';
    const qsStrategy = (() => {
        try {
        return new URLSearchParams(window.location.search).get('strategy');
        } catch { return null; }
    })();
    const STRATEGY = (qsStrategy || window.__CACHE_STRATEGY__ || 'ETAGONLY').toUpperCase();

    const parseTTLms = (strategy) => {
        if (!strategy.startsWith('TTL')) return 0;
        const unit = strategy.slice(3); // e.g., "5M", "10M", "1H"
        const n = parseInt(unit, 10);
        if (!Number.isFinite(n)) return 0;
        if (unit.endsWith('M')) return n * 60 * 1000;
        if (unit.endsWith('H')) return n * 60 * 60 * 1000;
        return 0;
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

    const saveToCache = (data, etag, ttl = CACHE_TTL_MS) => {
        try {
            const now = Date.now();
            const payload = {
            data,
            etag: etag || null,
            expires: now + Math.max(1000, ttl) // store future expiry
            };
            localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
        } catch {
            // ignore quota errors silently
        }
        };


    const fetchWithStrategy = async () => {
        const ttl = parseTTLms(STRATEGY);
        const cached = loadFromCache();

        console.log("... ttl",ttl,cached,cached.ts)

        // TTL short-circuit: trust cache if still fresh
        if (
            ttl > 0 &&
            cached &&
            cached.ts &&
            Date.now() < cached.ts // check validity vs expiry
            ) {
            const now = Date.now();
            const ts = cached.ts;
            const expiresAt = typeof cached?.expires === 'number'
                ? cached.expires
                : (typeof cached?.ts === 'number' ? cached.ts + ttl : null);
            const remainingMs = Math.max(0, expiresAt - now);  // time left before expiry
            const writtenAt = expiresAt - ttl;                 // when cache was written
            const ageMs = Math.max(0, now - writtenAt);        // how old the cache is

            console.log(".... Skipping fetch — TTL still valid:", {
                ttl,
                ageMs,
                remainingMs,
                writtenAt: new Date(writtenAt).toISOString(),
                expiresAt: new Date(expiresAt).toISOString(),
                now,
                ts
            });

                setTours(cached.data || []);
                return; // no fe use primed state
            }

            if (
                ttl > 0 &&
                cached &&
                cached.ts &&
                Date.now() < cached.ts // check validity vs expiry
                ) {
                const now = Date.now();
                const expiresAt = cached.ts;
                const remainingMs = Math.max(0, expiresAt - now);  // time left before expiry
                const writtenAt = expiresAt - ttl;                 // when cache was written
                const ageMs = Math.max(0, now - writtenAt);        // how old the cache is

                console.log(".... Skipping fetch — TTL still valid:", {
                    ttl,
                    ageMs,
                    remainingMs,
                    writtenAt: new Date(writtenAt).toISOString(),
                    expiresAt: new Date(expiresAt).toISOString()
                });

                setTours(cached.data || []);
                return; // no fetch, use primed state
            }


        // Build headers (ETag + strategy for backend)

        const headers = {
            'X-Cache-Strategy': STRATEGY
        };
        if (cached?.etag) {
            headers['If-None-Match'] = cached.etag;
            console.log("Using cached etag:", cached.etag);
        }

        // Build URL (FORCEREFRESH → ?refresh=1)
        let url = `${apiBaseTour}/api/ta/touradmin-data`;
        
        if (STRATEGY === 'FORCEREFRESH') {
            url += (url.includes('?') ? '&' : '?') + 'refresh=1';
        }
        
        try {
        
            const res = await fetch(url, { headers });

            console.log("... res.status",res.status)

            // 304 → use cache
            if (res.status === 304 && cached) {
                setTours(cached.data || []);
                return;
            }
            // Non-OK but have cache → graceful fallback
            if (!res.ok) {
                if (cached) {
                    setTours(cached.data || []);
                    return;
                }
                throw new Error(`HTTP ${res.status}`);
            }

        // OK → store new data + ETag
            let data;
            try {
                data = await res.json();    
            } catch (error) {
                console.error('❌ Failed to parse data:', err);    
            }

            let etag;
            try {
                etag = res.headers.get('ETag');    
            } catch (error) {
                console.error('❌ Failed to get Etag:', err);    
            }
            console.log("... fetch data", data)
            try {
                saveToCache(data, etag);    
            } catch (error) {
                console.error('❌ Failed to save cache:', err);    
            }
            try {
                setTours(data || []);    
            } catch (error) {
                console.error('❌ Failed to set tours:', err);    
            }
        } catch (err) {
            console.error('❌ Failed to load tours:', err);
            // Network error fallback: cache if present
            if (cached) {
                setTours(cached.data || []);
            } else {
                setTours([]); // preserve existing behavior
            }
        }
    };
  // ---------- end helpers ----------
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
        console.log("📝 Editing tour:", tour); // Log the full tour object

        function formatDate(dateString) {
            if (!dateString) return '';
            const d = new Date(dateString);
            return d.toISOString().split("T")[0]; // "2025-08-26"
            }

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
                    {tours 
                        .filter(t => t.tour.item_type === 'tour')
                        .map(t => {
                            const imageSrc = t.tour.image.startsWith('/images')
                                ? `${base}${t.tour.image}`
                                : `${imageBase}/uploads/${t.tour.image}`; //1234
                            return (
                                <tr key={t.tour.slug}>
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