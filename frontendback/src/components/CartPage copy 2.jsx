import Swal from 'sweetalert2';
import { apiBaseTour, frontendBase } from '../config';
import { useState, useEffect } from 'react';
import { useCart } from './CartContext';
import styles from './CartPage.module.css';

export default function CartPage() {
    const { cartItems, removeFromCart, loadCart, clearCart } = useCart();
    const [selectedItems, setSelectedItems] = useState({});
    const [selectAll, setSelectAll] = useState(false);

    useEffect(() => {
        loadCart(1);
    }, []);

    const handleBulkBooking = async () => {
        const confirmedItems = cartItems.filter(item => selectedItems[item.id]);

        if (confirmedItems.length === 0) {
            Swal.fire({
                icon: 'warning',
                title: 'No Items Selected',
                text: 'Please select at least one item to book.',
                confirmButtonColor: '#f1c40f', // yellow warning color
            });
            return;
        }

        const user_id = 1; // Replace with actual logged-in user ID dynamically
        const email = "itloboc@gmail.com"; // Replace with dynamic email if needed

        const payload = {
            user_id,
            email,
            bookings: confirmedItems.map(item => ({
                title: item.title || item.item_title,
                price: (item.price || item.item_price).toString(),
                quantity: item.quantity
            }))
        };

        console.log("📤 Booking payload:", payload);

        try {
            const response = await fetch(`${apiBaseTour}/api/cr/book-cart`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (response.ok) {
                Swal.fire({
                    icon: 'success',
                    title: 'Booking Successful!',
                    text: `✅ Your booking has been confirmed!\nReference ID: ${data.reference_id}`,
                    confirmButtonColor: '#4CAF50',
                });
                clearCart(user_id); // ✅ Correct: Pass user_id from scope
                setSelectedItems({});
                setSelectAll(false);
            } else {
                Swal.fire({
                    icon: 'error',
                    title: 'Booking Failed!',
                    text: `❌ ${data.error || "Unknown error"}`,
                    confirmButtonColor: '#d33', // red button
                });
            }
        } catch (error) {
            console.error("❌ Error booking cart:", error);
            Swal.fire({
                icon: 'error',
                title: 'Booking Failed!',
                text: '❌ Network or server error occurred.',
                confirmButtonColor: '#d33', // red button
            });
        }
    };

    // 🔥 Individual Checkbox Handler
    const handleIndividualCheckbox = async (e, item) => {
        const checked = e.target.checked;
        const updated = { ...selectedItems, [item.id]: checked };
        setSelectedItems(updated);

        // Update selectAll if all checkboxes become checked
        setSelectAll(cartItems.every(it => updated[it.id]));

        // ✅ API call for individual checkbox
        try {
            const userId = 1; // Replace dynamically
            const payload = {
                user_id: userId,
                item_id: item.item_id,
                item_type: item.item_type,
                is_confirmed: checked,
            };

            console.log("📤 Confirm Booking Payload:", payload);

            const response = await fetch(`${apiBaseTour}/api/cr/confirm-booking-cart`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = await response.json();
            if (response.ok) {
                console.log(checked ? '✅ Booking confirmed:' : '🔄 Booking unconfirmed:', data.message);
            } else {
                console.error('❌ Error updating confirmation:', data.error);
            }
        } catch (err) {
            console.error('❌ Network error while updating confirmation:', err);
        }
    };

    // 🔥 Select All Checkbox Handler
    const handleSelectAll = async (e) => {
        const checked = e.target.checked;
        setSelectAll(checked);

        const updatedSelections = {};
        cartItems.forEach(item => {
            updatedSelections[item.id] = checked;
        });
        setSelectedItems(updatedSelections);

        const userId = 1; // Replace dynamically

        // ✅ Loop API calls for each item
        for (const item of cartItems) {
            const payload = {
                user_id: userId,
                item_id: item.item_id,
                item_type: item.item_type,
                is_confirmed: checked,
            };

            console.log("📤 Select All Payload:", payload);

            try {
                const response = await fetch(`${apiBaseTour}/api/cr/confirm-booking-cart`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });

                const data = await response.json();
                if (response.ok) {
                    console.log(checked ? `✅ Confirmed ${item.item_code}` : `🔄 Unconfirmed ${item.item_code}`);
                } else {
                    console.error('❌ Error updating confirmation:', data.error);
                }
            } catch (err) {
                console.error('❌ Network error while updating confirmation:', err);
            }
        }
    };

    return (
        <div style={{ padding: '2rem' }}>
            <h2>Your Tour Cart</h2>

            {cartItems.length === 0 ? (
                <>
                    <p>Your cart is empty.</p>
                </>
            ) : (
                <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <label>
                            <input
                                type="checkbox"
                                checked={selectAll}
                                onChange={(e) => {
                                    const checked = e.target.checked;
                                    setSelectAll(checked);
                                    const newSelected = {};
                                    cartItems.forEach(item => {
                                        newSelected[item.id] = checked;
                                    });
                                    setSelectedItems(newSelected);
                                }}
                            />
                            Select All
                        </label>

                        <button
                            disabled={!Object.values(selectedItems).some(val => val)}
                            onClick={handleBulkBooking}
                            style={{
                                padding: '0.5rem 1.25rem',
                                background: Object.values(selectedItems).some(val => val) ? '#28a745' : '#ccc',
                                color: 'white',
                                border: 'none',
                                borderRadius: '0.3rem',
                                cursor: Object.values(selectedItems).some(val => val) ? 'pointer' : 'not-allowed'
                            }}
                        >
                            ✅ Book Selected
                        </button>
                    </div>

                    <div className={styles.tourGrid}>
                        {cartItems.map((item, index) => {
                            const isUpload = (item.image || item.item_image)?.startsWith('/images');
                            const imageSrc = isUpload
                                ? `${frontendBase}/tourism-analytics${item.image || item.item_image}`
                                : `${apiBaseTour}/uploads/${item.image || item.item_image}`;

                            return (
                                <div key={index} className={styles.tourCard}>
                                    <h3>{item.title || item.item_title}</h3>

                                    {(item.image || item.item_image) && (
                                        <img
                                            src={imageSrc}
                                            alt={item.title || item.item_title}
                                            onError={(e) => {
                                                e.target.src = `${frontendBase}/tourism-analytics/images/placeholder.jpg`;
                                            }}
                                            style={{
                                                width: '100%',
                                                height: 'auto',
                                                borderRadius: '0.5rem',
                                                marginBottom: '0.75rem'
                                            }}
                                        />
                                    )}

                                    {item.hotel && <p>🏨 Hotel: {item.hotel}</p>}
                                    {item.car && <p>🚗 Car: {item.car}</p>}

                                    <p>
                                        💵 Price per Pax: ₱{parseFloat(item.price || item.item_price).toFixed(2)}<br />
                                        👥 Quantity: {item.quantity}<br />
                                        🧮 Total: ₱{(parseFloat(item.price || item.item_price) * item.quantity).toFixed(2)}
                                    </p>






                                    {/* ✅ Global Select All */}
                                    <div style={{ marginBottom: '1rem' }}>
                                        <label>
                                            <input
                                                type="checkbox"
                                                checked={selectAll}
                                                onChange={handleSelectAll} // Handles all checkboxes
                                            />
                                            Select All
                                        </label>
                                    </div>


                                    {/* ✅ Render Each Cart Item */}
                                    {cartItems.map(item => (
                                        <div key={item.id} className="cart-item">
                                            <h3>{item.item_code}</h3>
                                            <p>Price per Pax: ₱{item.total_price}</p>
                                            <p>Quantity: {item.quantity}</p>
                                            <p>Total: ₱{item.total_price}</p>

                                            {/* ✅ Individual Confirmation Checkbox */}
                                            <div style={{ marginTop: '1rem' }}>
                                                <label>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedItems[item.id] || false}
                                                        onChange={(e) => handleIndividualCheckbox(e, item)}
                                                    />
                                                    I confirm this booking and agree to the terms.
                                                </label>
                                            </div>
                                        </div>
                                    ))}





                                    {/* <div style={{ marginTop: '1.5rem' }}>
                                        <label>
                                            <input
                                                type="checkbox"
                                                checked={selectedItems[item.id] || false}
                                                onChange={async (e) => {
                                                    const checked = e.target.checked;
                                                    const updated = { ...selectedItems, [item.id]: checked };
                                                    setSelectedItems(updated);

                                                    // ✅ Update selectAll if all checkboxes become checked
                                                    setSelectAll(cartItems.every(it => updated[it.id]));

                                                    // ✅ API call to update is_confirmed (works for both checked & unchecked)
                                                    try {

                                                        const userId = 1; // Replace with actual logged-in user ID dynamically

                                                        const payload = {
                                                            user_id: userId, // Pass logged-in user_id
                                                            item_id: item.item_id,
                                                            item_type: item.item_type,
                                                            is_confirmed: checked, // ✅ Pass true if checked, false if unchecked
                                                        };

                                                        console.log("📤 Confirm Booking Payload:", payload);

                                                        const response = await fetch(`${apiBaseTour}/api/cr/confirm-booking-cart`, {
                                                            method: 'PUT',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify(payload),
                                                        });



                                                        const data = await response.json();
                                                        if (response.ok) {
                                                            console.log(
                                                                checked
                                                                    ? '✅ Booking confirmed:'
                                                                    : '🔄 Booking unconfirmed:',
                                                                data.message
                                                            );
                                                        } else {
                                                            console.error('❌ Error updating confirmation:', data.error);
                                                        }
                                                    } catch (err) {
                                                        console.error('❌ Network error while updating confirmation:', err);
                                                    }
                                                }}
                                            />
                                            I confirm this booking and agree to the terms.
                                        </label>
                                    </div> */}









                                    {/* <div style={{ marginTop: '1.5rem' }}>
                                        <label>
                                            <input
                                                type="checkbox"
                                                checked={selectedItems[item.id] || false}
                                                onChange={(e) => {
                                                    const updated = {
                                                        ...selectedItems,
                                                        [item.id]: e.target.checked,
                                                    };
                                                    setSelectedItems(updated);

                                                    // ✅ Update selectAll if all checkboxes become checked
                                                    setSelectAll(cartItems.every(it => updated[it.id]));
                                                }}
                                            />
                                            I confirm this booking and agree to the terms.
                                        </label>
                                    </div> */}

                                    <button
                                        onClick={() => removeFromCart(item)}
                                        style={{
                                            marginTop: '0.5rem',
                                            padding: '0.25rem 0.75rem',
                                            background: '#dc3545',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '0.25rem',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        🗑 Remove
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    {cartItems.length > 0 && (
                        <div style={{
                            textAlign: 'right',
                            fontWeight: 'bold',
                            fontSize: '1.1rem',
                            marginTop: '1rem',
                            borderTop: '1px solid #ccc',
                            paddingTop: '1rem'
                        }}>
                            Grand Total: ₱{cartItems.reduce((sum, item) => (
                                sum + (parseFloat(item.price || item.item_price) * item.quantity)
                            ), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                    )}

                    <button
                        onClick={clearCart}
                        style={{
                            marginTop: '1.5rem',
                            padding: '0.5rem 1rem',
                            background: '#007bff',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.3rem',
                            cursor: 'pointer'
                        }}
                    >
                        🧹 Clear Cart
                    </button>
                </>
            )}
        </div>
    );
}
