CREATE OR REPLACE VIEW vw_landing_page AS
/* Tours */
SELECT
  i.id                                        AS id,
  'tour'                                      AS type,
  i.title                                     AS title,
  /* optional: first itinerary title as a subtitle, else NULL */
  JSON_UNQUOTE(JSON_EXTRACT(t.tour_itinerary, '$[0].title')) AS subtitle,
  i.image                                     AS image,
  i.price                                     AS price,
  i.location                                  AS location,
  i.rating                                    AS rating,
  i.slug                                      AS slug,
  i.vendor_id                                 AS vendor_id,
  i.category_id                               AS category_id
FROM items i
JOIN tours t ON t.tour_id = i.id
WHERE i.item_type = 'tour' AND i.status = 'active'

UNION ALL

/* Hotels (incl. resorts etc. since they’re under hotels) */
SELECT
  i.id                                        AS id,
  'hotel'                                     AS type,
  i.title                                     AS title,
  h.hotel_type                                AS subtitle,  -- e.g. 'hotel', 'resort', ...
  i.image                                     AS image,
  i.price                                     AS price,
  i.location                                  AS location,
  i.rating                                    AS rating,
  i.slug                                      AS slug,
  i.vendor_id                                 AS vendor_id,
  i.category_id                               AS category_id
FROM items i
JOIN hotels h ON h.hotel_id = i.id
WHERE i.item_type = 'hotel' AND i.status = 'active';
