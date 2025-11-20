import { useState, useEffect } from 'react';
import { fetchNavLinks } from '@Common/services/config/navlinkService';

/**
 * Custom hook to fetch navigation links from the backend API.
 */
export const useNavLinks = () => {
    const [menuItems, setMenuItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const loadLinks = async () => {
            try {
                const data = await fetchNavLinks();
                console.log("data",data)
                setMenuItems(data);
            } catch (err) {
                setError(err.message);
                setMenuItems([]); // Clear data on error
            } finally {
                setIsLoading(false);
            }
        };
        loadLinks();
    }, [useNavLinks]); // ==> change this but still the same

    return { menuItems, isLoading, error };
};

