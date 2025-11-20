import Swal from 'sweetalert2';
import { createContext, useContext, useState, useCallback } from 'react';

// CORRECTED PATH: Assumes 'hooks' and 'services' are at the same level (e.g., both under 'src').
import * as CartService from '@Common/services/cart/cart_helper';    

// --- 1. Create Context ---
const CartContext = createContext();

// --- 2. Custom Hook to Consume Context ---
export const useCart = () => useContext(CartContext);

// --- 3. The Provider Component ---
export function CartProvider({ children }) {
    // State to hold the cart items
    const [cartItems, setCartItems] = useState([]);
    
    // ----------------------------------------------------
    // WRAPPER FUNCTIONS: Memoized functions that call the service layer.
    // ----------------------------------------------------

    const loadCart = useCallback(async (userId = 1) => {
        // Calls service, passing the state setter
        await CartService.loadCart(userId, setCartItems); 
    }, []); 

    const addToCart = useCallback(async (item) => {
        // Calls service, passing the state setter
        await CartService.addToCart(item, setCartItems);
    }, []); 

    const removeFromCart = useCallback(async (item) => {
        // Calls service, passing the state setter
        await CartService.removeFromCart(item, setCartItems);
    }, []);

    const clearCart = useCallback(async (userId, deleteAll = false) => {
        // Calls service, passing the state setter
        await CartService.clearCart(userId, deleteAll, setCartItems);
    }, []);

    // The context value bundles state and the wrapper functions
    const contextValue = {
        cartItems,          // The current array of items
        loadCart,           
        addToCart,          
        removeFromCart,     
        clearCart,          
    };

    return (
        <CartContext.Provider value={contextValue}>
            {children}
        </CartContext.Provider>
    );
}

export default CartProvider;