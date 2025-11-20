// src/features/Common/components/SearchBar.jsx
import React from 'react';
import { CartIcon } from './CartIcon'; // Assuming CartIcon is defined in this directory
import styles from '@TourCardsPage/CSS/TourCards.module.css'; // Reusing your existing CSS

/**
 * SearchBar Component
 * Handles the main search input and displays the CartIcon.
 * * @param {string} searchTerm - The current search input value.
 * @param {function} setSearchTerm - Function to update the searchTerm state.
 * @param {function} setLocationFilter - Function to clear the location filter on search focus.
 */
export function SearchBar({ searchTerm, setSearchTerm, setLocationFilter }) {
    
    // Handler to update search state
    const handleSearchChange = (e) => {
        setSearchTerm(e.target.value);
    };

    // Handler to clear location filter when search bar is focused
    const handleSearchFocus = () => {
        if (setLocationFilter) {
            setLocationFilter('');
        }
    };

    return (
        <div className={styles.searchBarWrapper}>
            <input
                type="text"
                placeholder="🔍 Search tours"
                className={styles.searchBar}
                value={searchTerm}
                onChange={handleSearchChange}
                onFocus={handleSearchFocus}
            />
            {/* CartIcon is now included here, making this wrapper fully self-contained */}
            <CartIcon />
        </div>
    );
}