import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { CFG } from "../_lib/config.ts";
import { getCorsHeaders } from "../_lib/cors.ts";

const CGC_BASE_URL = "https://apiserv.cgccomics.com";

interface CGCLoginResponse {
  authToken: string;
}

interface CGCCertificationResponse {
  certNumber: string;
  isValid: boolean;
  grade?: string;
  title?: string;
  issueNumber?: string;
  cardNumber?: string;
  cardName?: string;
  setName?: string;
  seriesName?: string;
  autographGrade?: string;
  label?: string;
  barcode?: string;
  certVerificationUrl?: string;
  keyComments?: string;
  graderSignatures?: string[];
  images?: {
    front?: string;
    rear?: string;
  };
  populationReport?: {
    higherGrades?: number;
    sameGrade?: number;
    totalGraded?: number;
  };
}

async function getCGCAuthToken(): Promise<string> {
  const username = Deno.env.get("CGC_USERNAME");
  const password = Deno.env.get("CGC_PASSWORD");

  if (!username || !password) {
    throw new Error("CGC credentials not configured");
  }

  console.log("[cgc-lookup] Logging into CGC API");

  const response = await fetch(`${CGC_BASE_URL}/users/login/v1`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[cgc-lookup] Login failed: ${response.status} - ${errorText}`);
    throw new Error(`CGC login failed: ${response.status}`);
  }

  const data: CGCLoginResponse = await response.json();
  console.log("[cgc-lookup] Successfully authenticated with CGC API");
  
  return data.authToken;
}

async function lookupCGCCertification(
  certNumber: string,
  collectibleType: "comics" | "cards",
  authToken: string
): Promise<CGCCertificationResponse> {
  const endpoint = `/${collectibleType}/certifications/v3/lookup/${certNumber}?include=pop,images`;
  const url = `${CGC_BASE_URL}${endpoint}`;

  console.log(`[cgc-lookup] Looking up ${collectibleType} cert ${certNumber}`);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      return {
        certNumber,
        isValid: false,
      };
    }
    const errorText = await response.text();
    console.error(`[cgc-lookup] Lookup failed: ${response.status} - ${errorText}`);
    throw new Error(`CGC lookup failed: ${response.status}`);
  }

  const data = await response.json();
  console.log(`[cgc-lookup] Successfully retrieved cert ${certNumber}`);

  // Transform the response to match our interface
  return {
    certNumber,
    isValid: true,
    grade: data.grade || data.numericGrade?.toString(),
    title: data.title || data.seriesName,
    issueNumber: data.issueNumber,
    cardNumber: data.cardNumber,
    cardName: data.cardName,
    setName: data.setName,
    seriesName: data.seriesName,
    autographGrade: data.autographGrade,
    label: data.label,
    barcode: data.barcode,
    certVerificationUrl: data.certVerificationUrl || `https://www.cgccomics.com/certlookup/${certNumber}`,
    keyComments: data.keyComments,
    graderSignatures: data.graderSignatures,
    images: {
      front: data.images?.front || data.frontImage,
      rear: data.images?.rear || data.rearImage,
    },
    populationReport: data.populationReport ? {
      higherGrades: data.populationReport.higherGrades,
      sameGrade: data.populationReport.sameGrade,
      totalGraded: data.populationReport.totalGraded,
    } : undefined,
  };
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { certNumber, collectibleType = "comics" } = await req.json();

    if (!certNumber) {
      return new Response(
        JSON.stringify({ ok: false, error: "Certificate number is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["comics", "cards"].includes(collectibleType)) {
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid collectible type. Must be 'comics' or 'cards'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get auth token
    const authToken = await getCGCAuthToken();

    // Lookup certification
    const data = await lookupCGCCertification(certNumber, collectibleType, authToken);

    return new Response(
      JSON.stringify({ ok: true, data }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[cgc-lookup] Error:", error);
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: error.message || "An error occurred during CGC lookup" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
