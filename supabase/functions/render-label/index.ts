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

    // Tunables (Rollo @ 203dpi, 2x1 label)
    const SPEED = 4;      // 2–5; lower can improve darkness
    const DENSITY = 10;   // 0–15; increase if bars are light
    const NARROW = 2;     // module width; 2 or 3 recommended
    const WIDE = 2;       // leave = NARROW unless you need wider ratios
    const BAR_H = 90;     // bar height in dots; 90–120 typical

    // Use inches and CRLF line endings for Rollo compatibility
    const tspl = [
      "SIZE 2.0,1.0",
      "GAP 0.12,0", 
      `DENSITY ${DENSITY}`,
      `SPEED ${SPEED}`,
      "DIRECTION 1",
      "CLS",
      `TEXT 10,8,"FONT001",0,1,1,"${sanitize(title)}"`,
      `TEXT 10,45,"FONT001",0,1,1,"${sanitize(lot_number || "")}"`,
      `TEXT 300,45,"FONT001",0,1,1,"${formatPrice(price)}"`,
      `BARCODE 10,70,"128",${BAR_H},1,0,${NARROW},${WIDE},"${sanitize(barcode)}"`,
      "PRINT 1,1"
    ].join("\r\n");

    const correlationId = `idx-${Date.now()}-${barcode}`;
    
    console.log('Generated TSPL label:', { correlationId, barcode, programLength: tspl.length });
    
    return new Response(JSON.stringify({ program: tspl, correlationId }), {
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