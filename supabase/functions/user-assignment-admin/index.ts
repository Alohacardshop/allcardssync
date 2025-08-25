
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase environment not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get the requesting user from the auth header
    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Invalid token");

    // Check if user is admin
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "admin"
    });

    if (!isAdmin) throw new Error("Admin access required");

    const { action, email, storeKey, locationGid, locationName, isDefault } = await req.json();

    if (action === "assign") {
      if (!email || !storeKey || !locationGid) {
        throw new Error("Missing required fields");
      }

      // Find user by email from auth.users (admin only can do this)
      const { data: users, error: userError } = await supabase.auth.admin.listUsers();
      if (userError) throw new Error("Failed to lookup users");

      const targetUser = users.users.find(u => u.email === email);
      if (!targetUser) throw new Error("User not found");

      // If setting as default, unset other defaults for this user/store
      if (isDefault) {
        await supabase
          .from("user_shopify_assignments")
          .update({ is_default: false })
          .eq("user_id", targetUser.id)
          .eq("store_key", storeKey);
      }

      // Insert the assignment
      const { error: insertError } = await supabase
        .from("user_shopify_assignments")
        .upsert({
          user_id: targetUser.id,
          store_key: storeKey,
          location_gid: locationGid,
          location_name: locationName,
          is_default: isDefault
        }, {
          onConflict: "user_id,store_key,location_gid"
        });

      if (insertError) throw insertError;

      return new Response(
        JSON.stringify({ ok: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error("Invalid action");
  } catch (e) {
    console.error("user-assignment-admin error", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
