import { apiBaseTour } from '@/config'; 

// --- LANGUAGE CONFIG LOGIC ---
const LANGUAGE_CONFIG_URL = `${apiBaseTour}/api/config/languages`; 
/**
 * Fetches the list of available languages from the Flask configuration API.
 */
export const fetchLanguageConfig = async () => { 
    try {
        
        const response = await fetch(LANGUAGE_CONFIG_URL);
        console.log("LS Check");
        console.log("LS Check", response);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} from ${LANGUAGE_CONFIG_URL}`);
        }
        
        const data = await response.json();
        console.log("DATA: ",data);
        return data; 
        
    } catch (error) {
        console.error("Error fetching language configuration:", error);
        // Throw to allow the hook to catch it
        throw error;
    }
};

// Remove the line 'export default fetchLanguageConfig;'
// Do not include any 'export default' if you want to use named imports for both.