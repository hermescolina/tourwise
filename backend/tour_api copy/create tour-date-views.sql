help me create views with json output like shown below

ble_slots	50
category_id	3
created_at	"Sat, 26 Jul 2025 13:41:04 GMT"
description	"Explore the stunning lagoons of El Nido. Testing Edit"
end_date	"Fri, 29 Aug 2025 00:00:00 GMT"
image	"/images/el_nido.jpg"
item_id	2
location	"Abdulla Street, Barangay Maligaya, El Nido, Palawan 5313, Philippines"
price	"2200.00"
rating	0.0JS:0
slug	"el-nido-island-hopping"
start_date	"Mon, 25 Aug 2025 00:00:00 GMT"
subtitle	"Lagoons & Beaches"
title	"El Nido Island Hopping"
type	"tour"
updated_at	"Sat, 23 Aug 2025 05:35:04 GMT"
vendor_id


=============like this================
CREATE OR REPLACE
ALGORITHM = UNDEFINED VIEW `tourism_app`.`vw_tour_page_json` AS
select
    `i`.`slug` AS `slug`,
    cast(json_object('tour', json_object('item_id', `i`.`item_id`, 'title', `i`.`title`, 'location', `i`.`location`, 'price', `i`.`price`, 'inclusions', `t`.`inclusions`, 'exclusions', `t`.`exclusions`, 'tour_itinerary', `t`.`tour_itinerary`, 'tips', `t`.`tips`, 'updated_at', date_format(`i`.`last_updated`, '%Y-%m-%dT%H:%i:%sZ')), 'vendor',(select json_object('vendor_id', `v`.`vendor_id`, 'name', `v`.`name`, 'email', `v`.`email`, 'phone', `v`.`phone`, 'whatsapp', `v`.`whatsapp`, 'license_number', `v`.`license_number`, 'license_expiry', date_format(`v`.`license_expiry`, '%Y-%m-%d'), 'certifications', `v`.`certifications`, 'awards', `v`.`awards`, 'description', `v`.`description`, 'rating', `v`.`rating`, 'status', `v`.`status`, 'created_at', date_format(`v`.`created_at`, '%Y-%m-%dT%H:%i:%sZ'), 'updated_at', date_format(`v`.`updated_at`, '%Y-%m-%dT%H:%i:%sZ')) from `tourism_app`.`vendors` `v` where (`v`.`vendor_id` = `i`.`vendor_id`) limit 1), 'tour_guides', coalesce((select json_arrayagg(`tgj`.`obj`) from (select json_object('id', `tg`.`id`, 'vendor_id', `tg`.`vendor_id`, 'name', `tg`.`name`, 'phone', `tg`.`phone`, 'email', `tg`.`email`, 'language_spoken', `tg`.`language_spoken`, 'location', `tg`.`location`, 'availability', `tg`.`availability`, 'rating', `tg`.`rating`, 'total_reviews', `tg`.`total_reviews`, 'commission_rate', `tg`.`commission_rate`, 'notes', `tg`.`notes`, 'created_at', date_format(`tg`.`created_at`, '%Y-%m-%dT%H:%i:%sZ'), 'updated_at', date_format(`tg`.`updated_at`, '%Y-%m-%dT%H:%i:%sZ')) AS `obj` from (`tourism_app`.`tour_guides` `tg` join `tourism_app`.`tour_guide_assignments` `tga` on((`tga`.`guide_id` = `tg`.`id`))) where (`tga`.`item_id` = `i`.`item_id`) order by `tg`.`created_at` desc) `tgj`), json_array()), 'history_images', coalesce((select json_arrayagg(`hj`.`obj`) from (select json_object('image_path', `h`.`image_path`, 'caption', `h`.`caption`, 'category', `h`.`category`, 'created_at', date_format(`h`.`created_at`, '%Y-%m-%dT%H:%i:%sZ')) AS `obj` from `tourism_app`.`tour_history_images` `h` where (`h`.`tour_id` = `i`.`item_id`) order by `h`.`created_at` desc) `hj`), json_array()), 'videos', coalesce((select json_arrayagg(`vj`.`obj`) from (select json_object('video_id', `vv`.`video_id`, 'caption', `vv`.`caption`, 'category', `vv`.`category`, 'created_at', date_format(`vv`.`created_at`, '%Y-%m-%dT%H:%i:%sZ')) AS `obj` from `tourism_app`.`tour_videos` `vv` where (`vv`.`tour_id` = `i`.`item_id`) order by `vv`.`created_at` desc) `vj`), json_array())) as char charset latin1) AS `page_json`
from
    (`tourism_app`.`items` `i`
join `tourism_app`.`tours` `t` on
    ((`t`.`tour_id` = `i`.`item_id`)))
where
    ((`i`.`item_type` = 'tour')
        and (`i`.`status` = 'active'));


============table reference===========
same table used in this views

CREATE OR REPLACE
ALGORITHM = UNDEFINED VIEW `tourism_app`.`vw_landing_page` AS
select
    `i`.`item_id` AS `item_id`,
    'tour' AS `type`,
    `i`.`title` AS `title`,
    `i`.`description` AS `description`,
    coalesce(json_unquote(json_extract(`t`.`tour_itinerary`, '$[0].title')), '') AS `subtitle`,
    `i`.`image` AS `image`,
    `i`.`available_slots` AS `available_slots`,
    `i`.`start_date` AS `start_date`,
    `i`.`end_date` AS `end_date`,
    `i`.`price` AS `price`,
    `i`.`location` AS `location`,
    `i`.`rating` AS `rating`,
    `i`.`slug` AS `slug`,
    `i`.`vendor_id` AS `vendor_id`,
    `i`.`category_id` AS `category_id`,
    `i`.`created_at` AS `created_at`,
    `i`.`last_updated` AS `updated_at`
from
    (`tourism_app`.`items` `i`
join `tourism_app`.`tours` `t` on
    ((`t`.`tour_id` = `i`.`item_id`)))
where
    ((`i`.`item_type` = 'tour')
        and (`i`.`status` = 'active'))
union all
select
    `i`.`item_id` AS `item_id`,
    'hotel' AS `type`,
    `i`.`title` AS `title`,
    `i`.`description` AS `description`,
    `h`.`hotel_type` AS `subtitle`,
    `i`.`image` AS `image`,
    NULL AS `available_slots`,
    NULL AS `start_date`,
    NULL AS `end_date`,
    `i`.`price` AS `price`,
    `i`.`location` AS `location`,
    `i`.`rating` AS `rating`,
    `i`.`slug` AS `slug`,
    `i`.`vendor_id` AS `vendor_id`,
    `i`.`category_id` AS `category_id`,
    NULL AS `created_at`,
    NULL AS `updated_at`
from
    (`tourism_app`.`items` `i`
join `tourism_app`.`hotels` `h` on
    ((`h`.`hotel_id` = `i`.`item_id`)))
where
    ((`i`.`item_type` = 'hotel')
        and (`i`.`status` = 'active'));


drop view vw_tour_data_page_json;
CREATE OR REPLACE
ALGORITHM = UNDEFINED VIEW `tourism_app`.`vw_tour_landing_page_json` AS
SELECT
    `i`.`slug` AS `slug`,
    CAST(
      JSON_OBJECT(
        'tour',
          JSON_OBJECT(
            'item_id',      `i`.`item_id`,
            'title',        `i`.`title`,
            'description',  `i`.`description`,
            'image',        `i`.`image`,
            'ble_slots',    `i`.`available_slots`,
            'start_date',   DATE_FORMAT(`i`.`start_date`, '%a, %d %b %Y %H:%i:%s GMT'),
            'end_date',     DATE_FORMAT(`i`.`end_date`, '%a, %d %b %Y %H:%i:%s GMT'),
            'price',        FORMAT(`i`.`price`, 2),
            'location',     `i`.`location`,
            'rating',       COALESCE(`i`.`rating`, 0),
            'slug',         `i`.`slug`,
            'category_id',  `i`.`category_id`,
            'created_at',   DATE_FORMAT(`i`.`created_at`, '%a, %d %b %Y %H:%i:%s GMT'),
            'updated_at',   DATE_FORMAT(`i`.`last_updated`, '%a, %d %b %Y %H:%i:%s GMT'),
            'type',         'tour',
            'vendor_id',    `i`.`vendor_id`
          )
      ) AS CHAR CHARSET latin1
    ) AS `page_json`
FROM
    `tourism_app`.`items` `i`
JOIN
    `tourism_app`.`tours` `t`
      ON `t`.`tour_id` = `i`.`item_id`
WHERE
    `i`.`item_type` = 'tour'
    AND `i`.`status` = 'active';


-- tourism_app.tourpages_meta definition

CREATE TABLE `tourlandingpages_meta` (
  `k` varchar(50) NOT NULL,
  `v` varchar(100) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`k`),
  KEY `idx_tourlandingpages_meta_k` (`k`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



mysql> desc tourpages_meta;
+------------+--------------+------+-----+-------------------+-----------------------------------------------+
| Field      | Type         | Null | Key | Default           | Extra                                         |
+------------+--------------+------+-----+-------------------+-----------------------------------------------+
| k          | varchar(50)  | NO   | PRI | NULL              |                                               |
| v          | varchar(100) | YES  |     | NULL              |                                               |
| updated_at | timestamp    | YES  |     | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
+------------+--------------+------+-----+-------------------+-----------------------------------------------+
3 rows in set (0.00 sec)


DELIMITER $$

CREATE PROCEDURE `update_tourpages_version`(
  IN p_k VARCHAR(50),
  IN p_v VARCHAR(100)
)
BEGIN
  INSERT INTO tourpages_meta (`k`, `v`, `updated_at`)
  VALUES (p_k, p_v, NOW())
  ON DUPLICATE KEY
  UPDATE `v` = p_v,
         `updated_at` = NOW();
END$$

DELIMITER ;

DELIMITER $$

CREATE PROCEDURE `sp_update_tour_landing_pages_meta`(
  IN p_k VARCHAR(50),
  IN p_v VARCHAR(100)
)
BEGIN
  INSERT INTO tourlandginpages_meta (`k`, `v`, `updated_at`)
  VALUES (p_k, p_v, NOW())
  ON DUPLICATE KEY
  UPDATE `v` = p_v,
         `updated_at` = NOW();
END$$

DELIMITER ;


DELIMITER $$

/* ---------- ITEMS TRIGGERS ---------- */

CREATE TRIGGER trg_items_after_insert_meta
AFTER INSERT ON items
FOR EACH ROW
BEGIN
  CALL sp_update_tour_landing_pages_meta(
    'items_last_event',
    CONCAT('insert:', CAST(NEW.item_id AS CHAR), '@', DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s'))
  );
END$$

CREATE TRIGGER trg_items_after_update_meta
AFTER UPDATE ON items
FOR EACH ROW
BEGIN
  CALL sp_update_tour_landing_pages_meta(
    'items_last_event',
    CONCAT('update:', CAST(NEW.item_id AS CHAR), '@', DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s'))
  );
END$$

CREATE TRIGGER trg_items_after_delete_meta
AFTER DELETE ON items
FOR EACH ROW
BEGIN
  CALL sp_update_tour_landing_pages_meta(
    'items_last_event',
    CONCAT('delete:', CAST(OLD.item_id AS CHAR), '@', DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s'))
  );
END$$


/* ---------- TOURS TRIGGERS ---------- */

CREATE TRIGGER trg_tours_after_insert_meta
AFTER INSERT ON tours
FOR EACH ROW
BEGIN
  CALL sp_update_tour_landing_pages_meta(
    'tours_last_event',
    CONCAT('insert:', CAST(NEW.tour_id AS CHAR), '@', DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s'))
  );
END$$

CREATE TRIGGER trg_tours_after_update_meta
AFTER UPDATE ON tours
FOR EACH ROW
BEGIN
  CALL sp_update_tour_landing_pages_meta(
    'tours_last_event',
    CONCAT('update:', CAST(NEW.tour_id AS CHAR), '@', DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s'))
  );
END$$

CREATE TRIGGER trg_tours_after_delete_meta
AFTER DELETE ON tours
FOR EACH ROW
BEGIN
  CALL sp_update_tour_landing_pages_meta(
    'tours_last_event',
    CONCAT('delete:', CAST(OLD.tour_id AS CHAR), '@', DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s'))
  );
END$$

DELIMITER ;

DELIMITER $$

CREATE DEFINER=`root`@`localhost` TRIGGER `trg_vendors_after_insert_meta` AFTER INSERT ON `vendors` FOR EACH ROW BEGIN
    CALL tourism_app.sp_update_tour_landing_pages_meta();
END$$

CREATE DEFINER=`root`@`localhost` TRIGGER `trg_vendors_after_delete_meta` AFTER DELETE ON `vendors` FOR EACH ROW BEGIN
    CALL tourism_app.sp_update_tour_landing_pages_meta();
END$$

CREATE DEFINER=`root`@`localhost` TRIGGER `trg_vendors_after_update_meta` AFTER UPDATE ON `vendors` FOR EACH ROW BEGIN
    CALL tourism_app.sp_update_tour_landing_pages_meta();
END$$


CREATE DEFINER=`root`@`localhost` TRIGGER `trg_tour_videos_after_insert_meta` AFTER INSERT ON `tour_videos` FOR EACH ROW BEGIN
    CALL tourism_app.sp_update_tour_landing_pages_meta();
END$$

CREATE DEFINER=`root`@`localhost` TRIGGER `trg_tour_videos_after_delete_meta` AFTER DELETE ON `tour_videos` FOR EACH ROW BEGIN
    CALL tourism_app.sp_update_tour_landing_pages_meta();
END$$

CREATE DEFINER=`root`@`localhost` TRIGGER `trg_tour_videos_after_update_meta` AFTER UPDATE ON `tour_videos` FOR EACH ROW BEGIN
    CALL tourism_app.sp_update_tour_landing_pages_meta();
END$$

CREATE DEFINER=`root`@`localhost` TRIGGER `trg_tour_guides_after_insert_meta` AFTER INSERT ON `tour_guides` FOR EACH ROW BEGIN
    CALL tourism_app.sp_update_tour_landing_pages_meta();
END$$

CREATE DEFINER=`root`@`localhost` TRIGGER `trg_tour_guides_after_delete_meta` AFTER DELETE ON `tour_guides` FOR EACH ROW BEGIN
    CALL tourism_app.sp_update_tour_landing_pages_meta();
END$$

CREATE DEFINER=`root`@`localhost` TRIGGER `trg_tour_guides_after_update_meta` AFTER UPDATE ON `tour_guides` FOR EACH ROW BEGIN
    CALL tourism_app.sp_update_tour_landing_pages_meta();
END$$

CREATE DEFINER=`root`@`localhost` TRIGGER `trg_tour_history_images_after_insert_meta` AFTER INSERT ON `tour_history_images` FOR EACH ROW BEGIN
    CALL tourism_app.sp_update_tour_landing_pages_meta();
END$$

CREATE DEFINER=`root`@`localhost` TRIGGER `trg_tour_history_images_after_delete_meta` AFTER DELETE ON `tour_history_images` FOR EACH ROW BEGIN
    CALL tourism_app.sp_update_tour_landing_pages_meta();
END$$

CREATE DEFINER=`root`@`localhost` TRIGGER `trg_tour_history_images_after_update_meta` AFTER UPDATE ON `tour_history_images` FOR EACH ROW BEGIN
    CALL tourism_app.sp_update_tour_landing_pages_meta();
END$$

DELIMITER ;



copy the template of the view below

CREATE OR REPLACE
ALGORITHM = UNDEFINED VIEW `tourism_app`.`vw_tour_landing_page_json` AS
select
    `i`.`slug` AS `slug`,
    cast(json_object('tour', json_object('item_id', `i`.`item_id`, 'item_type', `i`.`item_type`, 'title', `i`.`title`, 'description', `i`.`description`, 'image', `i`.`image`, 'ble_slots', `i`.`available_slots`, 'start_date', date_format(`i`.`start_date`, '%a, %d %b %Y %H:%i:%s GMT'), 'end_date', date_format(`i`.`end_date`, '%a, %d %b %Y %H:%i:%s GMT'), 'price', format(`i`.`price`, 2), 'location', `i`.`location`, 'rating', coalesce(`i`.`rating`, 0), 'slug', `i`.`slug`, 'category_id', `i`.`category_id`, 'created_at', date_format(`i`.`created_at`, '%a, %d %b %Y %H:%i:%s GMT'), 'updated_at', date_format(`i`.`last_updated`, '%a, %d %b %Y %H:%i:%s GMT'), 'type', 'tour', 'vendor_id', `i`.`vendor_id`)) as char charset latin1) AS `page_json`
from
    (`tourism_app`.`items` `i`
join `tourism_app`.`tours` `t` on
    ((`t`.`tour_id` = `i`.`item_id`)))
where
    ((`i`.`item_type` = 'tour')
        and (`i`.`status` = 'active'));




CREATE OR REPLACE
ALGORITHM = UNDEFINED VIEW `tourism_app`.`vw_tour_page` AS
select
    `i`.`slug` AS `slug`,
    `i`.`item_id` AS `item_id`,
    `i`.`title` AS `tour_title`,
    `i`.`location` AS `tour_location`,
    `i`.`price` AS `price`,
    `img`.`image_path` AS `history_images`,
    `t`.`inclusions` AS `inclusions`,
    `t`.`exclusions` AS `exclusions`,
    `t`.`tour_itinerary` AS `tour_itinerary`,
    `t`.`tips` AS `tips`,
    `i`.`last_updated` AS `updated_at`
from
    ((`tourism_app`.`items` `i`
join `tourism_app`.`tours` `t` on
    ((`t`.`tour_id` = `i`.`item_id`)))
left join (
    select
        `tourism_app`.`tour_history_images`.`tour_id` AS `tour_id`,
        `tourism_app`.`tour_history_images`.`image_path` AS `image_path`
    from
        `tourism_app`.`tour_history_images`
    where
        (`tourism_app`.`tour_history_images`.`created_at` = (
        select
            max(`thi2`.`created_at`)
        from
            `tourism_app`.`tour_history_images` `thi2`
        where
            (`thi2`.`tour_id` = `tourism_app`.`tour_history_images`.`tour_id`)))) `img` on
    ((`img`.`tour_id` = `i`.`item_id`)))
where
    ((`i`.`item_type` = 'tour')
        and (`i`.`status` = 'active'));

{console.log("222244 items",items[0])}
these are the result
222244 items {"tour": {"slug": "el-nido-island-hopping", "type": "tour", "image": "/images/el_nido.jpg", "price": "2,200.00", "title": "El Nido Island Hopping", "rating": 0.0, "item_id": 2, "end_date": "Fri, 29 Aug 2025 00:00:00 GMT", "location": "Abdulla Street, Barangay Maligaya, El?Nido, Palawan 5313, Philippines", "ble_slots": 50, "item_type": "tour", "vendor_id": 1, "created_at": "Sat, 26 Jul 2025 13:41:04 GMT", "start_date": "Mon, 25 Aug 2025 00:00:00 GMT", "updated_at": "Sat, 23 Aug 2025 05:35:04 GMT", "category_id": 3, "description": "Explore the stunning lagoons of El Nido. Testing Edit"}} 2 TourWiseLanding.jsx:421:30
how to log the specific Field like type?

{console.log("222244 items",items[0]?.tour?.type)}
result
222244 items undefined 2 TourWiseLanding.jsx:421:30