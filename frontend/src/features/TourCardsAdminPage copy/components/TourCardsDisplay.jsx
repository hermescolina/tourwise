// src/components/TourCardsDisplay.jsx
import Navbar from '@Common/components/Navbar';
import LanguageSelector from '@Common/components/LanguageSelector'; 
import { SearchBar } from '@Common/components/SearchBar';
import { useCart } from '@Common/components/CartContext'; 
import { FilterPanel } from '@Common/components/FilterPanel';
import styles from '@TourCardsPage/CSS/TourCards.module.css';

import React,{ useEffect, useRef, useState } from 'react';
import { useTourCardsData } from '@TourCardsPage/hooks/useTourCardsData'; // Import your hook
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

function TourCardsDisplay() {
    const navigate = useNavigate();
    const [selectedDate, setSelectedDate] = useState("");
    // 1. Call the hook to access the data and status
    const { items, isLoading, error } = useTourCardsData();
    const [quantity, setQuantity] = useState({});
    const { cartItems, addToCart, loadCart } = useCart();
    const [locationFilter, setLocationFilter] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [minPrice, setMinPrice] = useState(1000);
    const [maxPrice, setMaxPrice] = useState(15000);
      

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
        <div className={styles.browseContainer}>
            <header className={styles.browseHeader}> 
                <Navbar 
                    rightSlot={<LanguageSelector/>}
                />
                <SearchBar /> 
            </header>
            <div className={styles.browseWrapper}>
                <FilterPanel
                    styles={styles}
                    locationFilter={locationFilter}
                    setLocationFilter={setLocationFilter}
                    setSearchTerm={setSearchTerm}
                    minPrice={minPrice}
                    setMinPrice={setMinPrice}
                    maxPrice={maxPrice}
                    setMaxPrice={setMaxPrice}
                />
                <div className={styles.browseContent}>
                    <div className={styles.tourGrid}>
                        {items && items.map((it, idx) => {
                            const tour = it.tourcard || {};
                            const key = tour.item_id ?? tour.id ?? tour.slug ?? idx;
                            const isInCart = cartItems.some(item => item.item_id === tour.item_id);
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
                                    className={styles.tourCardImage}
                                />
                                )}

                                <div className={styles.tourCardDetails}>
                                    <h3 className={styles.tourTitle}>{tour.title}</h3>
                                    <p className={styles.description}>
                                        {tour.description ?? 'No description available.'}
                                    </p>
                                    <p className={styles.tourPrice}>₱ {Number(tour.price).toLocaleString()}</p>
                                    {/* <p className={styles.tourPrice}>₱ {Number(tour.price).toFixed(2).toLocaleString()}</p> */}
                                    <p className={styles.tourSlots}>🎟️ {tour.available_slots} slots available</p>
                                    <p className={styles.tourDates}>
                                    📅 {tour.start_date && tour.end_date ? (
                                        <>
                                        {new Date(tour.start_date).toLocaleDateString('en-PH', {
                                            weekday: 'short',
                                            day: 'numeric',
                                            month: 'short',
                                            year: 'numeric'
                                        })} –{' '}
                                        {new Date(tour.end_date).toLocaleDateString('en-PH', {
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
                                            value={quantity[tour.item_id] || 1}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => {
                                            const qty = Math.max(1, parseInt(e.target.value) || 1);
                                            setQuantity(prev => ({ ...prev, [tour.item_id]: qty }));
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
            
                                    <p className={styles.tourPrice}>
                                    🧮 Total: ₱{(parseFloat(tour.price) * (quantity[tour.item_id] || 1)).toLocaleString()}
                                    </p>
                                </div>
                            </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
        </>
    );
}

export default TourCardsDisplay;