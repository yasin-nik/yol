ALTER TABLE users DROP CONSTRAINT IF EXISTS user_identity;
ALTER TABLE users ADD CONSTRAINT user_identity CHECK ((email IS NOT NULL AND password_hash IS NOT NULL) OR (role='CUSTOMER' AND phone IS NOT NULL));
