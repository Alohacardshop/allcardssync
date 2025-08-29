// Retry utility for HTTP requests with exponential backoff

interface RetryOptions {
  retries?: number;
  baseMs?: number;
  maxMs?: number;
  timeoutMs?: number;
}

export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  options: RetryOptions = {}
): Promise<Response> {
  const {
    retries = 5,
    baseMs = 400,
    maxMs = 4000,
    timeoutMs = 15000
  } = options;

  let lastError: Error;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        ...init,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Success - return response
      if (response.ok) {
        return response;
      }

      // Don't retry on 4xx errors (except 429)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return response;
      }

      // For 429 or 5xx, check if we should retry
      if (attempt < retries) {
        let delayMs = Math.min(baseMs * Math.pow(2, attempt), maxMs);
        
        // Respect Retry-After header for 429
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          if (retryAfter) {
            const retryAfterMs = parseInt(retryAfter) * 1000;
            if (retryAfterMs > 0 && retryAfterMs < maxMs) {
              delayMs = retryAfterMs;
            }
          }
        }

        console.log(`Retrying ${url} after ${delayMs}ms (attempt ${attempt + 1}/${retries + 1})`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < retries) {
        const delayMs = Math.min(baseMs * Math.pow(2, attempt), maxMs);
        console.log(`Retrying ${url} after ${delayMs}ms due to error: ${error}`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
    }
  }

  throw lastError!;
}