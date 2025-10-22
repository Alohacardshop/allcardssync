import Papa from 'papaparse';

export interface ClzComic {
  series: string;
  issue: string;
  variantDescription: string;
  publisher: string;
  releaseDate: string;
  format: string;
  addedDate: string;
}

export interface ClzParseResult {
  comics: ClzComic[];
  errors: Array<{ row: number; reason: string; data?: any }>;
  totalRows: number;
  skippedRows: number;
}

export function parseClzComicsCsv(csvText: string): ClzParseResult {
  const result: ClzParseResult = {
    comics: [],
    errors: [],
    totalRows: 0,
    skippedRows: 0
  };

  if (!csvText?.trim()) {
    result.errors.push({ row: 0, reason: 'Empty CSV file' });
    return result;
  }

  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => header.trim()
  });

  if (parsed.errors.length > 0) {
    parsed.errors.forEach((err: any) => {
      result.errors.push({
        row: err.row || 0,
        reason: err.message
      });
    });
  }

  result.totalRows = parsed.data.length;

  parsed.data.forEach((row: any, index: number) => {
    try {
      // Check if this is a CLZ Comics export format
      if (!row.Series && !row.Issue && !row.Publisher) {
        result.skippedRows++;
        return;
      }

      const comic: ClzComic = {
        series: row.Series?.trim() || '',
        issue: row.Issue?.trim() || '',
        variantDescription: row['Variant Description']?.trim() || '',
        publisher: row.Publisher?.trim() || '',
        releaseDate: row['Release Date']?.trim() || '',
        format: row.Format?.trim() || '',
        addedDate: row['Added Date']?.trim() || ''
      };

      // Basic validation
      if (!comic.series) {
        result.errors.push({
          row: index + 1,
          reason: 'Missing series name',
          data: row
        });
        result.skippedRows++;
        return;
      }

      result.comics.push(comic);
    } catch (error) {
      result.errors.push({
        row: index + 1,
        reason: error instanceof Error ? error.message : 'Unknown parsing error',
        data: row
      });
      result.skippedRows++;
    }
  });

  return result;
}

export function isValidClzComicsCsv(csvText: string): boolean {
  if (!csvText?.trim()) return false;
  
  const firstLine = csvText.split('\n')[0].toLowerCase();
  const requiredHeaders = ['series', 'issue', 'publisher'];
  
  return requiredHeaders.every(header => 
    firstLine.includes(header.toLowerCase())
  );
}
