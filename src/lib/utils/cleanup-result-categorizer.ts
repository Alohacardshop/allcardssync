/**
 * Categorizes cleanup results into deleted, already gone (404), and failed
 */
export interface CleanupResult {
  deleted: number;
  alreadyGone: number;
  failed: number;
}

export function categorizeCleanupResults(
  results: PromiseSettledResult<any>[]
): CleanupResult {
  let deleted = 0;
  let alreadyGone = 0;
  let failed = 0;

  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      const value = result.value;
      
      // Check if it's a successful response from the edge function
      if (value?.data?.ok || value?.data?.shopifyOkOrGone) {
        deleted++;
      } else if (value?.error || value?.data?.error) {
        // Check if it's a 404 error
        const errorMsg = value.error?.message || value.data?.error || '';
        if (errorMsg.includes('404') || errorMsg.includes('not found')) {
          alreadyGone++;
        } else {
          failed++;
        }
      } else {
        // Unclear response, count as deleted if no error
        deleted++;
      }
    } else {
      // Check if rejection is a 404
      const errorMsg = result.reason?.message || '';
      if (errorMsg.includes('404') || errorMsg.includes('not found')) {
        alreadyGone++;
      } else {
        failed++;
      }
    }
  });

  return { deleted, alreadyGone, failed };
}
