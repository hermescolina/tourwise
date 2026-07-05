// pages/TourCards.jsx
import React, { useState } from 'react';
import Navbar from '@Common/components/Navbar';
import LanguageSelector from '@Common/components/LanguageSelector';
import { SearchBar } from '@Common/components/SearchBar';
import { FilterPanel } from '@Common/components/FilterPanel';
import TourCardsDisplay from '@TourCardsPage/components/TourCardsDisplay';
import styles from '@TourCardsPage/CSS/TourCards.module.css';

export default function TourCards() {
    const [locationFilter, setLocationFilter] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [minPrice, setMinPrice] = useState(1000);
    const [maxPrice, setMaxPrice] = useState(15000);

    return (
        <div className={styles.browseContainer}>
            <header className={styles.browseHeader}>
                <Navbar
                    rightSlot={<LanguageSelector />}
                />
                <SearchBar onSearch={setSearchTerm} />
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
                <TourCardsDisplay
                    styles={styles}
                    locationFilter={locationFilter}
                    searchTerm={searchTerm}
                    minPrice={minPrice}
                    maxPrice={maxPrice}
                />
            </div>
        </div>
    );
}