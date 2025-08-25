import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ ok: false, error: "Missing Authorization header" }), { status: 401, headers: jsonHeaders });
    }

    // Authenticated client (to identify caller)
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    // Admin client (to bypass RLS for role assignment)
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
    }

    const user = userData.user;

    // If already admin, return ok
    const { data: alreadyAdmin, error: alreadyErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!alreadyErr && alreadyAdmin) {
      return new Response(JSON.stringify({ ok: true, role: "admin", reason: "already-admin" }), { headers: jsonHeaders });
    }

    // Check if any admin exists
    const { count: adminCount, error: countErr } = await admin
      .from("user_roles")
      .select("id", { head: true, count: "exact" })
      .eq("role", "admin");

    if (countErr) throw countErr;

    // Allow bootstrap if no admin exists, or if caller email matches the primary admin address
    const primaryAdminEmail = "admin@alohacardshop.com";
    const allowBootstrap = (adminCount || 0) === 0 || (user.email?.toLowerCase() === primaryAdminEmail);

    if (!allowBootstrap) {
      return new Response(JSON.stringify({ ok: false, error: "Not allowed" }), { status: 403, headers: jsonHeaders });
    }

    const { error: insertErr } = await admin.from("user_roles").insert({ user_id: user.id, role: "admin" });
    if (insertErr) throw insertErr;

    return new Response(JSON.stringify({ ok: true, role: "admin" }), { headers: jsonHeaders });
  } catch (e) {
    console.error("bootstrap-admin error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: jsonHeaders });
  }
});
