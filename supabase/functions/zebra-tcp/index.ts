import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TCPRequest {
  host: string;
  port?: number;
  data: string;
  expectReply?: boolean;
  timeoutMs?: number;
}

interface TCPResponse {
  ok: boolean;
  reply?: string;
  error?: string;
}

async function sendTCP(
  host: string, 
  port: number, 
  data: string, 
  expectReply: boolean = false,
  timeoutMs: number = 5000
): Promise<TCPResponse> {
  let conn: Deno.Conn | null = null;
  
  try {
    // Connect to printer
    conn = await Deno.connect({ hostname: host, port, transport: "tcp" });
    
    // Send data
    const encoder = new TextEncoder();
    await conn.write(encoder.encode(data));
    
    if (expectReply) {
      // Read response with timeout
      const buffer = new Uint8Array(4096);
      const decoder = new TextDecoder();
      let reply = '';
      
      const readPromise = async () => {
        try {
          const n = await conn!.read(buffer);
          if (n && n > 0) {
            reply += decoder.decode(buffer.subarray(0, n));
          }
          return reply;
        } catch (error) {
          console.log('Read completed or connection closed:', error.message);
          return reply;
        }
      };
      
      const timeoutPromise = new Promise<string>((_, reject) => {
        setTimeout(() => reject(new Error('Read timeout')), timeoutMs);
      });
      
      try {
        reply = await Promise.race([readPromise(), timeoutPromise]);
      } catch (error) {
        // Timeout is acceptable when reading replies
        console.log('Read timeout, using partial reply:', reply);
      }
      
      return { ok: true, reply };
    }
    
    return { ok: true };
    
  } catch (error) {
    const errorMsg = error.message || String(error);
    
    // Map Deno errors to user-friendly messages
    if (errorMsg.includes('ConnectionRefused') || errorMsg.includes('ECONNREFUSED')) {
      return { ok: false, error: `Printer not reachable at ${host}:${port}` };
    }
    if (errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT')) {
      return { ok: false, error: 'Network timeout - check Wi-Fi signal and network connectivity' };
    }
    if (errorMsg.includes('NotFound') || errorMsg.includes('ENOTFOUND')) {
      return { ok: false, error: 'DNS resolution failed - check hostname/IP address' };
    }
    if (errorMsg.includes('Unreachable') || errorMsg.includes('EHOSTUNREACH')) {
      return { ok: false, error: 'Bad IP/Host or network down - check network connectivity' };
    }
    if (errorMsg.includes('NetworkUnreachable') || errorMsg.includes('ENETUNREACH')) {
      return { ok: false, error: 'Network unreachable - check routing/firewall settings' };
    }
    
    return { ok: false, error: errorMsg };
  } finally {
    if (conn) {
      try {
        conn.close();
      } catch (e) {
        console.log('Error closing connection:', e.message);
      }
    }
  }
}

async function sendTCPWithRetries(request: TCPRequest): Promise<TCPResponse> {
  const maxRetries = 3;
  const baseDelayMs = 500;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await sendTCP(
      request.host,
      request.port || 9100,
      request.data,
      request.expectReply || false,
      request.timeoutMs || 5000
    );
    
    if (result.ok || attempt === maxRetries) {
      return result;
    }
    
    // Only retry on connection/network errors, not protocol errors
    const shouldRetry = result.error?.includes('not reachable') || 
                       result.error?.includes('timeout') ||
                       result.error?.includes('network down');
    
    if (!shouldRetry) {
      return result;
    }
    
    // Exponential backoff
    const delay = baseDelayMs * Math.pow(2, attempt - 1);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  return { ok: false, error: 'Max retries exceeded' };
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ ok: false, error: 'Method not allowed' }),
        { 
          status: 405, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    let tcpRequest: TCPRequest;
    try {
      tcpRequest = await req.json();
      console.log('Received request:', JSON.stringify(tcpRequest));
    } catch (parseError) {
      console.error('Failed to parse JSON body:', parseError);
      return new Response(
        JSON.stringify({ ok: false, error: 'Invalid JSON body' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }
    
    // Host is required, data can be empty for connection tests
    if (!tcpRequest.host) {
      console.log('Missing host, received:', tcpRequest);
      return new Response(
        JSON.stringify({ ok: false, error: `Missing required field: host. Received: ${JSON.stringify(tcpRequest)}` }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }
    
    // Default empty data for connection tests
    if (tcpRequest.data === undefined) {
      tcpRequest.data = '';
    }

    const result = await sendTCPWithRetries(tcpRequest);
    
    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Error in zebra-tcp function:', error)
    
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: `Server error: ${error.message}` 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})