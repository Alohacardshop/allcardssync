// Frontend configuration with validation
import { z } from "zod";

const EnvSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  VITE_SUPABASE_PROJECT_ID: z.string().min(1),
});

function loadEnv() {
  const raw = {
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    VITE_SUPABASE_PROJECT_ID: import.meta.env.VITE_SUPABASE_PROJECT_ID,
  };

  const result = EnvSchema.safeParse(raw);

  if (!result.success) {
    const errorDetails = result.error.flatten().fieldErrors;
    console.error("❌ Invalid environment configuration:", errorDetails);
    throw new Error("Invalid environment configuration. Check .env file.");
  }

  return result.data;
}

export const ENV = loadEnv();

// Helper to get Supabase Functions URL
export const FUNCTIONS_URL = `${ENV.VITE_SUPABASE_URL}/functions/v1`;
