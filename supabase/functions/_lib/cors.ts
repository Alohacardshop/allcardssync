// CORS headers with configurable origins
import { CFG } from "./config.ts";

/**
 * Get allowed origins from config (CSV format)
 */
function getAllowedOrigins(): Set<string> {
  const origins = (CFG.ALLOWED_ORIGINS || "").split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  
  return new Set(origins);
}

const allowedOrigins = getAllowedOrigins();

/**
 * CORS headers for responses
 */
export const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigins.size > 0 
    ? Array.from(allowedOrigins)[0] // Use first origin for simplicity
    : "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Check if origin is allowed
 */
export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return true; // Allow requests without origin (e.g., curl)
  if (allowedOrigins.size === 0) return true; // If no restrictions, allow all
  return allowedOrigins.has(origin);
}

/**
 * Get CORS headers for specific origin
 */
export function getCorsHeaders(origin: string | null): Record<string, string> {
  if (allowedOrigins.size === 0) {
    return corsHeaders;
  }

  return {
    ...corsHeaders,
    "Access-Control-Allow-Origin": isOriginAllowed(origin) ? (origin || "*") : "null",
  };
}
