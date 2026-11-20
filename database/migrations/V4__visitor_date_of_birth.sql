-- Date of birth, read from the identity document when it is scanned with the camera (or typed in).
-- Optional: older profiles and documents without a readable date have none.
ALTER TABLE visitor ADD COLUMN date_of_birth DATE;
