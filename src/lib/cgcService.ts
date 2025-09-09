import { supabase } from "@/integrations/supabase/client";

export type NormalizedCGCCard = {
  gradingCompany: "CGC";
  certNumber: string;
  barcode?: string | null;
  grade: {
    display: string | null;
    autographGrade?: string | null;
    autographType?: string | null;
    numeric?: number | null;
  };
  collectible: {
    cardName?: string | null;
    cardNumber?: string | null;
    cardYear?: string | null;
    game?: string | null;
    seriesName?: string | null;
    setName?: string | null;
    subsetName?: string | null;
    makerName?: string | null;
    language?: string | null;
    rarity?: string | null;
    variant1?: string | null;
    variant2?: string | null;
    isParallel?: boolean | null;
  };
  metadata: {
    encapsulationDate?: string | null;
    gradedDate?: string | null;
    submissionNumber?: string | null;
    barcode?: string | null;
  };
  additionalInfo?: {
    pedigree?: string | null;
    errorType?: string | null;
    graderNotes?: unknown[];
    signatures?: unknown[];
  };
  images?: {
    frontUrl?: string | null;
    frontThumbnailUrl?: string | null;
    rearUrl?: string | null;
    rearThumbnailUrl?: string | null;
  };
  population?: Record<string, number> | null;
  raw: unknown;
};

export async function invokeCGCLookup(
  params: { certNumber?: string; barcode?: string; include?: string },
  timeoutMs = 12000  // Reduced timeout for faster debugging
): Promise<{ ok: boolean; data?: NormalizedCGCCard; error?: string }> {
  const { certNumber, barcode, include = 'pop,images' } = params;
  
  if (!certNumber && !barcode) {
    throw new Error('Either certNumber or barcode is required');
  }

  // Implement manual timeout since supabase.functions.invoke doesn't accept AbortController
  let timeoutId: any;
  const started = Date.now();
  
  // Enhanced logging with masked sensitive data
  const maskedCert = certNumber ? `${certNumber.slice(0, 3)}***${certNumber.slice(-3)}` : null;
  const maskedBarcode = barcode ? `${barcode.slice(0, 3)}***${barcode.slice(-3)}` : null;
  
  console.info("[cgc:invoke] start", {
    msTimeout: timeoutMs,
    certNumber: maskedCert,
    barcode: maskedBarcode,
    include,
    supabaseUrl: "https://dmpoandoydaqxhzdjnmk.supabase.co",
    timestamp: new Date().toISOString()
  });

  try {
    const requestBody = {
      certNumber,
      barcode,
      include
    };

    const invokePromise = supabase.functions.invoke("cgc-lookup", {
      body: requestBody,
    });
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(`CGC lookup timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    const { data, error } = await Promise.race([invokePromise, timeoutPromise]) as any;

    const dt = Date.now() - started;

    if (error) {
      const status = (error as any)?.status;
      const name = (error as any)?.name;
      const message = (error as any)?.message || 'Unknown error';
      const fullError = `${status ? `[${status}] ` : ''}${message}`;
      
      console.error("[cgc:invoke] invoke ERROR", { 
        name, 
        message, 
        status, 
        dt,
        fullErrorObject: error 
      });
      
      // Throw with clear status and message for UI display
      throw new Error(fullError);
    }

    console.info("[cgc:invoke] invoke OK", {
      ok: data?.ok,
      hasCertNumber: data?.data?.certNumber ? true : false,
      hasImages: data?.data?.images ? true : false,
      keys: data ? Object.keys(data) : [],
      dt,
      timestamp: new Date().toISOString()
    });

    return data;
  } catch (e: any) {
    const dt = Date.now() - started;
    if (e?.name === "AbortError") {
      console.error("[cgc:invoke] ABORT after timeout", { dt, timeoutMs });
      throw new Error(`CGC lookup timed out after ${timeoutMs}ms`);
    }
    console.error("[cgc:invoke] EXCEPTION", { 
      name: e?.name, 
      message: e?.message, 
      dt,
      timestamp: new Date().toISOString(),
      stack: e?.stack
    });
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function normalizeCGCForIntake(data: NormalizedCGCCard) {
  return {
    gradingCompany: 'CGC' as const,
    certNumber: data.certNumber,
    brandTitle: [data.collectible.makerName, data.collectible.setName].filter(Boolean).join(' - '),
    subject: data.collectible.cardName || '',
    category: data.collectible.game || 'Trading Cards',
    variant: data.collectible.variant1 || '',
    cardNumber: data.collectible.cardNumber || '',
    year: data.collectible.cardYear || '',
    grade: data.grade.display || '',
    gradeNumeric: data.grade.numeric?.toString() || '',
    game: data.collectible.game?.toLowerCase().includes('pokemon') ? 'pokemon' : 
           data.collectible.game?.toLowerCase().includes('magic') ? 'mtg' : 
           data.collectible.game || '',
    imageUrl: data.images?.frontUrl || null,
    isValid: !!(data.certNumber && data.grade.display),
    source: 'cgc_api',
    rawPayload: data.raw
  };
}