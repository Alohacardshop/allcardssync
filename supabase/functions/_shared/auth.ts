import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface AuthenticatedUser {
  id: string
  email?: string
  role: string
}

/**
 * Validates JWT token and returns authenticated user
 * @throws Error if authentication fails
 */
export async function requireAuth(req: Request): Promise<AuthenticatedUser> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    throw new Error('Missing Authorization header')
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } }
  })

  const { data: { user }, error } = await authClient.auth.getUser()
  
  if (error || !user) {
    throw new Error('Invalid authentication token')
  }

  return {
    id: user.id,
    email: user.email,
    role: 'user' // Default role, will be checked separately
  }
}

/**
 * Checks if user has required role (admin or staff)
 * @throws Error if user lacks required permissions
 */
export async function requireRole(userId: string, requiredRoles: string[] = ['admin', 'staff']) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  
  const serviceClient = createClient(supabaseUrl, supabaseServiceKey)
  
  const { data: roles, error } = await serviceClient
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
  
  if (error) {
    throw new Error(`Failed to fetch user roles: ${error.message}`)
  }

  const userRoles = roles?.map(r => r.role) || []
  const hasRequiredRole = userRoles.some(role => requiredRoles.includes(role))
  
  if (!hasRequiredRole) {
    throw new Error(`Insufficient permissions. Required roles: ${requiredRoles.join(', ')}`)
  }
}

/**
 * Verifies user has access to specific store/location
 * @throws Error if user lacks access
 */
export async function requireStoreAccess(userId: string, storeKey: string, locationGid: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  
  const serviceClient = createClient(supabaseUrl, supabaseServiceKey)
  
  // Check if user is admin (admins have access to all stores)
  const { data: roles } = await serviceClient
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
  
  const isAdmin = roles?.some(r => r.role === 'admin')
  if (isAdmin) {
    return // Admins have access to everything
  }

  // Check user_shopify_assignments for non-admin users
  const { data: canAccess, error } = await serviceClient
    .rpc('user_can_access_store_location', {
      _user_id: userId,
      _store_key: storeKey,
      _location_gid: locationGid
    })

  if (error || !canAccess) {
    throw new Error(`Access denied for store: ${storeKey}, location: ${locationGid}`)
  }
}
