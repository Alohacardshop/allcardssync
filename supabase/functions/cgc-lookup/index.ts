import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders } from "../_lib/cors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";

const CGC_API_BASE = "https://dealer-api.collectiblesgroup.com";

interface CGCLoginResponse {
  authToken: string;
}

interface CGCCertificationResponse {
  certNumber: string;
  isValid: boolean;
  grade?: string;
  title?: string;
  issueNumber?: string;
  publisher?: string;
  seriesName?: string;
  label?: string;
  barcode?: string;
  certVerificationUrl?: string;
  keyComments?: string;
  images?: {
    front?: string;
    rear?: string;
  };
}

async function getCGCAuthToken(): Promise<string> {
  const username = Deno.env.get("CGC_USERNAME");
  const password = Deno.env.get("CGC_PASSWORD");

  if (!username || !password) {
    throw new Error("CGC credentials not configured");
  }

  console.log("[cgc-lookup] Logging into CGC Dealer API");

  const response = await fetch(`${CGC_API_BASE}/auth/login/CGC`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ 
      Username: username, 
      Password: password 
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[cgc-lookup] Login failed: ${response.status} - ${errorText}`);
    throw new Error(`CGC login failed: ${response.status}`);
  }

  // Response is JWT token as plain string
  const token = await response.text();
  console.log("[cgc-lookup] Successfully authenticated with CGC Dealer API");
  
  return token.replace(/^"|"$/g, ''); // Remove quotes if present
}

async function lookupCGCCertification(
  certNumber: string,
  authToken: string
): Promise<CGCCertificationResponse> {
  const url = `${CGC_API_BASE}/comics/certifications/v3/lookup/${certNumber}?include=pop,images`;

  console.log(`[cgc-lookup] Looking up comics cert ${certNumber}`);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      console.log(`[cgc-lookup] Certificate ${certNumber} not found`);
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
  console.log(`[cgc-lookup] Successfully retrieved cert ${certNumber}:`, JSON.stringify(data, null, 2));

  // Transform the response to match our interface
  // The API returns grade as an object with displayGrade, we need just the string
  const gradeValue = typeof data.grade === 'object' 
    ? (data.grade?.displayGrade || data.grade?.grade) 
    : data.grade;

  // Extract arrays from additionalInfo
  const keyComments = Array.isArray(data.additionalInfo?.keyComments)
    ? data.additionalInfo.keyComments
    : (data.keyComments ? [data.keyComments] : undefined);

  const artComments = Array.isArray(data.additionalInfo?.artComments)
    ? data.additionalInfo.artComments
    : (data.additionalInfo?.artComments ? [data.additionalInfo.artComments] : undefined);

  const graderNotes = Array.isArray(data.additionalInfo?.graderNotes)
    ? data.additionalInfo.graderNotes
    : (data.additionalInfo?.graderNotes ? [data.additionalInfo.graderNotes] : undefined);

  return {
    certNumber,
    isValid: true,
    grade: gradeValue?.toString(),
    title: data.collectible?.title || data.title,
    issueNumber: data.collectible?.issue || data.issueNumber,
    issueDate: data.collectible?.issueDate,
    year: data.collectible?.year,
    publisher: data.collectible?.publisher || data.publisher,
    seriesName: data.seriesName,
    label: data.additionalInfo?.labelCategory || data.label,
    barcode: data.metadata?.barcode || data.barcode,
    certVerificationUrl: data.certVerificationUrl || `https://www.cgccomics.com/certlookup/${certNumber}`,
    pageQuality: data.additionalInfo?.pageQuality,
    artComments,
    keyComments,
    graderNotes,
    gradeDate: data.metadata?.gradedDate,
    images: {
      front: data.images?.frontUrl || data.images?.front || data.frontImage,
      rear: data.images?.rearUrl || data.images?.rear || data.rearImage,
    },
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
    // Authenticate user and require staff/admin role
    const user = await requireAuth(req);
    await requireRole(user.id, ['admin', 'staff']);

    const { certNumber } = await req.json();

    if (!certNumber) {
      return new Response(
        JSON.stringify({ ok: false, error: "Certificate number is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get auth token
    const authToken = await getCGCAuthToken();

    // Lookup certification
    const data = await lookupCGCCertification(certNumber, authToken);

    return new Response(
      JSON.stringify({ ok: true, data }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[cgc-lookup] Error:", error);
    
    // Handle authentication errors
    if (error.message?.includes('Authorization') || error.message?.includes('authentication') || error.message?.includes('permissions')) {
      return new Response(
        JSON.stringify({ ok: false, error: error.message }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: error.message || "An error occurred during CGC lookup" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
