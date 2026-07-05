import React, { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom'; // 👈 Remove "BrowserRouter as Router" from here

// Pages
import TourWiseLanding from '@LandingPage/pages/TourWiseLanding.jsx';
import TourCards from '@TourCardsPage/pages/TourCards.jsx';
import TourPage from '@TourPage/pages/TourPage.jsx';
import LoginPage from '@LoginPage/LoginPage.jsx';

function App() {
  useEffect(() => {
    if (document.getElementById('tap-ai-widget-script')) return;

    window.TapAI = window.TapAI || function () {
      (window.TapAI.q = window.TapAI.q || []).push(arguments);
    };

    const script = document.createElement('script');
    script.id = 'tap-ai-widget-script';
    script.src = 'https://tutpug.qzz.io/widget.js';
    script.async = true;
    
    // ✅ Add the init step to run safely inside an onload callback or macro-task delay
    script.onload = () => {
      setTimeout(() => {
        try {
          window.TapAI('init', {
            widget_id: 'd728acf0-5ba1-450a-8f89-14cc5da79339'
          });
        } catch (err) {
          console.error("⚠️ Tap.AI deferred initialization failure:", err);
        }
      }, 150); // Small 150ms delay gives the script room to unpack its variable environment
    };

    document.body.appendChild(script);
  }, []);

  return (
    <Routes>
      <Route path="/" element={<TourWiseLanding />} />
      <Route path="/tour-cards" element={<TourCards />} />
      <Route path="/tour/:slug" element={<TourPage />} />
      <Route path="/login" element={<LoginPage />} />
    </Routes>
  );
}

export default App;