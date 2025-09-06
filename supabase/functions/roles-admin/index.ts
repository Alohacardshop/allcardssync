import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ ok: false, error: "Missing Authorization header" }), { status: 401, headers: jsonHeaders });

    // Caller client (to identify and authorize the request)
    const caller = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    // Service client (full privileges for admin operations)
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Identify caller
    const { data: userRes, error: userErr } = await caller.auth.getUser();
    if (userErr || !userRes?.user) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
    }
    const callerUser = userRes.user;

    // Check admin role for caller
    const { data: callerRoles, error: callerRolesErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerUser.id)
      .eq("role", "admin");

    if (callerRolesErr) throw callerRolesErr;
    const isAdmin = (callerRoles || []).length > 0;
    if (!isAdmin) {
      return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), { status: 403, headers: jsonHeaders });
    }

    const body = (await req.json().catch(() => ({}))) as any;
    const action = body?.action as string;

    if (action === "list") {
      console.log("Starting list action");
      
      // List users with their roles
      console.log("Fetching users from auth admin");
      const usersResp = await admin.auth.admin.listUsers({ page: 1, perPage: 200 }).catch((e: any) => {
        console.error("Error fetching users:", e);
        return { data: null, error: e };
      });
      
      // @ts-ignore - shape from GoTrue Admin API
      const users = (usersResp?.data?.users || []) as Array<{ id: string; email?: string | null; created_at?: string }>; 
      console.log("Users fetched:", users.length);

      console.log("Fetching user roles");
      const { data: roles, error: rolesErr } = await admin
        .from("user_roles")
        .select("user_id, role");
      if (rolesErr) {
        console.error("Error fetching roles:", rolesErr);
        throw rolesErr;
      }
      console.log("Roles fetched:", roles?.length || 0);

      const rolesMap = new Map<string, string[]>();
      (roles || []).forEach((r: any) => {
        const arr = rolesMap.get(r.user_id) || [];
        if (!arr.includes(r.role)) arr.push(r.role);
        rolesMap.set(r.user_id, arr);
      });

      const result = users.map((u) => ({ id: u.id, email: u.email || null, created_at: u.created_at, roles: rolesMap.get(u.id) || [] }));
      console.log("Returning result with users:", result.length);
      return new Response(JSON.stringify({ ok: true, users: result }), { headers: jsonHeaders });
    }

    if (action === "grant") {
      const email = String(body?.email || "").toLowerCase();
      const role = String(body?.role || "").toLowerCase();
      if (!email || !role) return new Response(JSON.stringify({ ok: false, error: "Missing email or role" }), { status: 400, headers: jsonHeaders });

      // Find user by email (iterate pages naive)
      const usersResp = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      // @ts-ignore
      const user = (usersResp?.data?.users || []).find((u: any) => (u.email || "").toLowerCase() === email);
      if (!user) return new Response(JSON.stringify({ ok: false, error: "User not found" }), { status: 404, headers: jsonHeaders });

      const { error: insErr } = await admin.from("user_roles").insert({ user_id: user.id, role });
      if (insErr && !String(insErr.message || "").includes("duplicate")) throw insErr;

      return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders });
    }

    if (action === "revoke") {
      const email = String(body?.email || "").toLowerCase();
      const role = String(body?.role || "").toLowerCase();
      if (!email || !role) return new Response(JSON.stringify({ ok: false, error: "Missing email or role" }), { status: 400, headers: jsonHeaders });

      const usersResp = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      // @ts-ignore
      const user = (usersResp?.data?.users || []).find((u: any) => (u.email || "").toLowerCase() === email);
      if (!user) return new Response(JSON.stringify({ ok: false, error: "User not found" }), { status: 404, headers: jsonHeaders });

      const { error: delErr } = await admin.from("user_roles").delete().match({ user_id: user.id, role });
      if (delErr) throw delErr;

      return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders });
    }

    if (action === "delete") {
      const email = String(body?.email || "").toLowerCase();
      if (!email) return new Response(JSON.stringify({ ok: false, error: "Missing email" }), { status: 400, headers: jsonHeaders });

      // Find user by email
      const usersResp = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      // @ts-ignore
      const user = (usersResp?.data?.users || []).find((u: any) => (u.email || "").toLowerCase() === email);
      if (!user) return new Response(JSON.stringify({ ok: false, error: "User not found" }), { status: 404, headers: jsonHeaders });

      // Prevent self-deletion
      if (user.id === callerUser.id) {
        return new Response(JSON.stringify({ ok: false, error: "Cannot delete yourself" }), { status: 400, headers: jsonHeaders });
      }

      // Check if this is the last admin
      const { data: adminRoles, error: adminRolesErr } = await admin
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      
      if (adminRolesErr) throw adminRolesErr;
      
      const isTargetAdmin = adminRoles?.some(r => r.user_id === user.id);
      const adminCount = adminRoles?.length || 0;
      
      if (isTargetAdmin && adminCount <= 1) {
        return new Response(JSON.stringify({ ok: false, error: "Cannot delete the last admin user" }), { status: 400, headers: jsonHeaders });
      }

      // Delete related records first
      const { error: rolesDelErr } = await admin.from("user_roles").delete().eq("user_id", user.id);
      if (rolesDelErr) throw rolesDelErr;

      const { error: assignmentsDelErr } = await admin.from("user_shopify_assignments").delete().eq("user_id", user.id);
      if (assignmentsDelErr) throw assignmentsDelErr;

      // Delete the user
      const { error: userDelErr } = await admin.auth.admin.deleteUser(user.id);
      if (userDelErr) throw userDelErr;

      return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders });
    }

    return new Response(JSON.stringify({ ok: false, error: "Unknown action" }), { status: 400, headers: jsonHeaders });
  } catch (e) {
    console.error("roles-admin error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: jsonHeaders });
  }
});
