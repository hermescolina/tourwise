// src/features/common/components/CartIcon.jsx

import React from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '@Common/components/CartContext'; 

/**
 * CartIcon
 * Displays the shopping cart icon with a dynamic badge showing the number of items.
 * Renders the count badge only if items are present.
 */
export function CartIcon() {
    // Access the global cart state to get the current item count
    const { cartItems } = useCart(); 

    return (
        <div style={{ position: 'relative', marginLeft: 'auto' }}>
            {/* Link to the cart page, using the path relative to the basename */}
            <Link 
                to="/tourism-analytics/cart" 
                style={{ 
                    fontSize: '2.2rem', 
                    textDecoration: 'none',
                    color: '#333' // Use a default color
                }}
            >
                🛒
            </Link>

            {/* Cart item count badge (Conditional rendering) */}
            {cartItems.length > 0 && (
                <span style={{
                    position: 'absolute',
                    top: '-0.3rem',
                    right: '-0.6rem',
                    backgroundColor: 'red',
                    color: 'white',
                    borderRadius: '50%',
                    padding: '0.2rem 0.5rem',
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    lineHeight: '1',
                    minWidth: '1.5rem',
                    textAlign: 'center',
                    zIndex: 10
                }}>
                    {cartItems.length > 99 ? '99+' : cartItems.length}
                </span>
            )}
        </div>
    );
}