// src/features/LandingPage/hooks/useLanguages.js

import { useState, useEffect, useCallback } from 'react';
// Assuming you create a new service function for language data
import { fetchLanguageConfig } from '@LandingPage/services/languageService'; 

/**
 * Custom hook to fetch language configuration and manage the active language.
 * * @returns {object} Contains languages list, current language, loading state, and setter function.
 */
export const useLanguages = () => {
    // State for the list of available languages (e.g., [{ code: 'en', name: 'English' }, ...])
    const [availableLanguages, setAvailableLanguages] = useState([]);
    
    // State for the currently active language (default to English 'en')
    const [currentLanguage, setCurrentLanguage] = useState('en'); 
    
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    

    // Function to change the active language
    const setLanguage = useCallback((langCode) => {
        // You might want to add logic here to validate langCode against availableLanguages
        setCurrentLanguage(langCode);
        // Optionally, save to localStorage here
    }, []); 

    // Effect to fetch the list of available languages on mount
    useEffect(() => {
        const loadLanguageData = async () => {
            setIsLoading(true);
            try {
                // Fetch the list of languages from the service
                const data = await fetchLanguageConfig(); 
                
                if (data && data.length > 0) {
                    setAvailableLanguages(data);
                    // Optionally set the default language based on the first item or localStorage
                    setCurrentLanguage(data[0].code); 
                }
            } catch (err) {
                setError(err.message);
                setAvailableLanguages([]); // Ensure a clean state on error
            } finally {
                setIsLoading(false);
            }
        };
        
        loadLanguageData();
    }, []); // Empty dependency array means it runs only once on mount

    return { 
        availableLanguages, 
        currentLanguage, 
        setLanguage, 
        isLoading,
        error 
    };
};