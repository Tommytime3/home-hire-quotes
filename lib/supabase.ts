import { createClient } from "@supabase/supabase-js";

// Publishable key: safe to be public. Access is controlled by row level security in the database.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://lfxvfwnsustdqlfzngql.supabase.co";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_Mf_su0ykAVHnHbm3f7LbhQ_rZIBd1JJ";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Which contractor this capture link belongs to (Comfort Air = contractor #1).
// Later each contractor gets their own link: /?c=<contractor id>
export const DEFAULT_CONTRACTOR_ID =
  process.env.NEXT_PUBLIC_CONTRACTOR_ID || "82a380f9-18a5-4e4f-8838-d59623654672";
