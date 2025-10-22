import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.43/deno-dom-wasm.ts";
import { getCorsHeaders } from "../_lib/cors.ts";

const CGC_CERT_LOOKUP_URL = "https://www.cgccomics.com/certlookup";

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

function extractTextContent(element: any, selector: string): string | null {
  try {
    const el = element.querySelector(selector);
    return el?.textContent?.trim() || null;
  } catch {
    return null;
  }
}

function extractImageUrl(element: any, selector: string): string | null {
  try {
    const el = element.querySelector(selector);
    const src = el?.getAttribute('src');
    if (src && src.startsWith('/')) {
      return `https://www.cgccomics.com${src}`;
    }
    return src || null;
  } catch {
    return null;
  }
}

async function lookupCGCCertification(
  certNumber: string
): Promise<CGCCertificationResponse> {
  const url = `${CGC_CERT_LOOKUP_URL}/${certNumber}/`;

  console.log(`[cgc-lookup] Looking up CGC cert ${certNumber} from public page`);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  if (!response.ok) {
    console.error(`[cgc-lookup] Lookup failed: ${response.status}`);
    return {
      certNumber,
      isValid: false,
    };
  }

  const html = await response.text();
  
  // Check if certificate was not found
  if (html.includes("Certificate Not Found") || html.includes("not found")) {
    console.log(`[cgc-lookup] Certificate ${certNumber} not found`);
    return {
      certNumber,
      isValid: false,
    };
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  
  if (!doc) {
    throw new Error("Failed to parse CGC page");
  }

  console.log(`[cgc-lookup] Successfully retrieved cert ${certNumber}`);

  // Extract data from the page
  const grade = extractTextContent(doc, ".grade-value") || 
                extractTextContent(doc, ".cert-grade") ||
                extractTextContent(doc, "[class*='grade']");
  
  const title = extractTextContent(doc, ".cert-title") ||
                extractTextContent(doc, ".series-name") ||
                extractTextContent(doc, "h1");
  
  const issueNumber = extractTextContent(doc, ".issue-number") ||
                      extractTextContent(doc, "[class*='issue']");
  
  const label = extractTextContent(doc, ".label-type") ||
                extractTextContent(doc, "[class*='label']");
  
  const keyComments = extractTextContent(doc, ".key-comments") ||
                     extractTextContent(doc, ".pedigree-name") ||
                     extractTextContent(doc, "[class*='comments']");

  // Extract images
  const frontImage = extractImageUrl(doc, ".cert-image-front") ||
                     extractImageUrl(doc, ".front-image") ||
                     extractImageUrl(doc, "img[alt*='front']") ||
                     extractImageUrl(doc, ".cert-image img");
  
  const rearImage = extractImageUrl(doc, ".cert-image-back") ||
                    extractImageUrl(doc, ".back-image") ||
                    extractImageUrl(doc, "img[alt*='back']");

  return {
    certNumber,
    isValid: true,
    grade,
    title,
    issueNumber,
    label,
    certVerificationUrl: url,
    keyComments,
    images: {
      front: frontImage,
      rear: rearImage,
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
    const { certNumber } = await req.json();

    if (!certNumber) {
      return new Response(
        JSON.stringify({ ok: false, error: "Certificate number is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Lookup certification from public page
    const data = await lookupCGCCertification(certNumber);

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
