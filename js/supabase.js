// Supabase Configuration

const SUPABASE_URL = "https://oqerornvqowighjxmwpb.supabase.co";
const SUPABASE_KEY = "sb_publishable_Qf4FWZTroYmh0yROo3vGdA_PJd7_CBt";

let supabaseClient;

try {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log("Supabase initialized");
} catch (err) {
  console.error("Supabase initialization failed:", err);
}

/**
 * Escapes HTML special characters to prevent XSS when inserting
 * user-supplied content via innerHTML.
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtml(value) {
  const str = value == null ? '' : String(value);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sanitizes a filename for use in a storage path.
 * Strips all characters except alphanumerics, dots, dashes, and underscores.
 * Prevents path traversal by rejecting any remaining directory separators.
 * @param {string} name
 * @returns {string}
 */
function sanitizeFilename(name) {
  const safe = String(name || 'upload')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '_');
  return safe || 'upload';
}

async function getSession() {
  if (!supabaseClient) return null;
  const { data } = await supabaseClient.auth.getSession();
  return data.session || null;
}

/**
 * Fetches the signed-in user's profile.
 * @returns {Promise<object|null>}
 */
async function getCurrentUserProfile() {
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('id, email, full_name, role, status, phone, created_at')
    .eq('id', session.user.id)
    .single();
  if (error || !data) return null;
  return data;
}

/**
 * Fetches the role ('admin' | 'client') for the signed-in user from the
 * profiles table. Returns null if no session or profile exists.
 * @returns {Promise<string|null>}
 */
async function getCurrentUserRole() {
  const profile = await getCurrentUserProfile();
  return profile ? profile.role : null;
}
