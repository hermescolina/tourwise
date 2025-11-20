// src/components/LanguageSelector.jsx
import React, {useCallback} from 'react';
import { useLanguages } from '@Common/hooks/useLanguages'; // ⭐️ UNCOMMENT THE HOOK ⭐️
import styles from '@Common/CSS/Navbar.module.css';

// Corrected Code for LanguageSelector Component

const LanguageSelector = () => {
    // 1. Call the hook ONCE and destructure all needed variables
    const { 
        availableLanguages, 
        currentLanguage: language, // Renames currentLanguage to 'language'
        setLanguage,               // Declares setLanguage
        isLoading,          
        error               
    } = useLanguages();

    
    // 2. Define the handler, correctly using the 'setLanguage' from above
    const handleLanguageChange = useCallback((event) => {
        setLanguage(event.target.value); 
    }, [setLanguage]); // Dependency array is correct

    // ... rest of the component

    // ... handleLanguageChange, isLoading check, etc.

    // ⭐️ Rendering section needs these two fixes ⭐️
    return (
        <div className={styles.languageSelectorContainer}>
            {/* 1. Flag Image: Find the flag emoji from the availableLanguages array */}
            {availableLanguages.map(lang => lang.code).includes(language) && (
                 <div className={styles.languageFlagEmoji}>
                    {availableLanguages.find(lang => lang.code === language)?.flag}
                </div>
            )}

            {/* 2. Dropdown Menu (FIXED) */}
            <select
                value={language} // Use the renamed 'language'
                onChange={handleLanguageChange} 
                className={styles.languageSelectorDropdown}
                aria-label="Select Language"
            >
                {availableLanguages.map((langObject) => (
                    // FIX 1: Use a unique string key (langObject.code)
                    // FIX 2: Use a simple string value for the option child (langObject.name)
                    <option 
                        key={langObject.code} 
                        value={langObject.code}
                    >
                        {langObject.name} {/* Renders "English", "German", etc. */}
                    </option>
                ))}
            </select>
        </div>
    );
};

export default LanguageSelector;