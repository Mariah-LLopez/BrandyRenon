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
 * Returns the current session, or null if the user is not signed in.
 * @returns {Promise<import('@supabase/supabase-js').Session|null>}
 */
async function getSession() {
  if (!supabaseClient) return null;
  const { data } = await supabaseClient.auth.getSession();
  return data.session || null;
}

/**
 * Fetches the role ('admin' | 'client') for the signed-in user from the
 * profiles table. Returns null if no session or profile exists.
 * @returns {Promise<string|null>}
 */
async function getCurrentUserRole() {
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single();
  if (error || !data) return null;
  return data.role;
}
