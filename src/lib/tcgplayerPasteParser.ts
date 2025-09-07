export interface ParsedTcgplayerRow {
  quantity: number;
  name: string;
  set?: string;
  number?: string;
  printing?: string;
  condition?: string;
  language?: string;
  marketPrice?: number;
  cost?: number; // Added for UI state
}

export interface ParsedTcgplayerData {
  rows: ParsedTcgplayerRow[];
  marketAsOf?: string;
  totalMarketValue?: number;
  cardCount?: number;
}

/**
 * Parses TCGplayer paste text into structured data
 * 
 * Example input:
 * TOTAL: 3 cards - $698.65
 * 1 Blaine's Charizard [Gym] (1st Edition Holofoil, Near Mint, English) - $650.00
 * 1 Iono - 091/071 [SV2D:] (Holofoil, Near Mint, Japanese) - $45.60
 * 1 Bellibolt - 201/197 [SV03:] (Holofoil, Near Mint, English) - $3.05
 * Prices from Market Price on 9/7/2025 and are subject to change.
 */
export function parseTcgplayerPaste(text: string): ParsedTcgplayerData {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  const rows: ParsedTcgplayerRow[] = [];
  let marketAsOf: string | undefined;
  let totalMarketValue: number | undefined;
  let cardCount: number | undefined;

  for (const line of lines) {
    // Skip TOTAL line but extract info
    if (line.startsWith('TOTAL:')) {
      const totalMatch = line.match(/TOTAL:\s*(\d+)\s*cards?\s*-\s*\$([0-9,]+\.?\d*)/i);
      if (totalMatch) {
        cardCount = parseInt(totalMatch[1], 10);
        totalMarketValue = parseFloat(totalMatch[2].replace(/,/g, ''));
      }
      continue;
    }

    // Skip prices disclaimer line but extract date
    if (line.toLowerCase().includes('prices from market price')) {
      const dateMatch = line.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
      if (dateMatch) {
        marketAsOf = dateMatch[1];
      }
      continue;
    }

    // Parse card lines
    const cardMatch = line.match(/^(\d+)\s+(.+?)\s*-\s*\$([0-9,]+\.?\d*)$/);
    if (!cardMatch) {
      console.warn('Failed to parse line:', line);
      continue;
    }

    const [, quantityStr, cardInfo, priceStr] = cardMatch;
    const quantity = parseInt(quantityStr, 10);
    const marketPrice = Math.ceil(parseFloat(priceStr.replace(/,/g, '')));

    // Parse card info: Name [Set] (attributes) or Name - number [Set] (attributes)
    let name = cardInfo;
    let set: string | undefined;
    let number: string | undefined;
    let printing: string | undefined;
    let condition: string | undefined;
    let language: string | undefined;

    // Extract number pattern (e.g., "091/071") if present before first bracket
    const numberMatch = cardInfo.match(/^(.+?)\s*-\s*([^[\]]+?)\s*\[/);
    if (numberMatch) {
      name = numberMatch[1].trim();
      number = numberMatch[2].trim();
    }

    // Extract set from first [...]
    const setMatch = cardInfo.match(/\[(.*?)\]/);
    if (setMatch) {
      set = setMatch[1].trim();
      // Remove set part from name if not already removed by number match
      if (!numberMatch) {
        name = cardInfo.substring(0, cardInfo.indexOf('[')).trim();
      }
    }

    // Extract attributes from (...)
    const attrMatch = cardInfo.match(/\(([^)]+)\)/);
    if (attrMatch) {
      const attributes = attrMatch[1].split(',').map(attr => attr.trim());
      
      // Map attributes to fields - order may vary
      for (const attr of attributes) {
        const lowerAttr = attr.toLowerCase();
        
        // Language detection
        if (lowerAttr === 'english' || lowerAttr === 'japanese' || lowerAttr === 'korean' || lowerAttr === 'chinese') {
          language = attr;
        }
        // Condition detection
        else if (lowerAttr.includes('mint') || lowerAttr.includes('played') || lowerAttr === 'damaged' || lowerAttr === 'sealed') {
          condition = attr;
        }
        // Printing detection (anything else is likely printing)
        else {
          printing = attr;
        }
      }
    }

    rows.push({
      quantity,
      name,
      set,
      number,
      printing,
      condition,
      language,
      marketPrice
    });
  }

  return {
    rows,
    marketAsOf,
    totalMarketValue,
    cardCount
  };
}

/**
 * Extracts market date from TCGplayer paste text
 */
export function extractMarketAsOf(text: string): string | null {
  const dateMatch = text.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
  return dateMatch ? dateMatch[1] : null;
}

/**
 * Calculates total market price from parsed rows
 */
export function sumMarketPrice(rows: ParsedTcgplayerRow[]): number {
  return rows.reduce((sum, row) => {
    const price = row.marketPrice || 0;
    const qty = row.quantity || 0;
    return sum + (price * qty);
  }, 0);
}