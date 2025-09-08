import Papa from 'papaparse';
import { NormalizedCard, remapKeys, detectSchema, getRecognizedHeaders } from './normalize';

export interface ParseResult {
  data: NormalizedCard[];
  errors: ParseError[];
  schema: 'full' | 'short' | 'unknown';
  totalRows: number;
  skippedRows: number;
}

export interface ParseError {
  row: number;
  reason: string;
  data?: any;
}

/**
 * Parse TCGPlayer CSV with schema tolerance
 */
export function parseTcgplayerCsv(csvText: string): ParseResult {
  // Remove BOM and trim whitespace
  const cleanText = csvText.replace(/^\uFEFF/, '').trim();
  
  if (!cleanText) {
    return {
      data: [],
      errors: [{ row: 0, reason: 'Empty CSV content' }],
      schema: 'unknown',
      totalRows: 0,
      skippedRows: 0
    };
  }

  // Parse with Papa Parse
  const parseResult = Papa.parse(cleanText, {
    header: true,
    skipEmptyLines: 'greedy',
    dynamicTyping: false,
    transformHeader: (header: string) => header.trim()
  });

  if (parseResult.errors.length > 0) {
    return {
      data: [],
      errors: parseResult.errors.map((err, index) => ({
        row: err.row || index,
        reason: err.message || 'Parse error'
      })),
      schema: 'unknown',
      totalRows: 0,
      skippedRows: 0
    };
  }

  const headers = parseResult.meta.fields || [];
  const schema = detectSchema(headers);
  
  // If schema is unknown, provide helpful error
  if (schema === 'unknown') {
    return {
      data: [],
      errors: [{
        row: 0,
        reason: `Unrecognized CSV format. Expected headers like: ${getRecognizedHeaders().slice(0, 10).join(', ')}...`
      }],
      schema: 'unknown',
      totalRows: parseResult.data.length,
      skippedRows: parseResult.data.length
    };
  }

  const results: NormalizedCard[] = [];
  const errors: ParseError[] = [];
  let skippedRows = 0;

  for (let i = 0; i < parseResult.data.length; i++) {
    const rawRow = parseResult.data[i] as Record<string, string>;
    
    try {
      // Remap and normalize the row
      const normalized = remapKeys(rawRow);
      
      // Validate required fields
      const missingRequired: string[] = [];
      if (!normalized.id?.trim()) missingRequired.push('TCGplayer Id');
      if (!normalized.line?.trim()) missingRequired.push('Product Line');
      if (!normalized.set?.trim()) missingRequired.push('Set Name');
      if (!normalized.name?.trim()) missingRequired.push('Product Name');
      if (!normalized.number?.trim()) missingRequired.push('Number');
      if (!normalized.rarity?.trim()) missingRequired.push('Rarity');
      if (!normalized.condition?.trim()) missingRequired.push('Condition');
      
      if (missingRequired.length > 0) {
        errors.push({
          row: i + 1,
          reason: `Missing required fields: ${missingRequired.join(', ')}`,
          data: rawRow
        });
        skippedRows++;
        continue;
      }

      // Create complete normalized card with defaults
      const card: NormalizedCard = {
        id: normalized.id!.trim(),
        line: normalized.line!.trim(),
        set: normalized.set!.trim(),
        name: normalized.name!.trim(),
        title: normalized.title?.trim() || null,
        number: normalized.number!.trim(),
        rarity: normalized.rarity!.trim(),
        condition: normalized.condition!.trim(),
        marketPrice: normalized.marketPrice,
        directLow: normalized.directLow,
        lowWithShipping: normalized.lowWithShipping,
        lowPrice: normalized.lowPrice,
        marketplacePrice: normalized.marketplacePrice,
        quantity: normalized.quantity ?? 0,
        addQuantity: normalized.addQuantity,
        photoUrl: normalized.photoUrl
      };

      results.push(card);
      
    } catch (error) {
      errors.push({
        row: i + 1,
        reason: error instanceof Error ? error.message : 'Unknown processing error',
        data: rawRow
      });
      skippedRows++;
    }
  }

  return {
    data: results,
    errors,
    schema,
    totalRows: parseResult.data.length,
    skippedRows
  };
}

/**
 * Validate if text looks like TCGPlayer CSV
 */
export function isValidTcgplayerCsv(csvText: string): boolean {
  const cleanText = csvText.replace(/^\uFEFF/, '').trim();
  const firstLine = cleanText.split('\n')[0]?.trim();
  
  if (!firstLine) return false;
  
  // Check if first line contains recognizable headers
  const recognizedHeaders = getRecognizedHeaders();
  return recognizedHeaders.some(header => firstLine.includes(header));
}