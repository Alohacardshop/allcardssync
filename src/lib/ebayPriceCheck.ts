import { supabase } from '@/integrations/supabase/client';

export interface EbayPriceCheckResult {
  ebayAverage: number;
  priceCount: number;
  pricesUsed: number[];
  rawPrices: number[];
  outliersRemoved: number[];
  currentPrice: number;
  differencePercent: number;
}

export function generateEbaySearchQuery(item: any): string {
  const parts: string[] = [];

  if (item.year) parts.push(item.year);
  if (item.brand_title) parts.push(item.brand_title);
  if (item.subject) parts.push(item.subject);
  if (item.card_number) parts.push(`#${item.card_number}`);

  // For graded cards, include grade
  if (item.type === 'Graded' && item.grade) {
    const company = item.grading_company || 'PSA';
    parts.push(`${company} ${item.grade}`);
  }

  return parts.join(' ').trim();
}

export async function checkEbayPrice(
  itemId: string,
  searchQuery: string,
  currentPrice: number
): Promise<EbayPriceCheckResult> {
  const { data, error } = await supabase.functions.invoke('ebay-price-check', {
    body: {
      searchQuery,
      itemId,
      currentPrice,
    },
  });

  if (error) throw error;
  return data;
}

export async function bulkCheckEbayPrices(
  items: Array<{
    id: string;
    price: number;
    [key: string]: any;
  }>,
  onProgress?: (current: number, total: number) => void
): Promise<{
  successful: number;
  failed: number;
  errors: Array<{ itemId: string; error: string }>;
}> {
  let successful = 0;
  let failed = 0;
  const errors: Array<{ itemId: string; error: string }> = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    
    try {
      const searchQuery = generateEbaySearchQuery(item);
      if (!searchQuery) {
        failed++;
        errors.push({ itemId: item.id, error: 'Could not generate search query' });
        continue;
      }

      await checkEbayPrice(item.id, searchQuery, item.price || 0);
      successful++;
      
      if (onProgress) {
        onProgress(i + 1, items.length);
      }

      // Rate limiting: wait 1 second between requests
      if (i < items.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error: any) {
      failed++;
      errors.push({ 
        itemId: item.id, 
        error: error.message || 'Unknown error' 
      });
    }
  }

  return { successful, failed, errors };
}
