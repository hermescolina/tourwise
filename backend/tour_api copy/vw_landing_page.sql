CREATE OR REPLACE VIEW vw_landing_page AS
-- ✅ Fixed query
SELECT 
    i.item_id AS item_id,
    'tour' AS type,
    i.title AS title,
    i.description AS description,
    COALESCE(
      JSON_UNQUOTE(JSON_EXTRACT(t.tour_itinerary, '$[0].title')),
      ''
    ) AS subtitle,
    i.image AS image,
    i.available_slots AS available_slots,
    i.start_date as start_date,
    i.end_date as end_date,
    i.price AS price,
    i.location AS location,
    i.rating AS rating,
    i.slug AS slug,
    i.vendor_id AS vendor_id,
    i.category_id AS category_id
FROM items i
JOIN tours t 
  ON t.tour_id = i.item_id
WHERE i.item_type = 'tour'
  AND i.status = 'active'

UNION ALL

SELECT 
    i.item_id AS item_id,
    'hotel' AS type,
    i.title AS title,
    i.description AS description,
    h.hotel_type AS subtitle,
    i.image AS image,
    NULL AS available_slots,        -- 👈 keep column count/order aligned
    NULL as start_date,
    NULL as end_date,
    i.price AS price,
    i.location AS location,
    i.rating AS rating,
    i.slug AS slug,
    i.vendor_id AS vendor_id,
    i.category_id AS category_id
FROM items i
JOIN hotels h 
  ON h.hotel_id = i.item_id
WHERE i.item_type = 'hotel'
  AND i.status = 'active';
