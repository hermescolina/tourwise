// src/features/LandingPage/services/configService.js

import { apiBaseTour } from '@/config'; 

const NAV_LINKS_URL = `${apiBaseTour}/api/config/navbar/links`;

/**
 * Fetches the navigation links from the Flask configuration API.
 */
export const fetchNavLinks = async () => {
    // ... your existing correct implementation
    try {
        const response = await fetch(NAV_LINKS_URL);
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status} from ${NAV_LINKS_URL}`);
        }
        
        const data = await response.json();
        
        if (!Array.isArray(data)) {
            throw new Error("Invalid response format: Expected an array.");
        }
        
        return data;

    } catch (error) {
        console.error("Error fetching navigation links:", error);
        throw error;
    }
};
