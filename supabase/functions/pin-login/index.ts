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

const LOCKOUT_MINUTES = 15;
const MAX_ATTEMPTS = 5;

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
    const { displayName, pin } = await req.json();

    if (!displayName || !pin) {
      return new Response(
        JSON.stringify({ ok: false, error: "Name and PIN are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!/^\d{4}$/.test(pin)) {
      return new Response(
        JSON.stringify({ ok: false, error: "PIN must be exactly 4 digits" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`pin-login: Attempt for "${displayName}"`);

    // Find user by display name (case-insensitive)
    const { data: staffPin, error: lookupError } = await supabase
      .from("staff_pins")
      .select("*")
      .ilike("display_name", displayName.trim())
      .single();

    if (lookupError || !staffPin) {
      console.log(`pin-login: No user found for "${displayName}"`);
      // Don't reveal if user exists
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid name or PIN" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check lockout
    if (staffPin.locked_until) {
      const lockedUntil = new Date(staffPin.locked_until);
      if (lockedUntil > new Date()) {
        const minutesLeft = Math.ceil((lockedUntil.getTime() - Date.now()) / 60000);
        console.log(`pin-login: Account locked for ${displayName}, ${minutesLeft}min remaining`);
        return new Response(
          JSON.stringify({
            ok: false,
            error: `Account locked. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? "s" : ""}.`,
            locked: true,
            minutesLeft,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Lockout expired, reset
      await supabase
        .from("staff_pins")
        .update({ failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString() })
        .eq("id", staffPin.id);
      staffPin.failed_attempts = 0;
    }

    // Validate PIN
    const inputHash = await hashPin(pin, staffPin.pin_salt);

    if (inputHash !== staffPin.pin_hash) {
      const newAttempts = (staffPin.failed_attempts || 0) + 1;
      const updates: Record<string, unknown> = {
        failed_attempts: newAttempts,
        updated_at: new Date().toISOString(),
      };

      if (newAttempts >= MAX_ATTEMPTS) {
        updates.locked_until = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString();
        console.log(`pin-login: Account locked for ${displayName} after ${newAttempts} attempts`);
      }

      await supabase.from("staff_pins").update(updates).eq("id", staffPin.id);

      const remaining = MAX_ATTEMPTS - newAttempts;
      return new Response(
        JSON.stringify({
          ok: false,
          error: remaining > 0
            ? `Invalid PIN. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.`
            : `Account locked for ${LOCKOUT_MINUTES} minutes.`,
          locked: newAttempts >= MAX_ATTEMPTS,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // PIN correct — reset failed attempts
    await supabase
      .from("staff_pins")
      .update({ failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString() })
      .eq("id", staffPin.id);

    // Get user email to generate magic link
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(staffPin.user_id);

    if (userError || !userData?.user?.email) {
      console.error("pin-login: Failed to get user", userError);
      return new Response(
        JSON.stringify({ ok: false, error: "Account configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate magic link token for the user
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: userData.user.email,
    });

    if (linkError || !linkData) {
      console.error("pin-login: Failed to generate link", linkError);
      return new Response(
        JSON.stringify({ ok: false, error: "Failed to create session" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`pin-login: Success for ${displayName}`);

    // Extract the token hash from the generated link properties
    const tokenHash = linkData.properties?.hashed_token;
    
    return new Response(
      JSON.stringify({
        ok: true,
        tokenHash,
        email: userData.user.email,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("pin-login error:", message);
    return new Response(
      JSON.stringify({ ok: false, error: "Login failed. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
