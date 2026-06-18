const SUPABASE_URL = "https://oqerornvqowighjxmwpb.supabase.co";

const SUPABASE_KEY = "sb_publishable_Qf4FWZTroYmh0yROo3vGdA_PJd7_CBt";

const supabaseClient = supabase.createClient(
SUPABASE_URL,
SUPABASE_KEY
);

console.log("Supabase initialized");
