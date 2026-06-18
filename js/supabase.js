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
 * Returns true when the error is most likely caused by a Row Level Security
 * policy denial rather than a network or query error.
 * @param {object} error
 * @returns {boolean}
 */
function isRLSError(error) {
  return error.code === '42501' || /policy|permission|rls/i.test(error.message || '');
}

/**
 * Fetches the signed-in user's profile.
 * If no profile row exists, creates a default client profile for the user.
 * Returns null only when the query fails for reasons other than a missing row
 * (e.g. Row Level Security denies access).
 * @returns {Promise<object|null>}
 */
async function getCurrentUserProfile() {
  const session = await getSession();
  if (!session) return null;

  const { data, error } = await supabaseClient
    .from('profiles')
    .select('id, email, role')
    .eq('id', session.user.id)
    .single();

  // PGRST116 = no rows returned – the user has no profile row yet, so create one.
  if (error && error.code === 'PGRST116') {
    const userEmail = session.user.email || null;
    const { data: created, error: insertError } = await supabaseClient
      .from('profiles')
      .insert([{ id: session.user.id, email: userEmail, role: 'client' }])
      .select('id, email, role')
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
      return null;
    }
    return created;
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
    return null;
  }

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
