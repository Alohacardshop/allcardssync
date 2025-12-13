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

// Header patterns for field detection - ONLY header text patterns, no content patterns
const HEADER_PATTERNS = {
  id: [
    /^tcgplayer\s*id$/i,      // "TCGplayer Id" (most common)
    /^tcg\s*player\s*id$/i,   // "TCG Player Id"
    /^product\s*id$/i,
    /^id$/i,
  ],
  line: [
    /^product\s*line$/i,
    /^game$/i,
    /^system$/i,
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
  ],
  rarity: [
    /^rarity$/i,
  ],
  condition: [
    /^condition$/i,
  ],
  marketPrice: [
    /^tcg\s*market\s*price$/i,
    /^market\s*price$/i,
    /^price$/i,
  ],
  quantity: [
    /^total\s*quantity$/i,
    /^quantity$/i,
    /^qty$/i,
  ],
  photoUrl: [
    /^photo\s*url$/i,
    /^image\s*url$/i,
    /^url$/i,
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
      12: 'quantity',        // Fixed: Total Quantity is column 12
      13: 'addQuantity',     // Fixed: Add to Quantity is column 13
      14: 'marketplacePrice', // Fixed: TCG Marketplace Price is column 14
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
      12: 'quantity',        // Fixed: match v1 schema
      13: 'addQuantity',     // Fixed: match v1 schema
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
    // Normalize whitespace: replace non-breaking spaces and collapse multiple spaces
    const header = (headers[i] || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
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
 * Find the actual header row in TCGPlayer CSVs
 * TCGPlayer exports often have 9+ metadata rows before the actual headers
 */
function findHeaderRow(rows: string[][]): number {
  // Look for a row that contains typical TCGPlayer header fields
  const headerIndicators = [
    /tcgplayer\s*id/i,
    /product\s*line/i,
    /set\s*name/i,
    /product\s*name/i,
    /tcg\s*market\s*price/i,
    /total\s*quantity/i
  ];
  
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i];
    if (!row || row.length < 4) continue;
    
    // Count how many header indicators match this row
    let matches = 0;
    for (const indicator of headerIndicators) {
      // Normalize whitespace before testing
      if (row.some(cell => {
        const normalized = (cell || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
        return indicator.test(normalized);
      })) {
        matches++;
      }
    }
    
    // If 3+ header indicators match, this is likely the header row
    if (matches >= 3) {
      return i;
    }
  }
  
  return 0; // Default to first row
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

  // Find the actual header row (TCGPlayer exports have metadata rows before headers)
  const headerRowIndex = findHeaderRow(allRows);
  const headerRow = allRows[headerRowIndex];
  
  // Debug logging
  console.log('[CSV Parser] Total rows:', allRows.length);
  console.log('[CSV Parser] Header row index:', headerRowIndex);
  console.log('[CSV Parser] Header row:', headerRow);
  
  // Try header-based detection first
  const headerMappings = fuzzyMatchHeaders(headerRow);
  
  console.log('[CSV Parser] Header mappings:', headerMappings.map(m => ({
    index: m.sourceIndex,
    header: headerRow[m.sourceIndex],
    field: m.targetField,
    confidence: m.confidence
  })));
  
  if (headerMappings.length >= 4) { // Need at least 4 recognized fields for header-based
    mappings = headerMappings;
    schema = headerMappings.length >= 8 ? 'full' : 'short';
    confidence = headerMappings.reduce((sum, m) => sum + m.confidence, 0) / headerMappings.length * 100;
    dataStartRow = headerRowIndex + 1; // Data starts after the header row
    
    if (headerRowIndex > 0) {
      suggestions.push(`Skipped ${headerRowIndex} metadata rows before headers`);
    }
  } else {
    // Try positional detection (treat first row as data)
    const positionalResult = detectPositionalMapping(allRows.slice(headerRowIndex));
    if (positionalResult.confidence > 0.5) {
      mappings = positionalResult.mappings;
      schema = 'positional';
      confidence = positionalResult.confidence * 100;
      dataStartRow = headerRowIndex;
      
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
    
    // Skip rows with insufficient data (likely footer/metadata rows)
    const nonEmptyCount = row.filter(cell => cell && cell.trim()).length;
    if (nonEmptyCount < 4) {
      skippedRows++;
      continue; // Silently skip sparse rows
    }
    
    // Skip TCGPlayer footer content
    const rowText = row.join(' ').toLowerCase();
    if (rowText.includes('total:') || rowText.includes('prices from') || 
        rowText.includes('market price on') || rowText.includes('tcgplayer.com')) {
      skippedRows++;
      continue; // Silently skip footer rows
    }
    
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
      
      // Validate required fields - only report as error if row looked like data
      const missingRequired: string[] = [];
      if (!normalized.id) missingRequired.push('ID');
      if (!normalized.line) missingRequired.push('Product Line');
      if (!normalized.set) missingRequired.push('Set');
      if (!normalized.name) missingRequired.push('Name');
      
      if (missingRequired.length > 0) {
        // Only add error if at least one required field was present (looks like intended data)
        const hasAnyRequiredField = normalized.id || normalized.line || normalized.set || normalized.name;
        if (hasAnyRequiredField) {
          errors.push({
            row: i + 1,
            reason: `Missing required fields: ${missingRequired.join(', ')}`,
            data: row,
            confidence: confidence
          });
        }
        skippedRows++;
        continue;
      }

      // Create complete normalized card with defaults
      // Quantity fallback: use addQuantity if quantity is 0/empty, default to 1
      let finalQuantity = normalized.quantity;
      if (!finalQuantity || finalQuantity === 0) {
        finalQuantity = normalized.addQuantity || 1;
      }

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
        quantity: finalQuantity,
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