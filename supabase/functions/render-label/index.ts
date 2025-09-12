import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { title, lot_number, price, grade, sku, id } = await req.json();
    const barcode = sku || id || "NO-SKU";

    const sanitize = (s?: string) => (s ?? "").replace(/"/g, "'");
    const formatPrice = (p: any) => (p == null || p === "" ? "" : `$${Number(p).toFixed(2)}`);

    // ZPL parameters for Zebra printers at 203 DPI
    const PRINT_SPEED = 6;     // 1-14 range
    const PRINT_DENSITY = 8;   // 0-30 range
    const LABEL_LENGTH = 203;  // 1 inch at 203 DPI

    // Generate ZPL for 2x1 inch label
    const zpl = [
      "^XA",                              // Start format
      "^LH0,0",                          // Label home position
      `^LL${LABEL_LENGTH}`,              // Label length
      `^PR${PRINT_SPEED}`,               // Print rate (speed)
      `^MD${PRINT_DENSITY}`,             // Media darkness (density)
      `^FO10,20^A0N,25,25^FD${sanitize(title)}^FS`,           // Title text
      `^FO280,20^A0N,20,20^FD${formatPrice(price)}^FS`,       // Price text (right side)
      `^FO10,60^A0N,15,15^FDGrade: ${sanitize(grade || '')}^FS`, // Grade text
      `^FO10,90^BCN,60,Y,N,N^FD${sanitize(barcode)}^FS`,     // Barcode
      `^FO10,160^A0N,12,12^FD${sanitize(lot_number || '')}^FS`, // Lot number
      "^PQ1,0,1,Y",                      // Print quantity
      "^XZ"                              // End format
    ].join("\n");

    const correlationId = `zpl-${Date.now()}-${barcode}`;
    
    console.log('Generated ZPL label:', { correlationId, barcode, programLength: zpl.length });
    
    return new Response(JSON.stringify({ program: zpl, correlationId, zpl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error('Error rendering label:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to render label' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});