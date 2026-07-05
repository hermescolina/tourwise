// pages/TourCardsAdmin.jsx
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Navbar from '@Common/components/Navbar';
import LanguageSelector from '@Common/components/LanguageSelector';
import { SearchBar } from '@Common/components/SearchBar';
import { FilterPanel } from '@Common/components/FilterPanel';
import TourCardsAdminDisplay from '@TourCardsPage/components/TourCardsAdminDisplay';
import { useTourCardsAdminData } from '@TourCardsPage/hooks/useTourCardsAdminData';
import { apiBaseTour } from '@/config';
import './TourCardsAdmin.css';

export default function TourCardsAdmin() {
    const [searchParams] = useSearchParams();
    const { items, isLoading, error } = useTourCardsAdminData();

    const [selectedOptions, setSelectedOptions] = useState({});
    const [searchTerm, setSearchTerm] = useState('');
    const [locationFilter, setLocationFilter] = useState('');
    const [minPrice, setMinPrice] = useState(1000);
    const [maxPrice, setMaxPrice] = useState(15000);
    const [cats, setCats] = useState([]);
    const [selectedChildId, setSelectedChildId] = useState({ id: 0, name: "" });

    useEffect(() => {
        (async () => {
            try {
                const urls = [`${apiBaseTour}/api/cat/categories`];
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

    const handleOptionChange = (slug, option) => {
        setSelectedOptions(prev => ({
           ...prev,
            [slug]: option,
        }));
    };

    const handleCardClick = (slug) => {
        if (!slug) return;
        const selectedOption = selectedOptions[slug] || 'itinerary';
        const key = String(selectedOption).trim().toLowerCase().replace(/\s+/g, '-');

        const pathMap = {
            'itinerary': 'upload-itinerary',
            'history': 'upload-history',
            'culture': 'upload-culture',
            'inclusion': 'upload-inclusion',
            'inclusions': 'upload-inclusion',
            'exclusion': 'upload-exclusion',
            'exclusions': 'upload-exclusion',
            'tips': 'upload-tips',
            'expectations': 'upload-expectations',
            'videos': 'upload-videos',
            'tour-videos': 'upload-videos',
            'guides': 'upload-guides',
            'owner': 'upload-owner',
            'owner-info': 'upload-owner',
            'about-the-tour': 'upload-about',
            'what-to-expect': 'upload-expectations',
            'history-and-culture': 'upload-culture',
            'tour-guides': 'upload-guides',
            'tour-owner-info': 'upload-owner',
        };

        const path = pathMap[key] || 'upload-itinerary';
        const strategy = searchParams.get('strategy') || 'ttl1h';
        window.location.href = `/tourism-analytics/${path}/${encodeURIComponent(slug)}?strategy=${strategy}`;
    };

    if (isLoading) {
        return <div className="text-center p-8">Loading tours...</div>;
    }

    if (error) {
        return <div className="text-red-600 p-8">Error loading data: {error.message}</div>;
    }

    return (
        <div className="browse-container">
            <div className="browseWrapper">
                <aside className="filterPanel">
                    <h2 className="browse-title">
                        {selectedChildId.name? selectedChildId.name : "Tour Cards"}
                    </h2>

                    <SearchBar
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onFocus={() => setLocationFilter('')}
                        placeholder={`🔍 Search ${selectedChildId.name? selectedChildId.name : "Tour Cards"}`}
                    />

                    <FilterPanel
                        locationFilter={locationFilter}
                        setLocationFilter={setLocationFilter}
                        setSearchTerm={setSearchTerm}
                        minPrice={minPrice}
                        setMinPrice={setMinPrice}
                        maxPrice={maxPrice}
                        setMaxPrice={setMaxPrice}
                        cats={cats}
                        selectedChildId={selectedChildId}
                        setSelectedChildId={setSelectedChildId}
                    />
                </aside>

                <TourCardsAdminDisplay
                    items={items}
                    selectedOptions={selectedOptions}
                    onOptionChange={handleOptionChange}
                    onCardClick={handleCardClick}
                    locationFilter={locationFilter}
                    searchTerm={searchTerm}
                    minPrice={minPrice}
                    maxPrice={maxPrice}
                    selectedChildId={selectedChildId}
                />
            </div>
        </div>
    );
}