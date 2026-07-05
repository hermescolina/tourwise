// src/components/Navbar.jsx
import React, { useState, useCallback } from 'react';
import useClickOutside from '@Common/hooks/useClickOutside';
import { useNavLinks } from '@Common/hooks/useNavLinks';
import styles from '@Common/CSS/Navbar.module.css';

// Accept an additional prop for a custom component
const Navbar = ({ rightSlot: RightComponent = null }) => {
    // 1. State: Tracks if the mobile menu is open

    const {
        menuItems,
        isLoading,
        error
    }  = useNavLinks();
    
    const [menuOpen, setMenuOpen] = useState(false);

    // 2. Callback: Closes the menu, memoized for hook stability
    const closeMenu = useCallback(() => {
        setMenuOpen(false);
    }, []);
  
    // 3. Hook Call: Returns the ref for the menu container
    const dropdownRef = useClickOutside(closeMenu);

    // Handler for the hamburger button click
    const toggleMenu = () => {
        setMenuOpen(prev => !prev);
    };

    return (
        <header className={styles.navbar}> 
            <div className={styles.navbarContainer}>
                
                {/* 1. Logo and main brand area */}
                <a href="/" className={styles.navbarLogo}>TourWise 🌍</a>

                {/* ⭐️ FIX: HAMBURGER BUTTON IS MOVED HERE ⭐️
                   It stays inside navbarContainer but outside the dynamicContentWrapper 
                   for stable positioning next to the logo on mobile. 
                */}
                <button 
                    className={styles.menuToggle}
                    onClick={toggleMenu}
                    aria-expanded={menuOpen}
                >
                    {menuOpen ? 'X' : 'Menu'}
                </button>

                {/* ⭐️ 2. DYNAMIC CONTENT WRAPPER: Now only holds the links and the slot ⭐️ */}
                <div className={styles.dynamicContentWrapper}> 

                    {/* The Collapsible Menu List (Primary Navigation) */}
                    <div 
                        id="main-menu"
                        ref={dropdownRef} // Attached to the slide-out element
                        className={`${styles.navbarMenuList} ${menuOpen ? styles.isOpen : ''}`}
                    >
                        {/* Menu item mapping (using a safe map over the prop) */}
                        {menuItems.map((item) => (
                            <a 
                                key={item.path} 
                                href={item.path} 
                                className={styles.navbarItem} 
                                onClick={closeMenu} // Closes the mobile menu when navigating
                            >
                                {item.title}
                            </a>
                        ))}
                    </div>

                    {/* RENDER THE RIGHT SLOT (Language Selector, etc.) */}
                    {RightComponent && (
                        <div className={styles.navbarRightSlot}>
                            {RightComponent} 
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
};

export default Navbar;