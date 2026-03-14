import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function hashPin(pin: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + salt);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ ok: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ ok: false, error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, userId, displayName, pin } = await req.json();

    if (action === "set-pin") {
      // Set or update PIN for a user
      if (!userId || !displayName || !pin) {
        return new Response(
          JSON.stringify({ ok: false, error: "userId, displayName, and pin are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!/^\d{4}$/.test(pin)) {
        return new Response(
          JSON.stringify({ ok: false, error: "PIN must be exactly 4 digits" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check display name uniqueness (excluding this user)
      const { data: existing } = await supabase
        .from("staff_pins")
        .select("id, user_id")
        .ilike("display_name", displayName.trim())
        .neq("user_id", userId)
        .maybeSingle();

      if (existing) {
        return new Response(
          JSON.stringify({ ok: false, error: "Display name already in use by another user" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const salt = generateSalt();
      const pinHash = await hashPin(pin, salt);

      const { error: upsertError } = await supabase
        .from("staff_pins")
        .upsert(
          {
            user_id: userId,
            display_name: displayName.trim(),
            pin_hash: pinHash,
            pin_salt: salt,
            failed_attempts: 0,
            locked_until: null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

      if (upsertError) {
        console.error("manage-staff-pin: Upsert error", upsertError);
        return new Response(
          JSON.stringify({ ok: false, error: "Failed to save PIN" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`manage-staff-pin: PIN set for user ${userId} (${displayName})`);
      return new Response(
        JSON.stringify({ ok: true, message: "PIN saved successfully" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "reset-pin") {
      // Reset PIN and clear lockout
      if (!userId || !pin) {
        return new Response(
          JSON.stringify({ ok: false, error: "userId and new pin are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!/^\d{4}$/.test(pin)) {
        return new Response(
          JSON.stringify({ ok: false, error: "PIN must be exactly 4 digits" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const salt = generateSalt();
      const pinHash = await hashPin(pin, salt);

      const { error: updateError } = await supabase
        .from("staff_pins")
        .update({
          pin_hash: pinHash,
          pin_salt: salt,
          failed_attempts: 0,
          locked_until: null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      if (updateError) {
        console.error("manage-staff-pin: Reset error", updateError);
        return new Response(
          JSON.stringify({ ok: false, error: "Failed to reset PIN" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`manage-staff-pin: PIN reset for user ${userId}`);
      return new Response(
        JSON.stringify({ ok: true, message: "PIN reset successfully" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "unlock") {
      if (!userId) {
        return new Response(
          JSON.stringify({ ok: false, error: "userId is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: unlockError } = await supabase
        .from("staff_pins")
        .update({
          failed_attempts: 0,
          locked_until: null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      if (unlockError) {
        console.error("manage-staff-pin: Unlock error", unlockError);
        return new Response(
          JSON.stringify({ ok: false, error: "Failed to unlock" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`manage-staff-pin: Unlocked user ${userId}`);
      return new Response(
        JSON.stringify({ ok: true, message: "Account unlocked" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: false, error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("manage-staff-pin error:", message);
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
