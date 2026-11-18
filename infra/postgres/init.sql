-- Runs once when the Postgres container is first created.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Separate database for automated tests
CREATE DATABASE agripay_test OWNER agripay;
\c agripay_test
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
