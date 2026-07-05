// src/features/common/components/FilterPanel.jsx

import React from 'react';

/**
 * FilterPanel Component
 * Displays and handles all user input for filtering tours based on location, price, and rating.
 *
 * @param {object} props - Props passed from the parent component (BrowseTours).
 * @param {object} props.styles - CSS module styles object.
 * @param {string} props.locationFilter - Current state of the location filter input.
 * @param {function} props.setLocationFilter - State setter for locationFilter.
 * @param {string} props.searchTerm - Current state of the search term (used for onFocus clearing).
 * @param {function} props.setSearchTerm - State setter for searchTerm.
 * @param {number} props.minPrice - Current state of the minimum price.
 * @param {function} props.setMinPrice - State setter for minPrice.
 * @param {number} props.maxPrice - Current state of the maximum price.
 * @param {function} props.setMaxPrice - State setter for maxPrice.
 */
export function FilterPanel({
    styles,
    locationFilter,
    setLocationFilter,
    setSearchTerm,
    minPrice,
    setMinPrice,
    maxPrice,
    setMaxPrice
}) {
    // Ensure numeric input values are treated as numbers
    const safeMinPrice = Number(minPrice) || 0;
    const safeMaxPrice = Number(maxPrice) || 15000;
    
    return (
        <aside className={styles.filterPanel}>
            <h2 className={styles.filterTitle}>Filters</h2>

            {/* Location Filter Group */}
            <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>Location</label>
                <input
                    type="text"
                    className={styles.filterInput}
                    placeholder="Enter location"
                    value={locationFilter}
                    onChange={(e) => setLocationFilter(e.target.value)}
                    // Clear main search term when user focuses on location filter
                    onFocus={() => setSearchTerm('')} 
                />
            </div>

            {/* Price Range Filter Group */}
            <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>Price Range</label>
                <div className={styles.priceRangeInputs}>
                    <input
                        type="number"
                        min="0"
                        value={minPrice}
                        onChange={(e) => setMinPrice(Number(e.target.value))}
                        className={styles.priceInput}
                        placeholder="Min"
                    />
                    <span>to</span>
                    <input
                        type="number"
                        min={minPrice}
                        value={maxPrice}
                        onChange={(e) => setMaxPrice(Number(e.target.value))}
                        className={styles.priceInput}
                        placeholder="Max"
                    />
                </div>
                <input
                    type="range"
                    min={safeMinPrice}
                    max="15000" // Use a static max for the slider if not dynamically set
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(Number(e.target.value))}
                    className={styles.filterRange}
                />
                <p className={styles.priceDisplay}>
                    ₱ {safeMinPrice.toLocaleString()} – ₱ {safeMaxPrice.toLocaleString()}
                </p>
            </div>

            {/* Rating Filter Group (Static, but included for completeness) */}
            <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>Rating</label>
                <div className={styles.filterStars}>
                    {[1, 2, 3, 4, 5].map(star => (
                        <span key={star}>★</span>
                    ))}
                </div>
            </div>
        </aside>
    );
}