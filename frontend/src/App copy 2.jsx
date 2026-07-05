import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import TourWiseLanding from '@LandingPage/pages/TourWiseLanding.jsx';
import TourCards from '@TourCardsPage/pages/TourCards.jsx';
import TourPage from '@TourPage/pages/TourPage.jsx';
import LoginPage from '@LoginPage/LoginPage.jsx';

import TapWidget from '@/TapWidget';

function App() {
  return (
    <>
    <p>Hello</p>
    <TapWidget />
      {/* <Routes>
        <Route 
          path="/" 
          element={<TourWiseLanding />} 
          key={location.pathname + location.search}
        />
        <Route path="/tour-cards" element={<TourCards />} />
        <Route
          path="/tour/:slug"
          element={<TourPage />}
          key={location.pathname + location.search}
        />
        <Route path="/login" element={<LoginPage />} />
      </Routes> */}
      <TapWidget />
    </>
  );
}

export default App;