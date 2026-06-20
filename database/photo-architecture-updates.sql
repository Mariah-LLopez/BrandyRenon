-- -------------------------------------------------------------------------
-- Photo Architecture Migration
-- Removes photo_urls, photo_paths, photo_bucket from the properties table.
-- Photos are now stored exclusively in the documents table with
-- category = 'Property Photo' and bucket_name = 'property-images'.
-- -------------------------------------------------------------------------

-- Migrate existing photo documents: rename category 'Photo' → 'Property Photo'
-- for any document stored in the property-images bucket with a property_id set.
update public.documents
set category = 'Property Photo'
where category = 'Photo'
  and bucket_name = 'property-images'
  and property_id is not null;

-- Drop the photo columns that are no longer used on properties.
alter table public.properties drop column if exists photo_urls;
alter table public.properties drop column if exists photo_paths;
alter table public.properties drop column if exists photo_bucket;
