import { apiBaseTour } from '../config';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import styles from './TourDetailsAdmin.module.css';

export default function TourDetailsAdmin() {
    const { slug } = useParams();
    const [tour, setTour] = useState(null);
    const [message, setMessage] = useState('');

    useEffect(() => { 
        if (!slug) return;

        let cancelled = false;

        (async () => {
            try {
            const url = `${apiBaseTour}/api/tour-itinerary/${encodeURIComponent(slug)}`;
            const res = await fetch(url, { headers: { Accept: 'application/json' } });

            // No content / not modified / missing → treat as "no itinerary yet"
            if ([204, 304, 404].includes(res.status)) {
                if (!cancelled) {
                setTour({ slug, itinerary: [] });
                setMessage('No itinerary yet');
                }
                return;
            }

            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            const text = await res.text(); // read once

            // If not JSON or empty body, don't crash—treat as empty
            let data = null;
            if (text && contentType.includes('application/json')) {
                try { data = JSON.parse(text); } catch { /* fall through to empty */ }
            }

            if (!res.ok) {
                // keep a readable error, but don't crash the UI
                throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
            }

            if (!cancelled) {
                const safe = data ?? { slug, itinerary: [] };
                setTour(safe);
                if (!Array.isArray(safe.itinerary) || safe.itinerary.length === 0) {
                setMessage('No itinerary yet');
                }
            }
            } catch (err) {
            if (!cancelled) {
                console.error('❌ Error loading tour:', err);
                setTour({ slug, itinerary: [] });
                setMessage('Failed to load tour');
            }
            }
        })();

        return () => { cancelled = true; };
        }, [slug, apiBaseTour]);


    const handleChange = (field, value) => {
        setTour(prev => ({ ...prev, [field]: value }));
    };

    const handleItineraryChange = (index, key, value) => {
        const updated = [...tour.tour_itinerary];
        updated[index][key] = key === 'stops' ? value.split(',').map(s => s.trim()) : value;
        setTour(prev => ({ ...prev, tour_itinerary: updated }));
    };

    const addItinerary = () => {
        setTour(prev => ({
            ...prev,
            tour_itinerary: [...(prev.tour_itinerary || []), { label: '', title: '', time: '', stops: [] }]
        }));
    };

    // tiny helper: safely PUT JSON and return {ok,message}
    
    const putJSON = async (url, payload) => {
        const res = await fetch(url, {
            method: 'PUT',
            headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            },
            body: JSON.stringify(payload ?? {}),
        });

        // Treat 204 as success with no message
        console.log("PAYLOAD ====>", payload)
        console.log("res.status: ====>" , res.status)
        if (res.status === 204) return { ok: true, message: '' };

        const ct = (res.headers.get('content-type') || '').toLowerCase();
        console.log("CT ===>", ct)
        const text = await res.text();
        console.log("TEXT ====>", text)
        let data = null;
        if (text && ct.includes('application/json')) {
            try { data = JSON.parse(text); } catch { /* fall through */ }
            console.log("DATA ===>", data)
        }

        if (!res.ok) {
            throw new Error(data?.error || `HTTP ${res.status}: ${text.slice(0,200)}`);
        }

        return { ok: true, message: data?.message || '' };
        };

//I am here: need to fix saves
    const handleSaveTips = async () => {
        const url = `${apiBaseTour}/api/tour-tips/${encodeURIComponent(slug)}`;
        const tips = Array.isArray(tour.tips)
            ? tour.tips
            : (typeof tour.tips === 'string' && tour.tips.trim() ? JSON.parse(tour.tips) : []);
        console.log("PAYLOAD ===>", tips)
        const r = await putJSON(url, { tips });
        return r.message || 'Tips saved!';
        };

    const handleSave = async () => {
        try {
            let combinedMessage = '';
            // ✅ correct endpoint (includes /api/tr)
            const itineraryUrl = `${apiBaseTour}/api/tour-itinerary/${encodeURIComponent(slug)}`;
            const r1 = await putJSON(itineraryUrl, tour);
            combinedMessage += (r1.message || 'Itinerary saved!') + ' ';
            const tipsMessage = await handleSaveTips();  // now returns a message
            combinedMessage += tipsMessage;
            setMessage(combinedMessage.trim());
            setTimeout(() => setMessage(''), 3000);
        } catch (err) {
            console.error('❌ Failed to save:', err);
            setMessage('Failed to save');
            setTimeout(() => setMessage(''), 3000);
        }
        };

    const removeItinerary = (indexToRemove) => {
        const updated = tour.tour_itinerary.filter((_, idx) => idx !== indexToRemove);
        setTour(prev => ({ ...prev, tour_itinerary: updated }));
    };

    if (!slug) return <p>Invalid or missing tour ID</p>;
    if (!tour) return <p>Loading...</p>;

    return (
        <div className={styles.tourAdmin}>
            <h2 className={styles.heading}>Tour Admin Interface</h2>

            <label>✅ Inclusions:</label>
            <textarea
                className={styles.textarea}
                value={tour.inclusions || ''}
                onChange={(e) => handleChange('inclusions', e.target.value)}
            />

            <label>⛔ Exclusions:</label>
            <textarea
                className={styles.textarea}
                value={tour.exclusions || ''}
                onChange={(e) => handleChange('exclusions', e.target.value)}
            />

            <h3 className={styles.subheading}>🧭 Tour Itinerary</h3>
            {(tour.tour_itinerary || []).map((item, idx) => (
                <div key={idx} className={styles.itineraryBox}>
                    <input
                        className={styles.input}
                        placeholder="Label (e.g., Tour A)"
                        value={item.label}
                        onChange={(e) => handleItineraryChange(idx, 'label', e.target.value)}
                    />
                    <input
                        className={styles.input}
                        placeholder="Title (e.g., Lagoons & Beaches)"
                        value={item.title}
                        onChange={(e) => handleItineraryChange(idx, 'title', e.target.value)}
                    />
                    <input
                        className={styles.input}
                        placeholder="Time (e.g., ~9AM–4PM)"
                        value={item.time}
                        onChange={(e) => handleItineraryChange(idx, 'time', e.target.value)}
                    />
                    <textarea
                        className={styles.textarea}
                        placeholder="Stops (comma-separated)"
                        value={item.stops.join(', ')}
                        onChange={(e) => handleItineraryChange(idx, 'stops', e.target.value)}
                        rows={2}
                    />
                    <button
                        onClick={() => removeItinerary(idx)}
                        className={styles.removeBtn}
                    >
                        🗑 Remove
                    </button>
                </div>
            ))}

            <label>💡 Tips for Visitors:</label>
            <textarea
                className={styles.textarea}
                value={tour.tips || ''}
                onChange={(e) => handleChange('tips', e.target.value)}
            />


            <button onClick={addItinerary} className={styles.addBtn}>➕ Add Itinerary</button>
            <button onClick={handleSave} className={styles.saveBtn}>💾 Save All</button>



            {message && <p className={styles.success}>{message}</p>}
        </div>
    );
}
