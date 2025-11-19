CREATE OR REPLACE VIEW vw_cart_details AS
SELECT 
    c.id AS id,
    c.user_id AS user_id,
    c.vendor_id AS vendor_id,
    c.item_type AS item_type,
    c.item_id AS item_id,
    c.item_code AS item_code,
    c.quantity AS quantity,
    c.selected_date AS selected_date,
    c.is_confirmed AS is_confirmed,
    c.confirmed_at AS confirmed_at,
    c.created_at AS created_at,
    i.title AS title,
    i.slug AS slug,
    i.location AS location,
    i.category_id AS category_id,
    i.image AS image,
    i.price AS unit_price,
    (c.quantity * i.price) AS line_total,
    COALESCE(NULLIF(c.total_price, 0.00), (c.quantity * i.price)) AS effective_total
FROM cart c
LEFT JOIN items i 
    ON i.item_id = c.item_id and i.item_type = c.item_type;  -- ✅ Fixed join
