import Papa from 'papaparse';
import { NormalizedCard } from './normalize';

export interface SmartParseResult {
  data: NormalizedCard[];
  errors: SmartParseError[];
  schema: 'full' | 'short' | 'positional' | 'unknown';
  confidence: number; // 0-100
  totalRows: number;
  skippedRows: number;
  suggestions?: string[];
}

export interface SmartParseError {
  row: number;
  reason: string;
  data?: any;
  confidence?: number;
}

export interface FieldMapping {
  sourceIndex: number;
  targetField: keyof NormalizedCard;
  confidence: number;
  detectionMethod: 'header' | 'position' | 'content' | 'manual';
}

// Enhanced header aliases with fuzzy matching support
const HEADER_PATTERNS = {
  id: [
    /^tcg\s*player?\s*id$/i,
    /^product\s*id$/i,
    /^id$/i,
    /^\d+$/, // Pure numeric column
  ],
  line: [
    /^product\s*line$/i,
    /^game$/i,
    /^system$/i,
    /pokemon|magic|yugioh|dragon\s*ball/i,
  ],
  set: [
    /^set\s*name$/i,
    /^expansion$/i,
    /^set$/i,
  ],
  name: [
    /^product\s*name$/i,
    /^card\s*name$/i,
    /^title$/i,
    /^name$/i,
  ],
  number: [
    /^number$/i,
    /^card\s*number$/i,
    /^collector\s*number$/i,
    /^\d+\/\d+$/, // Pattern like "138/185"
  ],
  rarity: [
    /^rarity$/i,
    /common|uncommon|rare|mythic|legendary/i,
  ],
  condition: [
    /^condition$/i,
    /near\s*mint|lightly\s*played|moderately\s*played|heavily\s*played|damaged/i,
  ],
  marketPrice: [
    /^tcg\s*market\s*price$/i,
    /^market\s*price$/i,
    /^price$/i,
    /^\$?\d+\.?\d*$/, // Currency pattern
  ],
  quantity: [
    /^total\s*quantity$/i,
    /^quantity$/i,
    /^qty$/i,
    /^\d+$/, // Numeric pattern
  ],
  photoUrl: [
    /^photo\s*url$/i,
    /^image\s*url$/i,
    /^url$/i,
    /^https?:\/\/.*\.(jpg|jpeg|png|gif|webp)$/i, // URL pattern
  ],
};

// Common TCGPlayer positional formats
const POSITIONAL_SCHEMAS = [
  {
    name: 'tcgplayer_export_v1',
    positions: {
      0: 'id',
      1: 'line', 
      2: 'set',
      3: 'name',
      4: 'title',
      5: 'number',
      6: 'rarity',
      7: 'condition',
      8: 'marketPrice',
      9: 'directLow',
      10: 'lowWithShipping',
      11: 'lowPrice',
      12: 'marketplacePrice',
      13: 'quantity',
      14: 'addQuantity',
      15: 'photoUrl'
    }
  },
  {
    name: 'tcgplayer_basic',
    positions: {
      0: 'id',
      1: 'line',
      2: 'set', 
      3: 'name',
      5: 'number',
      6: 'rarity',
      7: 'condition',
      8: 'marketPrice',
      13: 'quantity',
      15: 'photoUrl'
    }
  }
];

/**
 * Calculate string similarity using Levenshtein distance
 */
function calculateSimilarity(a: string, b: string): number {
  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
  
  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
  
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,     // insertion
        matrix[j - 1][i] + 1,     // deletion
        matrix[j - 1][i - 1] + indicator   // substitution
      );
    }
  }
  
  const maxLength = Math.max(a.length, b.length);
  return maxLength === 0 ? 1 : (maxLength - matrix[b.length][a.length]) / maxLength;
}

/**
 * Detect field type from content using patterns
 */
function detectFieldFromContent(values: string[], index: number): { field: keyof NormalizedCard | null; confidence: number } {
  const nonEmptyValues = values.filter(v => v && v.trim()).slice(0, 10); // Sample first 10 non-empty values
  if (nonEmptyValues.length === 0) return { field: null, confidence: 0 };

  const testResults = [];

  for (const [field, patterns] of Object.entries(HEADER_PATTERNS)) {
    let matches = 0;
    
    for (const value of nonEmptyValues) {
      for (const pattern of patterns) {
        if (pattern.test(value)) {
          matches++;
          break;
        }
      }
    }
    
    const confidence = matches / nonEmptyValues.length;
    if (confidence > 0.3) { // At least 30% of values match
      testResults.push({ field: field as keyof NormalizedCard, confidence });
    }
  }

  // Return the field with highest confidence
  testResults.sort((a, b) => b.confidence - a.confidence);
  return testResults[0] || { field: null, confidence: 0 };
}

/**
 * Fuzzy match headers to known field names
 */
function fuzzyMatchHeaders(headers: string[]): FieldMapping[] {
  const mappings: FieldMapping[] = [];
  
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i].trim();
    let bestMatch: { field: keyof NormalizedCard | null; confidence: number } = { field: null, confidence: 0 };
    
    // Try exact pattern matches first
    for (const [field, patterns] of Object.entries(HEADER_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(header)) {
          bestMatch = { field: field as keyof NormalizedCard, confidence: 1.0 };
          break;
        }
      }
      if (bestMatch.confidence === 1.0) break;
    }
    
    // If no exact match, try fuzzy matching
    if (bestMatch.confidence < 1.0) {
      for (const field of Object.keys(HEADER_PATTERNS)) {
        const similarity = calculateSimilarity(header.toLowerCase(), field.toLowerCase());
        if (similarity > bestMatch.confidence && similarity > 0.6) {
          bestMatch = { field: field as keyof NormalizedCard, confidence: similarity };
        }
      }
    }
    
    if (bestMatch.field && bestMatch.confidence > 0.5) {
      mappings.push({
        sourceIndex: i,
        targetField: bestMatch.field,
        confidence: bestMatch.confidence,
        detectionMethod: 'header'
      });
    }
  }
  
  return mappings;
}

/**
 * Try positional detection for headerless CSV
 */
function detectPositionalMapping(rows: string[][]): { mappings: FieldMapping[]; confidence: number; schemaName?: string } {
  if (rows.length === 0) return { mappings: [], confidence: 0 };
  
  const columnCount = Math.max(...rows.map(row => row.length));
  const bestSchema = { mappings: [] as FieldMapping[], confidence: 0, schemaName: undefined as string | undefined };
  
  // Try each known positional schema
  for (const schema of POSITIONAL_SCHEMAS) {
    const mappings: FieldMapping[] = [];
    let totalConfidence = 0;
    let fieldCount = 0;
    
    for (const [posStr, field] of Object.entries(schema.positions)) {
      const pos = parseInt(posStr);
      if (pos >= columnCount) continue;
      
      // Extract values from this column to validate
      const columnValues = rows.map(row => row[pos] || '').filter(v => v.trim());
      if (columnValues.length === 0) continue;
      
      // Test if this column matches the expected field type
      const contentMatch = detectFieldFromContent(columnValues, pos);
      const confidence = contentMatch.field === field ? 0.9 : 0.3;
      
      if (confidence > 0.5 || Object.keys(schema.positions).length <= 10) { // Be more lenient for shorter schemas
        mappings.push({
          sourceIndex: pos,
          targetField: field as keyof NormalizedCard,
          confidence,
          detectionMethod: 'position'
        });
        totalConfidence += confidence;
        fieldCount++;
      }
    }
    
    const avgConfidence = fieldCount > 0 ? totalConfidence / fieldCount : 0;
    if (avgConfidence > bestSchema.confidence) {
      bestSchema.mappings = mappings;
      bestSchema.confidence = avgConfidence;
      bestSchema.schemaName = schema.name;
    }
  }
  
  return bestSchema;
}

/**
 * Smart TCGPlayer CSV parser with enhanced format detection
 */
export function parseSmartTcgplayerCsv(csvText: string): SmartParseResult {
  const cleanText = csvText.replace(/^\uFEFF/, '').trim();
  
  if (!cleanText) {
    return {
      data: [],
      errors: [{ row: 0, reason: 'Empty CSV content' }],
      schema: 'unknown',
      confidence: 0,
      totalRows: 0,
      skippedRows: 0
    };
  }

  // First parse to detect structure
  let parseResult = Papa.parse(cleanText, {
    header: false,
    skipEmptyLines: 'greedy',
    dynamicTyping: false
  });

  if (parseResult.errors.length > 0) {
    return {
      data: [],
      errors: parseResult.errors.map((err, index) => ({
        row: err.row || index,
        reason: err.message || 'Parse error'
      })),
      schema: 'unknown',
      confidence: 0,
      totalRows: 0,
      skippedRows: 0
    };
  }

  const allRows = parseResult.data as string[][];
  if (allRows.length === 0) {
    return {
      data: [],
      errors: [{ row: 0, reason: 'No data rows found' }],
      schema: 'unknown',
      confidence: 0,
      totalRows: 0,
      skippedRows: 0
    };
  }

  let mappings: FieldMapping[] = [];
  let schema: SmartParseResult['schema'] = 'unknown';
  let confidence = 0;
  let dataStartRow = 0;
  const suggestions: string[] = [];

  // Try header-based detection first
  const firstRow = allRows[0];
  const headerMappings = fuzzyMatchHeaders(firstRow);
  
  if (headerMappings.length >= 4) { // Need at least 4 recognized fields for header-based
    mappings = headerMappings;
    schema = headerMappings.length >= 8 ? 'full' : 'short';
    confidence = headerMappings.reduce((sum, m) => sum + m.confidence, 0) / headerMappings.length * 100;
    dataStartRow = 1;
  } else {
    // Try positional detection (treat first row as data)
    const positionalResult = detectPositionalMapping(allRows);
    if (positionalResult.confidence > 0.5) {
      mappings = positionalResult.mappings;
      schema = 'positional';
      confidence = positionalResult.confidence * 100;
      dataStartRow = 0;
      
      if (positionalResult.schemaName) {
        suggestions.push(`Detected ${positionalResult.schemaName} format`);
      }
    }
  }

  // If still no good detection, try content-based detection on all columns
  if (confidence < 50 && allRows.length > 1) {
    const contentMappings: FieldMapping[] = [];
    const maxCols = Math.max(...allRows.map(row => row.length));
    
    for (let col = 0; col < maxCols; col++) {
      const columnValues = allRows.slice(dataStartRow).map(row => row[col] || '');
      const contentMatch = detectFieldFromContent(columnValues, col);
      
      if (contentMatch.field && contentMatch.confidence > 0.4) {
        contentMappings.push({
          sourceIndex: col,
          targetField: contentMatch.field,
          confidence: contentMatch.confidence,
          detectionMethod: 'content'
        });
      }
    }
    
    if (contentMappings.length >= 3) {
      mappings = contentMappings;
      schema = 'positional';
      confidence = contentMappings.reduce((sum, m) => sum + m.confidence, 0) / contentMappings.length * 100;
      suggestions.push('Used content-based field detection');
    }
  }

  if (mappings.length === 0) {
    return {
      data: [],
      errors: [{
        row: 0,
        reason: 'Could not detect CSV format. Supported formats: TCGPlayer exports with headers or standard column positions'
      }],
      schema: 'unknown',
      confidence: 0,
      totalRows: allRows.length,
      skippedRows: allRows.length,
      suggestions: [
        'Try adding headers: TCGplayer Id, Product Line, Set Name, Product Name, Number, Rarity, Condition, TCG Market Price, Total Quantity',
        'Ensure data follows TCGPlayer export format',
        'Check for extra commas or formatting issues'
      ]
    };
  }

  // Parse the data using detected mappings
  const results: NormalizedCard[] = [];
  const errors: SmartParseError[] = [];
  let skippedRows = 0;

  for (let i = dataStartRow; i < allRows.length; i++) {
    const row = allRows[i];
    
    try {
      const normalized: Partial<NormalizedCard> = {};
      
      // Apply mappings
      for (const mapping of mappings) {
        if (mapping.sourceIndex >= row.length) continue;
        
        const value = row[mapping.sourceIndex]?.trim() || '';
        if (!value) continue;
        
        switch (mapping.targetField) {
          case 'marketPrice':
          case 'directLow':
          case 'lowWithShipping':
          case 'lowPrice':
          case 'marketplacePrice':
            const price = parseFloat(value.replace(/[$,]/g, ''));
            (normalized as any)[mapping.targetField] = isNaN(price) ? null : Math.round(price * 100) / 100;
            break;
          case 'quantity':
          case 'addQuantity':
            const qty = parseInt(value);
            (normalized as any)[mapping.targetField] = isNaN(qty) ? (mapping.targetField === 'quantity' ? 1 : null) : qty;
            break;
          case 'photoUrl':
            (normalized as any)[mapping.targetField] = value.startsWith('http') ? value : null;
            break;
          default:
            (normalized as any)[mapping.targetField] = value;
        }
      }
      
      // Validate required fields
      const missingRequired: string[] = [];
      if (!normalized.id) missingRequired.push('ID');
      if (!normalized.line) missingRequired.push('Product Line');
      if (!normalized.set) missingRequired.push('Set');
      if (!normalized.name) missingRequired.push('Name');
      
      if (missingRequired.length > 0) {
        errors.push({
          row: i + 1,
          reason: `Missing required fields: ${missingRequired.join(', ')}`,
          data: row,
          confidence: confidence
        });
        skippedRows++;
        continue;
      }

      // Create complete normalized card with defaults
      const card: NormalizedCard = {
        id: normalized.id!,
        line: normalized.line!,
        set: normalized.set!,
        name: normalized.name!,
        title: normalized.title || null,
        number: normalized.number || '',
        rarity: normalized.rarity || '',
        condition: normalized.condition || 'Unknown',
        marketPrice: normalized.marketPrice || null,
        directLow: normalized.directLow || null,
        lowWithShipping: normalized.lowWithShipping || null,
        lowPrice: normalized.lowPrice || null,
        marketplacePrice: normalized.marketplacePrice || null,
        quantity: normalized.quantity || 1,
        addQuantity: normalized.addQuantity || null,
        photoUrl: normalized.photoUrl || null
      };

      results.push(card);
      
    } catch (error) {
      errors.push({
        row: i + 1,
        reason: error instanceof Error ? error.message : 'Unknown processing error',
        data: row,
        confidence: confidence
      });
      skippedRows++;
    }
  }

  return {
    data: results,
    errors,
    schema,
    confidence,
    totalRows: allRows.length - dataStartRow,
    skippedRows,
    suggestions
  };
}