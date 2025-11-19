// src/pages/TestPage.jsx (Minimal changes needed)
import React from 'react';
import Navbar from '@LandingPage/components/Navbar';
import LanguageSelector from '@LandingPage/components/LanguageSelector'; 
import styles from '@LandingPage/CSS/TestPage.module.css'; 
import { useTourData } from '@LandingPage/hooks/useTourData'; 
// import useNavLinks from '@LandingPage/hooks/useNavLinks'; 

const TestPage = () => {
    // ⭐️ 1. Call the hook to fetch tour data ⭐️
    const { 
        items: tourItems, 
        isLoading: toursLoading, 
        error: toursError 
    } = useTourData();
    
    // Simulate a complex piece of content for the main body
    const [activeTab, setActiveTab] = React.useState('Tours');

    // Display a full-page loading message if data is not ready
    if (toursLoading) {
        return <div className={styles.fullPageLoader}>Loading Tour Data...</div>;
    }

    return (
        <div>
            <Navbar 
                // ⭐️ RESTORE LINKS: Pass the mock links back in ⭐️
                rightSlot={<LanguageSelector />} 
            /> 
            
            <main className={styles.content}>
                {/* ... (rest of your page content, tabs, and status box) ... */}
                <h1>Tour Data Integration Test Page</h1>
                
                {/* Tab Navigation (Optional, keeps the UI structured) */}
                {/* ... (Your tab navigation component/JSX goes here) ... */}

                <div className={styles.statusBox}>
                    <h2>Status Check: Tour Data</h2>
                    
                    {/* ⭐️ 2. Conditional rendering based on hook results ⭐️ */}
                    {toursError && (
                        <p className={styles.errorText}>
                            ❌ Error loading tours: {toursError.message || toursError}
                        </p>
                    )}
                    
                    {!toursError && (
                        <>
                            <p>✅ **Hook Status:** Successfully connected to API.</p>
                            <p>📦 **Total Tours Fetched:** **{tourItems.length}**</p>
                            <p>🔍 **First Tour Title:** {tourItems[0]?.tour?.title || 'N/A'}</p>
                            <p>✅ **Test Goal:** Data displayed below comes from the Flask Microservice.</p>
                        </>
                    )}
                    
                    {/* ⭐️ 3. Display raw fetched data for visual confirmation ⭐️ */}
                    <hr/>
                    <div className={styles.dataDisplay}>
                        <h3>Raw Data Preview (First 3 Items)</h3>
                        <pre>{JSON.stringify(tourItems?.slice(0, 3), null, 2)}</pre>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default TestPage;