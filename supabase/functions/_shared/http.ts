// HTTP utilities with retry logic

function sleep(ms: number): Promise<void> { 
  return new Promise(resolve => setTimeout(resolve, ms)); 
}

export async function fetchWithRetry(
  url: string, 
  init: RequestInit = {}, 
  opts?: { retries?: number; baseDelayMs?: number; jitter?: boolean }
): Promise<Response> {
  const retries = opts?.retries ?? 3;
  const baseDelayMs = opts?.baseDelayMs ?? 500;
  const jitter = opts?.jitter ?? true;

  let lastError: Error;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, init);
      
      // Return successful responses immediately
      if (response.ok) {
        return response;
      }
      
      // For non-success responses, only retry on specific status codes
      if (attempt < retries && [429, 500, 502, 503, 504].includes(response.status)) {
        const delay = Math.floor(
          baseDelayMs * Math.pow(2, attempt) * 
          (jitter ? (0.75 + Math.random() * 0.5) : 1)
        );
        await sleep(delay);
        continue;
      }
      
      // Return non-success responses that shouldn't be retried
      return response;
      
    } catch (error: any) {
      lastError = error;
      
      // Only retry network errors
      if (attempt < retries) {
        const delay = Math.floor(
          baseDelayMs * Math.pow(2, attempt) * 
          (jitter ? (0.75 + Math.random() * 0.5) : 1)
        );
        await sleep(delay);
        continue;
      }
    }
  }
  
  throw lastError!;
}