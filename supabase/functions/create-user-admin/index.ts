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

    const { email, password, roles, storeAssignments, sendInvite } = await req.json();

    if (!email) {
      throw new Error("Email is required");
    }

    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
      console.error("Error checking existing users:", listError);
      // Continue anyway - let the create operation handle duplicates
    }
    
    const existingUser = existingUsers?.users?.find((u: any) => u.email?.toLowerCase() === normalizedEmail);
    if (existingUser) {
      throw new Error("User with this email already exists");
    }

    // Create the user
    const createUserOptions: any = {
      email: normalizedEmail,
      email_confirm: !sendInvite, // Auto-confirm if not sending invite
    };

    if (password && !sendInvite) {
      createUserOptions.password = password;
    }

    if (sendInvite) {
      createUserOptions.password = Math.random().toString(36).slice(-12) + "Aa1!"; // Temp password
    }

    const { data: newUser, error: createError } = await supabase.auth.admin.createUser(createUserOptions);

    if (createError) {
      console.error("User creation error:", createError);
      throw new Error(`Failed to create user: ${createError.message}`);
    }

    if (!newUser.user) {
      throw new Error("User creation failed - no user returned");
    }

    const userId = newUser.user.id;

    // Assign roles if provided
    if (roles && roles.length > 0) {
      const roleInserts = roles.map((role: string) => ({
        user_id: userId,
        role: role
      }));

      const { error: roleError } = await supabase
        .from("user_roles")
        .insert(roleInserts);

      if (roleError) {
        console.error("Role assignment error:", roleError);
        // Don't fail the whole operation, just log the error
      }
    }

    // Assign store locations if provided
    if (storeAssignments && storeAssignments.length > 0) {
      const assignmentInserts = storeAssignments.map((assignment: any) => ({
        user_id: userId,
        store_key: assignment.storeKey,
        location_gid: assignment.locationGid,
        location_name: assignment.locationName,
        is_default: assignment.isDefault || false
      }));

      const { error: assignmentError } = await supabase
        .from("user_shopify_assignments")
        .insert(assignmentInserts);

      if (assignmentError) {
        console.error("Store assignment error:", assignmentError);
        // Don't fail the whole operation, just log the error
      }
    }

    // Send invite email if requested
    if (sendInvite) {
      const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(normalizedEmail);
      if (inviteError) {
        console.error("Invite email error:", inviteError);
        // Don't fail the whole operation, just log the error
      }
    }

    return new Response(
      JSON.stringify({ 
        ok: true, 
        user: {
          id: userId,
          email: normalizedEmail,
          created_at: newUser.user.created_at
        },
        inviteSent: sendInvite
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e) {
    console.error("create-user-admin error", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});