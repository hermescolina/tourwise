
// utils/getStaticImageUrl.js
import { apiBaseTour, frontendBase } from '@/config';

const base = `${frontendBase}/tourism-analytics/`;
const baseurl = `${apiBaseTour}/uploads`;

const isValidUrl = (str = '') => str.startsWith('http://') || str.startsWith('https://');

/**
 * Resolves a static image URL without assumptions.
 * @param {string} path - Image path or full URL
 * @returns {string} - Resolved URL or empty string if path is falsy
 */
export const getStaticImageUrl = (path) => {
    if (!path) return '';
    if (isValidUrl(path)) return path;

    const cleaned = path.startsWith('/') ? path : `/${path}`;
    
    return cleaned.startsWith('/images/')
        ? `${base}${cleaned}`
        : `${baseurl}${cleaned}`;
};
