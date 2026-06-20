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
