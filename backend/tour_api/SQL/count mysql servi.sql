SELECT
    count(*)
FROM
    information_schema.views
WHERE
    table_schema = 'tourism_app';

SELECT
    count(*)
FROM
    information_schema.tables
WHERE
    table_schema = 'tourism_app';

SELECT
    count(*)
FROM
    information_schema.triggers
WHERE
    TRIGGER_SCHEMA = 'tourism_app';

SELECT
    count(*)
FROM
    information_schema.routines
WHERE
    ROUTINE_SCHEMA = 'tourism_app' AND ROUTINE_TYPE = 'PROCEDURE';