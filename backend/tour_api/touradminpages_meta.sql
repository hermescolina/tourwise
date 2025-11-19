CREATE OR REPLACE
ALGORITHM = UNDEFINED
VIEW `vw_tour_admin_json` AS
SELECT
  `v`.`slug` AS `slug`,
  CAST(
    JSON_OBJECT(
      'tour',
        JSON_OBJECT(
          'item_type', `v`.`item_type`,  
          'item_id',   `v`.`item_id`,
          'title',     `v`.`title`,
          'location',  `v`.`location`,
          'price',     `v`.`price`,
          'description', `v`.`description`,
          'category_id',  `v`.`category_id`,
          'image',     `v`.`image`
        )
    ) AS CHAR CHARACTER SET latin1
  ) AS `page_json`
FROM `vw_touradmin_page` `v`
WHERE `v`.`item_type` = 'tour';
