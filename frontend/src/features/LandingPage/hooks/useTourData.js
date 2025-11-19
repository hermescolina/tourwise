import { useState, useEffect } from 'react';

// 1. Import our new config file to get the API URL.
import { apiBaseTour, frontendBase } from '@/config';

// We are temporarily NOT importing the cache helpers.

export const useTourData = () => {
  const [items, setItems] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchOnly = async () => {
      console.log("HOOK: Starting REAL data fetch...");
      setIsLoading(true);
      setError(null);

      try {
        const apiUrl = apiBaseTour;
        console.log(`HOOK: Fetching from API endpoint: ${apiUrl}/api/tl/tour-landing`);
        
        // 2. This is the real network request.
        const response = await fetch(`${apiUrl}/api/tl/tour-landing`);

        // 3. Check if the server responded with an error (like 404 or 500).
        if (!response.ok) {
          throw new Error(`Network response was not ok: ${response.status} ${response.statusText}`);
        }
        
        // --- THE FIX ---
        // 1. Get the data. We expect it to be a string that CONTAINS JSON.
        const jsonString = await response.json();
        console.log("HOOK: Received a JSON-encoded string from backend.");

        // 2. Parse that string a second time to get the actual array.
        const data = JSON.parse(jsonString);
        console.log("HOOK: Successfully double-parsed to get the real data array.");
        // --- END OF FIX ---
        // 5. Update our component's state with the real data.
        setItems(data);

      } catch (err) {
        console.error("HOOK: Fetch failed.", err);
        setError(err);
      } finally {
        // 6. This always runs, ensuring the loading indicator is turned off.
        setIsLoading(false);
        console.log("HOOK: Data fetch cycle complete.");
      }
    };

    fetchOnly(); // Execute the function.

  }, []); // The empty array ensures this effect runs only once.

  return { items, isLoading, error };
};