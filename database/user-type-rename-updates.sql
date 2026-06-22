-- ==========================================================================
-- User Type Rename Migration
-- Renames user types to match the new simplified customer profiles:
--   Rental Owner → Owner   (property owners who rent to renters)
--   Renovation Client → Client   (clients wanting renovations)
--   Other → Client   (catch-all mapped to Client)
-- Also updates property photos to be client-visible by default.
-- ==========================================================================

-- 1. Update profiles: rename user_type values
UPDATE profiles SET user_type = 'Owner'  WHERE lower(user_type) IN ('rental owner', 'property owner', 'property management client');
UPDATE profiles SET user_type = 'Client' WHERE lower(user_type) IN ('renovation client', 'other');

-- 2. Update documents: property photos uploaded with old admin_only default
--    → mark them client_visible so clients can see property photos
UPDATE documents
SET visibility = 'client_visible',
    can_client_view = true
WHERE category = 'Property Photo'
  AND visibility = 'admin_only'
  AND hidden = false;
