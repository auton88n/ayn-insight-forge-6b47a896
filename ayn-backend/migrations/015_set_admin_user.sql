-- Migration 015: Set admin account in Railway
INSERT INTO users (id, email, password_hash, first_name, last_name, is_admin, created_at)
VALUES (
    gen_random_uuid(),
    'ghazi@aynn.io',
    '$2b$12$gXoKjpWhXfmyQwcV448zIOKi1AXUceijkoLy6geUwqhBpE46KCcZm',
    'Ghazi',
    'Admin',
    TRUE,
    NOW()
)
ON CONFLICT (email) DO UPDATE SET
    password_hash = '$2b$12$gXoKjpWhXfmyQwcV448zIOKi1AXUceijkoLy6geUwqhBpE46KCcZm',
    is_admin = TRUE;
