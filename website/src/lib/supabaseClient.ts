import { createClient } from "@supabase/supabase-js";

// Read at build time from Vite env vars — never hardcoded. See README.md
// for why the anon key is safe to ship in the built client bundle (it is
// not a secret; Row Level Security in supabase/migrations is what
// actually restricts access, not hiding this key).
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set at build time " +
      "(see website/.env.example) — the app cannot talk to Supabase without them.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
