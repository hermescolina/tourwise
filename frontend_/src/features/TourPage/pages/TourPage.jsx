import React from 'react';
import TourPageDisplay from '@TourPage/components/TourPageDisplay';
// import Tour_Page from '@TourPage/components/TourPage';

/**
 * Entry point for the individual Tour Detail view.
 * This page leverages slug-based routing to display specific tour data.
 */
export default function TourPage() {
    return (
        <>
            <TourPageDisplay />
            {/* <Tour_Page /> */}
        </>
    );
}