// src/components/TourDisplay.jsx
import React from 'react';
import { useTourData } from '@LandingPage/hooks/useTourData'; // Import your hook
import { apiBaseTour, frontendBase } from '@/config';

import { useNavigate, useLocation, useParams,  useSearchParams} from 'react-router-dom';

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


function TourDisplay({ styles }) {
    const navigate = useNavigate();
    // 1. Call the hook to access the data and status
    const { items, isLoading, error } = useTourData();

    // 2. Handle the loading state (What to render when waiting)
    if (isLoading) {
        return <div className="text-center p-8">Loading tours...</div>;
    }

    // 3. Handle the error state (What to render when it fails)
    if (error) {
        return <div className="text-red-600 p-8">Error loading data: {error.message}</div>;
    }

    // 4. Handle the success state (What to render when data is ready)
    return (
        <>
        <h2 className={styles.sectionTitle}>Top Destinations</h2>
        <div className={styles.tourCards}>
            
            {items && items.map((it, idx) => {
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
}

export default TourDisplay;