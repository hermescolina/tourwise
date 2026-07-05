// src/components/Navbar.jsx
import React, { useState, useCallback } from 'react';
import useClickOutside from '@Common/hooks/useClickOutside';
import { useNavLinks } from '@Common/hooks/useNavLinks';
import styles from '@Common/CSS/Navbar.module.css';

// ⚠️ Define the base path here (or import it from a config file)
const APP_BASENAME = '/tourism-analytics'; 

// Helper function to create the full path
const getFullPath = (path) => {
    // Ensure the path starts with the basename and includes only one slash in between
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    
    // Concatenate and ensure no double slashes, handling the root path gracefully
    if (normalizedPath === '/') {
        return APP_BASENAME + '/';
    }
    return APP_BASENAME + normalizedPath;
};

const Navbar = ({ rightSlot: RightComponent = null }) => {
    
    const {
        menuItems,
        isLoading,
        error
    }  = useNavLinks();
    
    const [menuOpen, setMenuOpen] = useState(false);

    const closeMenu = useCallback(() => {
        setMenuOpen(false);
    }, []);
  
    const dropdownRef = useClickOutside(closeMenu);

    const toggleMenu = () => {
        setMenuOpen(prev => !prev);
    };

    // If using the a tag, you must use the full path constructed with the basename.
    // If using Link from react-router-dom, it handles the basename automatically,
    // but since you are using <a> tags, manual construction is required.

    return (
        <header className={styles.navbar}> 
            <div className={styles.navbarContainer}>
                {console.log("check")}
                {/* 1. Logo: Ensure the root link uses the basename */}
                <a href={APP_BASENAME + '/'} className={styles.navbarLogo}>TourWise 🌍</a>

                <button 
                    className={styles.menuToggle}
                    onClick={toggleMenu}
                    aria-expanded={menuOpen}
                >
                    {menuOpen ? 'X' : 'Menu'}
                </button>

                <div className={styles.dynamicContentWrapper}> 
                    <div 
                        id="main-menu"
                        ref={dropdownRef}
                        className={`${styles.navbarMenuList} ${menuOpen ? styles.isOpen : ''}`}
                    >
                        {/* Menu item mapping */}
                        {menuItems.map((item) => (
                            <a 
                                key={item.path} 
                                // ⚠️ FIX: Use the helper to prepend the basename
                                href={getFullPath(item.path)} 
                                className={styles.navbarItem} 
                                onClick={closeMenu}
                            >
                                {item.title}
                            </a>
                        ))}
                    </div>

                    {/* RENDER THE RIGHT SLOT */}
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