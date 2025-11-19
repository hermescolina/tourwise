import { useState, useEffect } from 'react';
import { fetchNavLinks } from '@LandingPage/services/configService';

/**
 * Custom hook to fetch navigation links from the backend API.
 */
export const useNavLinks = () => {
    const [menuItems, setMenuItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        console.count("check")  //not even showing this
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

export default useNavLinks;