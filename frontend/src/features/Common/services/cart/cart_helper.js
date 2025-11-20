
const addToCart = async (item) => {
  try {
    // 1) Build ONE payload and reuse it (avoid drift: you had item.slug vs item.item_code)
    const payload = {
      user_id: 1,                             // TODO: make dynamic later
      vendor_id: item.vendor_id ?? null,
      item_type: item.type,                   // 'tour' | 'hotel' | 'car'
      item_id: item.item_id,                  // make sure this exists
      item_code: item.item_code ?? item.slug, // prefer explicit, fallback to slug
      quantity: item.quantity ?? 1,
      total_price: (item.price ?? 0) * (item.quantity ?? 1),
      selected_date: item.selected_date ?? null, // "YYYY-MM-DD" if present
    };

    console.log("📝 Cart Payload:", payload);

    // (optional) quick client-side guard
    if (!payload.item_type || !payload.item_id) {
      Swal.fire({
        icon: 'warning',
        title: 'Missing Required Fields',
        text: 'Please select a valid item before adding to cart.',
      });
      return;
    }

    const response = await fetch(`${apiBaseTour}/api/cr/cart`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    // 2) Read text first, then attempt JSON only if content-type is JSON
    const raw = await response.text();
    let data = null;
    const isJson = (response.headers.get('content-type') || '').includes('application/json');
    if (isJson && raw) {
      try { data = JSON.parse(raw); } catch { /* keep null; raw has error html/text */ }
    }

    if (!response.ok) {
      const msg = data?.error || data?.message || data?.detail || raw || `HTTP ${response.status}`;
      console.error('❌ Add to cart failed:', msg);
      Swal.fire({
        icon: 'error',
        title: 'Add to cart failed',
        text: String(msg).slice(0, 300),
      });
      return;
    }

    console.log('✅ Added to backend cart:', data);
    setCartItems((prev) => [...prev, item]);
  } catch (error) {
    console.error('Add to cart error:', error);
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'Something went wrong while adding to cart.',
    });
  }
};



const removeFromCart = async (item) => {
    console.log('Removing item from cart:', item); // Logs the whole object
    try {
        const response = await fetch(`${apiBaseTour}/api/cr/cart`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                user_id: 1, // Replace with real user ID
                vendor_id: item.vendor_id,
                item_type: item.item_type,
                item_id: item.item_id,
            }),
        });

        const body = {
            user_id: 1, // Replace with real user ID
            vendor_id: item.vendor_id,
            item_type: item.item_type,
            item_id: item.item_id,
        };

        console.log("Request body:", JSON.stringify(body, null, 2)); // Pretty print

        const result = await response.json();

        if (response.ok) {
            setCartItems((prevItems) =>
                prevItems.filter((i) => i.item_id !== item.item_id)
            );
        } else {
            alert(result.error || 'Failed to remove item from cart');
        }
    } catch (error) {
        console.log("I'M HERE ====>")
        console.error('Remove from cart error:', error);
        alert('An error occurred while removing the item.');
    }
};


const loadCart = async (userId = 1) => {
    try {
        const response = await fetch(`${apiBaseTour}/api/cr/cart/${userId}`);
        const data = await response.json();

        if (Array.isArray(data)) {
            setCartItems(data); // Update local cart state
        } else {
            console.warn('Unexpected cart data format:', data);
        }
    } catch (error) {
        console.error('Failed to load cart:', error);
    }
};

const clearCart = async (userId, delete_all = false) => {
    setCartItems([]);

    try {
        const payload = { user_id: userId, delete_all }; // ✅ prepare payload
        console.log("Clear cart payload:", payload);     // 👀 log payload

        const response = await fetch(`${apiBaseTour}/api/cr/clear-cart`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload) // send payload
        });

        if (!response.ok) {
            throw new Error(`Server returned status ${response.status}`);
        }

        const data = await response.json();
        console.log('Cart cleared:', data.message || data);

    } catch (error) {
        console.error('Remove from cart error:', error);
        alert('An error occurred while clearing the cart.');
    }
};
