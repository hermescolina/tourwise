import React from 'react';
import { Routes, Route } from 'react-router-dom';

// --- THE CRITICAL IMPORT ---
// import TourWiseLanding from '@LandingPage/pages/TourWiseLanding.jsx';
import TestPage from '@LandingPage/pages/TestPage';
// import TourWiseLanding from './features/LandingPage/pages/TourWiseLanding.jsx';

function App() {
  return (
    <Routes>
      {/* <Route path="/" element={<TourWiseLanding />} /> */}
      <Route path="/TestPage" element={<TestPage />} />
    </Routes>
  );
}

export default App;