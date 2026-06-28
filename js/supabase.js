// Supabase Configuration

const SUPABASE_URL = "https://oqerornvqowighjxmwpb.supabase.co";
const SUPABASE_KEY = "sb_publishable_Qf4FWZTroYmh0yROo3vGdA_PJd7_CBt";
const DEFAULT_USER_TYPE = 'Other';

let supabaseClient;

try {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log("Supabase initialized");
} catch (err) {
  console.error("Supabase initialization failed:", err);
}

function escapeHtml(value) {
  const str = value == null ? '' : String(value);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeFilename(name) {
  const safe = String(name || 'upload')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '_');
  return safe || 'upload';
}

const STORAGE_BUCKETS = Object.freeze({
  PROPERTY_IMAGES: 'property-images',
  CLIENT_DOCUMENTS: 'client-documents',
  MAINTENANCE_FILES: 'maintenance-files',
  ACCOUNT_FILES: 'account-files',
  LEGACY_PROPERTY_DOCUMENTS: 'property-documents'
});

const PUBLIC_STORAGE_BUCKETS = new Set([]);
const PORTAL_ALLOWED_EXTENSIONS = Object.freeze(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png', '.webp']);
const PORTAL_ALLOWED_IMAGE_EXTENSIONS = Object.freeze(['.jpg', '.jpeg', '.png', '.webp']);
const DEFAULT_SIGNED_URL_EXPIRATION = 3600;
const PORTAL_ALLOWED_MIME_TYPES = Object.freeze([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/webp'
]);
const PORTAL_ALLOWED_IMAGE_MIME_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);

window.STORAGE_BUCKETS = STORAGE_BUCKETS;
window.SUPABASE_FILE_RULES = Object.freeze({
  allowedExtensions: PORTAL_ALLOWED_EXTENSIONS,
  allowedImageExtensions: PORTAL_ALLOWED_IMAGE_EXTENSIONS,
  allowedMimeTypes: PORTAL_ALLOWED_MIME_TYPES,
  allowedImageMimeTypes: PORTAL_ALLOWED_IMAGE_MIME_TYPES
});

function getFileExtension(name) {
  const match = String(name || '').toLowerCase().match(/(\.[a-z0-9]+)$/);
  return match ? match[1] : '';
}

function isPublicStorageBucket(bucketName) {
  return PUBLIC_STORAGE_BUCKETS.has(String(bucketName || '').trim());
}

function getSupabaseFileValidationError(file, options) {
  const config = options || {};
  const maxSizeBytes = Number(config.maxSizeBytes) || (10 * 1024 * 1024);
  const maxSizeMb = config.maxSizeMb || Math.round(maxSizeBytes / (1024 * 1024));
  const imagesOnly = Boolean(config.imagesOnly);
  const extensions = imagesOnly ? PORTAL_ALLOWED_IMAGE_EXTENSIONS : PORTAL_ALLOWED_EXTENSIONS;
  const mimeTypes = imagesOnly ? PORTAL_ALLOWED_IMAGE_MIME_TYPES : PORTAL_ALLOWED_MIME_TYPES;
  const allowedLabel = imagesOnly
    ? 'JPG, JPEG, PNG, or WEBP'
    : 'PDF, DOC, DOCX, XLS, XLSX, JPG, JPEG, PNG, or WEBP';
  if (!file) return 'Select a file to upload.';
  if (Number(file.size || 0) > maxSizeBytes) {
    return `File must be under ${maxSizeMb} MB.`;
  }
  const extension = getFileExtension(file.name);
  if (!extensions.includes(extension)) {
    return `Unsupported file type. Allowed types: ${allowedLabel}.`;
  }
  const mimeType = String(file.type || '').trim().toLowerCase();
  if (mimeType && !mimeTypes.includes(mimeType)) {
    return `Unsupported file type. Allowed types: ${allowedLabel}.`;
  }
  return '';
}

async function getSupabaseStorageUrl(bucketName, filePath, options) {
  if (!bucketName || !filePath) return null;
  const expiresIn = Number(options?.expiresIn) > 0 ? Number(options.expiresIn) : DEFAULT_SIGNED_URL_EXPIRATION;
  if (isPublicStorageBucket(bucketName)) {
    const { data } = supabaseClient.storage.from(bucketName).getPublicUrl(filePath);
    return data?.publicUrl || null;
  }
  const { data, error } = await supabaseClient.storage.from(bucketName).createSignedUrl(filePath, expiresIn);
  if (error) throw error;
  return data?.signedUrl || null;
}

async function getSession() {
  if (!supabaseClient) return null;
  const { data } = await supabaseClient.auth.getSession();
  return data.session || null;
}

function isRLSError(error) {
  return error.code === '42501' || /policy|permission|rls/i.test(error.message || '');
}

async function getCurrentUserProfile(options) {
  const includeError = Boolean(options?.includeError);
  const session = await getSession();
  if (!session) return includeError ? { profile: null, error: null } : null;
  const user = session.user;

  const { data: profile, error } = await supabaseClient
    .from('profiles')
    .select('id, email, full_name, phone, role, status, user_type, created_at')
    .eq('id', user.id)
    .single();

  if (error && error.code === 'PGRST116') {
    const userEmail = session.user.email || null;
    const fullName = session.user.user_metadata?.full_name || null;
    const { data: created, error: insertError } = await supabaseClient
      .from('profiles')
      .insert([{ id: session.user.id, email: userEmail, full_name: fullName, role: 'client', status: 'active', user_type: DEFAULT_USER_TYPE }])
      .select('id, email, full_name, role, status, user_type')
      .single();

    if (insertError) {
      if (isRLSError(insertError)) {
        console.error(
          'Row Level Security is blocking profile creation. ' +
          'Ensure authenticated users have an INSERT policy on the profiles table ' +
          'that allows them to create their own row (e.g. WITH CHECK (id = auth.uid())). ' +
          'RLS error details:',
          insertError
        );
      } else {
        console.error('Failed to create missing profile row:', insertError);
      }
      return includeError ? { profile: null, error: insertError } : null;
    }
    return includeError ? { profile: created, error: null } : created;
  }

  if (error) {
    if (isRLSError(error)) {
      console.error(
        'Row Level Security is blocking profile access. ' +
        'Ensure authenticated users have a SELECT policy on the profiles table ' +
        'that allows them to read their own row (e.g. USING (id = auth.uid())). ' +
        'RLS error details:',
        error
      );
    } else {
      console.error('Profile query error:', error);
    }
    return includeError ? { profile: null, error } : null;
  }

  return includeError ? { profile, error: null } : profile;
}

async function getCurrentUserRole() {
  const profile = await getCurrentUserProfile();
  return profile ? profile.role : null;
}

function formatSupabaseSchemaError(error) {
  const message = error?.message || 'Unknown error';
  if (/column .* does not exist/i.test(message)) return `Missing column: ${message}`;
  if (/relation .* does not exist/i.test(message)) return `Missing table: ${message}`;
  return message;
}

async function notifySubmission(payload) {
  if (!supabaseClient || !payload) return { ok: false, skipped: true };
  try {
    const { data, error } = await supabaseClient.functions.invoke('notify-submission', { body: payload });
    if (error) {
      console.warn('notify-submission failed:', error.message || error);
      return { ok: false, error };
    }
    return { ok: true, data };
  } catch (error) {
    console.warn('notify-submission exception:', error);
    return { ok: false, error };
  }
}
