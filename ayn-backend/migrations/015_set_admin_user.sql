-- Migration 015: Set real password for ghazi@aynn.io
-- User exists from migration 007 with LEGACY_RESET_REQUIRED password
-- This sets a real bcrypt password so admin login works

UPDATE users 
SET password_hash = '$2b$12$bu5Rcpyh9rZm9Rq6rrBl9ubYaIigcWEnquhodY0BQ.z1GkL3MdACS',
    is_admin = TRUE,
    updated_at = NOW()
WHERE email = 'ghazi@aynn.io';

-- Also ensure ghazi.aldhyaei@gmail.com is admin
UPDATE users 
SET password_hash = '$2b$12$bu5Rcpyh9rZm9Rq6rrBl9ubYaIigcWEnquhodY0BQ.z1GkL3MdACS',
    is_admin = TRUE,
    updated_at = NOW()
WHERE email = 'ghazi.aldhyaei@gmail.com';
