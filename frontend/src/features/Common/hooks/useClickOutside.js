// src/hooks/useClickOutside.js
import { useRef, useEffect } from 'react';

/**
 * A custom hook to handle clicks and 'Escape' key presses
 * outside of a specified element.
 * @param {function} callback - The function to call when an outside event occurs.
 */
const useClickOutside = (callback) => {
    // This ref will be attached to the DOM node
    const domNodeRef = useRef(null);

    // We use a ref for the callback to ensure the
    // effect always has the latest version of the function
    // without needing to re-run the effect.
    const callbackRef = useRef(callback);
    useEffect(() => {
        callbackRef.current = callback;
    }, [callback]);

    useEffect(() => {
        // Event handler for mouse down
        const handleMouseDown = (event) => {
            // Check if the ref is set and the click was *outside*
            if (domNodeRef.current && !domNodeRef.current.contains(event.target)) {
                callbackRef.current(); // Call the callback
            }
        };

        // Event handler for 'Escape' key
        const handleKeydown = (event) => {
            if (event.key === 'Escape') {
                callbackRef.current(); // Call the callback
            }
        };

        // Add event listeners
        document.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('keydown', handleKeydown);

        // Cleanup: remove event listeners when component unmounts
        return () => {
            document.removeEventListener('mousedown', handleMouseDown);
            document.removeEventListener('keydown', handleKeydown);
        };
    }, []); // Empty dependency array: this effect runs only once on mount

    // Return the ref for the component to use
    return domNodeRef;
};

export default useClickOutside;