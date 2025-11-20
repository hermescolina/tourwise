// src/utilities/dataProcessor.js (or cacheService.js)

// NOTE: This assumes tryParse is available in the same file or imported.
/* function tryParse(value) {
    // ... (implementation of safe JSON.parse) ...
}
*/

/**
 * Parses raw data from API or localStorage into a standardized, filtered array of tours.
 * * @param {any} rawData - The input data, which may be a string, array, or object wrapper.
 * @returns {Array} An array containing only valid tour objects.
 */
import { 
    tryParse 
} from '@Common/services/cache/cacheService'; 


export const parseAndNormalizeItems = (rawData) => {
    if (!rawData) return [];

    let tempArray = [];

    // --- 1. Standardize Input: Ensure tempArray is a JavaScript array. ---

    if (Array.isArray(rawData)) {
        tempArray = rawData;
    } else if (typeof rawData === 'object' && rawData !== null) {
        // Handle common object wrappers or single item objects
        const arrayFromWrapper = rawData.data || rawData.items || rawData.result;
        
        if (Array.isArray(arrayFromWrapper)) {
            tempArray = arrayFromWrapper;
        } else {
            // Assume it's a single item object and wrap it
            tempArray = [rawData];
        }
    } else {
        // Attempt one final parse if the input is a string (e.g., from localStorage)
        const parsedString = tryParse(rawData);
        if (Array.isArray(parsedString)) {
            tempArray = parsedString;
        } else if (parsedString) {
            tempArray = [parsedString];
        } else {
            return []; // Cannot determine usable structure
        }
    }

    // --- 2. Normalize and Clean: Handle potential inner stringified items. ---
    const normalizedItems = tempArray
        // Apply tryParse only if the element is still a string (due to inner stringification)
        .map(el => (typeof el === "string" ? tryParse(el) : el)) 
        .filter(Boolean); // Removes any null, undefined, or false values

    // --- 3. Filter: Apply the final business logic check. ---
    // Only return items that explicitly contain the structure { tour: { type: "tour" } }
    return normalizedItems.filter(it => it?.tourcard?.item_type === "tour");
};