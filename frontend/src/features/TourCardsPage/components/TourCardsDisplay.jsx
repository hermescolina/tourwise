// src/components/TourCardsDisplay.jsx
import React, { useState } from 'react';
import { useTourCardsData } from '@TourCardsPage/hooks/useTourCardsData';
import { useCart } from '@Common/components/CartContext';
import { useNavigate } from 'react-router-dom';
import { getStaticImageUrl } from '@Common/utilities/getStaticImageUrl';

function TourCardsDisplay({ styles, locationFilter, searchTerm, minPrice, maxPrice }) {
    const navigate = useNavigate();
    const [selectedDate, setSelectedDate] = useState("");
    const { items, isLoading, error } = useTourCardsData();
    const [quantity, setQuantity] = useState({});
    const { cartItems, addToCart } = useCart();

    if (isLoading) {
        return <div className="text-center p-8">Loading tours...</div>;
    }

    if (error) {
        return <div className="text-red-600 p-8">Error loading data: {error.message}</div>;
    }

    // Filter items here based on props from parent
    const filteredItems = items?.filter(it => {
        const tour = it.tourcard || {};
        const matchesLocation = !locationFilter || tour.location?.toLowerCase().includes(locationFilter.toLowerCase());
        const matchesSearch = !searchTerm || tour.title?.toLowerCase().includes(searchTerm.toLowerCase());
        const price = parseFloat(tour.price) || 0;
        const matchesPrice = price >= minPrice && price <= maxPrice;
        return matchesLocation && matchesSearch && matchesPrice;
    });

    return (
        <div className={styles.browseContent}>
            <div className={styles.tourGrid}>
                {filteredItems && filteredItems.map((it, idx) => {
                    const tour = it.tourcard || {};
                    const key = tour.item_id ?? tour.id ?? tour.slug ?? idx;
                    const isInCart = cartItems.some(item => item.item_id === tour.item_id);
                    
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
                                <p className={styles.tourSlots}>🎟 {tour.available_slots} slots available</p>
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

                                <label htmlFor={`tourDate-${key}`}> Select Tour Date:  </label>
                                <input
                                    type="date"
                                    onClick={(e) => e.stopPropagation()}
                                    id={`tourDate-${key}`}
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
                                            if (!isInCart) {
                                                addToCart({
                                                    ...tour,
                                                    item_id: tour.item_id,
                                                    quantity: quantity[tour.item_id] || 1,
                                                    type: 'tour',
                                                    selected_date: selectedDate
                                                });
                                            }
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
    );
}

export default TourCardsDisplay;