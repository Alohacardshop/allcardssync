import { createClient } from "@supabase/supabase-js";

const url = "https://dmpoandoydaqxhzdjnmk.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtcG9hbmRveWRhcXhoemRqbm1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MDU5NDMsImV4cCI6MjA2OTk4MTk0M30.WoHlHO_Z4_ogeO5nt4I29j11aq09RMBtNug8a5rStgk";

if (!url || !key) {
  throw new Error("[supabase:init] Missing SUPABASE_URL or SUPABASE_ANON_KEY");
}

const EXPECTED_HOST = "dmpoandoydaqxhzdjnmk.supabase.co"; // your project
try {
  const u = new URL(url);
  console.info("[supabase:init]", { url: u.href, host: u.host });
  if (u.host !== EXPECTED_HOST) {
    console.warn("[supabase:init] Project host mismatch", { expected: EXPECTED_HOST, got: u.host });
  }
} catch (e) {
  console.error("[supabase:init] Bad URL", { url, e });
}

export const supabase = createClient(url, key, { auth: { persistSession: false } });