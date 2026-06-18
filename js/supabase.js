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