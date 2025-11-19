// // src/main.jsx

// import React from 'react';
// import ReactDOM from 'react-dom/client';
// import { BrowserRouter as Router } from 'react-router-dom';
// import App from './App.jsx'; // Use a simple relative import for now
// import { CartProvider } from '@LandingPage/components/CartContext';

// // Get the root DOM element
// const root = ReactDOM.createRoot(document.getElementById('root'));

// // Render the application, wrapping App in the Router
// root.render(
//   <React.StrictMode>
//     <Router basename="/tourism-analytics/">
//       <App />
//     </Router>
//   </React.StrictMode>
// );

// src/main.jsx

// import React from 'react';
// import ReactDOM from 'react-dom/client';
// import { BrowserRouter as Router } from 'react-router-dom';
// import App from './App.jsx'; // Use a simple relative import for now
// // import { CartProvider } from '@LandingPage/components/CartContext.jsx';
// import { CartProvider } from './features/LandingPage/components/CartContext.jsx';

// // Get the root DOM element
// const root = ReactDOM.createRoot(document.getElementById('root'));

// // Render the application, wrapping App in the Router
// root.render(
//     <React.StrictMode>
//       <CartProvider>
//         <App />
//       </CartProvider>
//   </React.StrictMode>
// );


import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router } from 'react-router-dom';

import App from './App.jsx';
// Use the reliable relative path for now
// import { CartProvider } from './features/LandingPage/components/CartContext.jsx';
import { CartProvider } from '@LandingPage/components/CartContext.jsx';

// Get the root DOM element
const root = ReactDOM.createRoot(document.getElementById('root'));

// Render the application with the correct hierarchy
root.render(
  <React.StrictMode>
    {/* 1. The Router is the top-level provider for navigation. */}
    <Router basename="/tourism-analytics/">
      
      {/* 2. The CartProvider wraps the components that will need access to the cart. */}
      {/*    Placing it here makes the cart available to your entire App. */}
      <CartProvider>
        <App />
      </CartProvider>
    </Router>
  </React.StrictMode>
);