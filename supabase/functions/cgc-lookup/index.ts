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

  // Try multiple approaches to get the data
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Cache-Control": "max-age=0"
  };

  const response = await fetch(url, {
    method: "GET",
    headers,
    redirect: "follow"
  });

  console.log(`[cgc-lookup] Response status: ${response.status}`);

  if (!response.ok) {
    console.error(`[cgc-lookup] Lookup failed: ${response.status}`);
    
    // If we get a 403, return a helpful message
    if (response.status === 403) {
      console.log(`[cgc-lookup] CGC website blocked the request. Certificate may exist but cannot be verified automatically.`);
      return {
        certNumber,
        isValid: false,
      };
    }
    
    return {
      certNumber,
      isValid: false,
    };
  }

  const html = await response.text();
  console.log(`[cgc-lookup] Received HTML length: ${html.length}`);
  
  // Check if certificate was not found
  if (html.includes("Certificate Not Found") || 
      html.includes("not found") || 
      html.includes("No results found") ||
      html.length < 500) { // Very short response likely means not found
    console.log(`[cgc-lookup] Certificate ${certNumber} not found or page blocked`);
    return {
      certNumber,
      isValid: false,
    };
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  
  if (!doc) {
    throw new Error("Failed to parse CGC page");
  }

  console.log(`[cgc-lookup] Successfully parsed HTML for cert ${certNumber}`);

  // Extract data from the page - CGC uses various class names
  const grade = extractTextContent(doc, ".grade-value") || 
                extractTextContent(doc, ".cert-grade") ||
                extractTextContent(doc, ".grade") ||
                extractTextContent(doc, "[class*='grade']");
  
  const title = extractTextContent(doc, ".cert-title") ||
                extractTextContent(doc, ".series-name") ||
                extractTextContent(doc, ".title") ||
                extractTextContent(doc, "h1") ||
                extractTextContent(doc, "h2");
  
  const issueNumber = extractTextContent(doc, ".issue-number") ||
                      extractTextContent(doc, ".issue") ||
                      extractTextContent(doc, "[class*='issue']");
  
  const label = extractTextContent(doc, ".label-type") ||
                extractTextContent(doc, ".label") ||
                extractTextContent(doc, "[class*='label']");
  
  const keyComments = extractTextContent(doc, ".key-comments") ||
                     extractTextContent(doc, ".pedigree-name") ||
                     extractTextContent(doc, ".comments") ||
                     extractTextContent(doc, "[class*='comments']");

  // Extract images
  const frontImage = extractImageUrl(doc, ".cert-image-front") ||
                     extractImageUrl(doc, ".front-image") ||
                     extractImageUrl(doc, ".cert-front") ||
                     extractImageUrl(doc, "img[alt*='front']") ||
                     extractImageUrl(doc, ".cert-image img") ||
                     extractImageUrl(doc, "img[src*='cert']");
  
  const rearImage = extractImageUrl(doc, ".cert-image-back") ||
                    extractImageUrl(doc, ".back-image") ||
                    extractImageUrl(doc, ".cert-back") ||
                    extractImageUrl(doc, "img[alt*='back']");

  console.log(`[cgc-lookup] Extracted data - grade: ${grade}, title: ${title}, issue: ${issueNumber}`);

  // If we got at least some data, consider it valid
  const hasData = !!(grade || title || frontImage);

  return {
    certNumber,
    isValid: hasData,
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
