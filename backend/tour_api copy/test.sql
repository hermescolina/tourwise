Skip to content
Chat history
You said:
organize:  View: vw_landing_page
         Create View: CREATE ALGORITHM=UNDEFINED DEFINER=root@localhost SQL SECURITY DEFINER VIEW vw_landing_page AS select i.id AS id,'tour' AS type,i.title AS title,json_unquote(json_extract(t.tour_itinerary,'$[0].title')) AS subtitle,i.image AS image,i.price AS price,i.location AS location,i.rating AS rating,i.slug AS slug,i.vendor_id AS vendor_id,i.category_id AS category_id from (items i join tours t on((t.tour_id = i.id))) where ((i.item_type = 'tour') and (i.status = 'active')) union all select i.id AS id,'hotel' AS type,i.title AS title,h.hotel_type AS subtitle,i.image AS image,i.price AS price,i.location AS location,i.rating AS rating,i.slug AS slug,i.vendor_id AS vendor_id,i.category_id AS category_id from (items i join hotels h on((h.hotel_id = i.id))) where ((i.item_type = 'hotel') and (i.status = 'active'))
character_set_client: latin1
collation_connection: latin1_swedish_ci
1 row in set (0.00 sec)
ChatGPT said:

Here’s your vw_landing_page view formatted for readability:

CREATE ALGORITHM=UNDEFINED 
DEFINER=`root`@`localhost` 
SQL SECURITY DEFINER 
VIEW `vw_landing_page` AS

-- Tours
SELECT 
    i.id AS id,
    'tour' AS type,
    i.title AS title,
    JSON_UNQUOTE(JSON_EXTRACT(t.tour_itinerary, '$[0].title')) AS subtitle,
    i.image AS image,
    i.price AS price,
    i.location AS location,
    i.rating AS rating,
    i.slug AS slug,
    i.vendor_id AS vendor_id,
    i.category_id AS category_id
FROM items i
JOIN tours t 
    ON t.tour_id = i.id
WHERE 
    i.item_type = 'tour'
    AND i.status = 'active'

UNION ALL

-- Hotels
SELECT 
    i.id AS id,
    'hotel' AS type,
    i.title AS title,
    h.hotel_type AS subtitle,
    i.image AS image,
    i.price AS price,
    i.location AS location,
    i.rating AS rating,
    i.slug AS slug,
    i.vendor_id AS vendor_id,
    i.category_id AS category_id
FROM items i
JOIN hotels h 
    ON h.hotel_id = i.id
WHERE 
    i.item_type = 'hotel'
    AND i.status = 'active';

This preserves exactly the same logic, just spaced and indented so you can read and modify it more easily.

If you want, I can also break this into two separate views (vw_landing_tours and vw_landing_hotels) and then union them — which would make maintenance easier without changing query results.


ChatGPT can make mistakes. Check important info.
