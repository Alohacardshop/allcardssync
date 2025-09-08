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
  price?: number; // Your selling price
  tcgplayerId?: string;
  productLine?: string;
  rarity?: string;
  photoUrl?: string;
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

  // Find CSV header line to split sections
  const csvHeaderIndex = lines.findIndex(line => line.startsWith('TCGplayer Id,'));
  const humanReadableLines = csvHeaderIndex >= 0 ? lines.slice(0, csvHeaderIndex) : lines;
  const csvLines = csvHeaderIndex >= 0 ? lines.slice(csvHeaderIndex + 1) : [];

  // Parse human-readable section (if exists)
  for (const line of humanReadableLines) {
    // Skip CSV header if it somehow ended up here
    if (line.startsWith('TCGplayer Id,')) continue;
    
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

  // Parse CSV section
  if (csvLines.length > 0) {
    const csvRows: any[] = [];
    
    for (const csvLine of csvLines) {
      const fields = csvLine.split(',');
      if (fields.length >= 16) {
        // Parse CSV data
        const tcgplayerId = fields[0];
        const productLine = fields[1];
        const setName = fields[2];
        const productName = fields[3];
        const title = fields[4];
        const number = fields[5];
        const rarity = fields[6];
        const condition = fields[7];
        const tcgMarketPrice = parseFloat(fields[8]) || 0;
        const quantity = parseInt(fields[12]) || 1; // Default quantity to 1 if not specified
        const photoUrl = fields[15];

        const csvRow = {
          tcgplayerId,
          productLine,
          setName,
          productName: productName || title,
          number,
          rarity,
          condition,
          tcgMarketPrice: Math.ceil(tcgMarketPrice), // Round up market price
          quantity,
          photoUrl
        };
        
        csvRows.push(csvRow);
      }
    }

    // If we have CSV data but no human-readable data, create rows from CSV
    if (rows.length === 0 && csvRows.length > 0) {
      for (const csvRow of csvRows) {
        // Extract language from condition if present
        let language = 'English';
        let cleanCondition = csvRow.condition;
        if (csvRow.condition && csvRow.condition.includes(' - ')) {
          const parts = csvRow.condition.split(' - ');
          cleanCondition = parts[0];
          language = parts[1] || 'English';
        }

        rows.push({
          quantity: csvRow.quantity,
          name: csvRow.productName,
          set: csvRow.setName,
          number: csvRow.number,
          printing: csvRow.rarity === 'Holo Rare' ? 'Holofoil' : csvRow.rarity,
          condition: cleanCondition,
          language: language,
          marketPrice: csvRow.tcgMarketPrice,
          tcgplayerId: csvRow.tcgplayerId,
          productLine: csvRow.productLine,
          rarity: csvRow.rarity,
          photoUrl: csvRow.photoUrl
        });
      }
      
      // Calculate totals from CSV data
      cardCount = csvRows.length;
      totalMarketValue = csvRows.reduce((sum, row) => sum + (row.tcgMarketPrice * row.quantity), 0);
    } else if (rows.length > 0) {
      // Merge CSV data with human-readable data by matching quantity and price
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const csvMatch = csvRows.find(csv => 
          csv.quantity === row.quantity && 
          Math.abs(csv.tcgMarketPrice - (row.marketPrice || 0)) < 1.01 // Allow for rounding differences
        );
        
        if (csvMatch) {
          rows[i] = {
            ...row,
            tcgplayerId: csvMatch.tcgplayerId,
            productLine: csvMatch.productLine,
            rarity: csvMatch.rarity,
            photoUrl: csvMatch.photoUrl,
            // Use CSV data for missing fields
            set: row.set || csvMatch.setName,
            number: row.number || csvMatch.number,
            condition: row.condition || csvMatch.condition
          };
        }
      }
    }
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