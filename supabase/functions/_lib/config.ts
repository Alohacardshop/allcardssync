// Typed configuration for edge functions with validation
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const ConfigSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SUPABASE_ANON_KEY: z.string().min(20),
  JUSTTCG_API_KEY: z.string().optional(),
  PSA_PUBLIC_API_TOKEN: z.string().optional(),
  ALLOWED_ORIGINS: z.string().optional(), // CSV of allowed origins
});

function loadConfig() {
  const raw = {
    SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    SUPABASE_ANON_KEY: Deno.env.get("SUPABASE_ANON_KEY"),
    JUSTTCG_API_KEY: Deno.env.get("JUSTTCG_API_KEY"),
    PSA_PUBLIC_API_TOKEN: Deno.env.get("PSA_PUBLIC_API_TOKEN"),
    ALLOWED_ORIGINS: Deno.env.get("ALLOWED_ORIGINS"),
  };

  const result = ConfigSchema.safeParse(raw);
  
  if (!result.success) {
    console.error("❌ Invalid configuration:", result.error.flatten().fieldErrors);
    throw new Error("Invalid environment configuration. Check logs for details.");
  }

  return result.data;
}

export const CFG = loadConfig();
