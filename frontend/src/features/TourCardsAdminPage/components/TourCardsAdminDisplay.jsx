// src/components/TourCardsAdminDisplay.jsx
import React from 'react';
import { getStaticImageUrl } from '@Common/utilities/getStaticImageUrl';

function TourCardsAdminDisplay({
    styles,
    items,
    selectedOptions,
    onOptionChange,
    onCardClick,
    locationFilter,
    searchTerm,
    minPrice,
    maxPrice,
    selectedChildId
}) {
    const safeMinPrice = Number(minPrice) || 0;
    const safeMaxPrice = Number(maxPrice) || 15000;

    const normalize = str => str.toLowerCase().replace(/\s+/g, '');

    const filteredTours = items.filter(item => {
        const tour = item.tour;
        if (!tour) return false;

        const searchNormalized = normalize(searchTerm);
        const locationFilterNormalized = normalize(locationFilter);
        const titleNormalized = normalize(tour.title || '');
        const locationNormalized = normalize(tour.location || '');
        const priceValue = Number(tour.price);

        const matchesSearch = titleNormalized.startsWith(searchNormalized);
        const matchesLocation = locationFilterNormalized === '' || locationNormalized.startsWith(locationFilterNormalized);
        const matchesPrice = priceValue >= safeMinPrice && priceValue <= safeMaxPrice;
        const matchesCategory = selectedChildId.id === 0 || tour.category_id === selectedChildId.id;

        return matchesSearch && matchesLocation && matchesPrice && matchesCategory;
    });

    return (
        <div className="tour-grid">
            {filteredTours.map((item, index) => {
                const tour = item.tour;
                return (
                    <div key={tour.item_id?? index} className="tour-card">
                        <img
                            src={getStaticImageUrl(tour.image)}
                            alt={tour.title}
                            className="tour-card-image"
                        />
                        <div className="tour-card-details">
                            <h3 className="tour-title">{tour.title}</h3>
                            <p className="tour-description">{tour.description}</p>
                            <p className="tour-price">₱ {Number(tour.price).toLocaleString()}</p>

                            {tour.item_type === "tour" && (
                                <div className="tour-category-buttons" style={{ marginTop: '0.5rem' }}>
                                    {['itinerary', 'history', 'inclusion'].map(option => (
                                        <button
                                            key={option}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onOptionChange(tour.slug, option);
                                            }}
                                            style={{
                                                marginRight: '0.5rem',
                                                padding: '5px 10px',
                                                borderRadius: '5px',
                                                border: 'none',
                                                backgroundColor: selectedOptions[tour.slug] === option? '#007bff' : '#e0e0e0',
                                                color: selectedOptions[tour.slug] === option? '#fff' : '#000',
                                                cursor: 'pointer',
                                                fontSize: '0.9rem'
                                            }}
                                        >
                                            {option.charAt(0).toUpperCase() + option.slice(1)}
                                        </button>
                                    ))}
                                </div>
                            )}

                            <button
                                onClick={() => onCardClick(tour?.slug)}
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
                );
            })}

            {filteredTours.length === 0 && (
                <p className="no-results-message">No tours to display.</p>
            )}
        </div>
    );
}

export default TourCardsAdminDisplay;