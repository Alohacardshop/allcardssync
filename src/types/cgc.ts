export interface CGCCertificateData {
  certNumber: string;
  isValid: boolean;
  grade?: string;
  title?: string;
  issueNumber?: string;
  issueDate?: string;
  year?: number;
  publisher?: string;
  cardNumber?: string;
  cardName?: string;
  setName?: string;
  seriesName?: string;
  autographGrade?: string;
  label?: string;
  barcode?: string;
  certVerificationUrl?: string;
  pageQuality?: string;
  artComments?: string[];
  keyComments?: string[];
  graderNotes?: string[];
  gradeDate?: string;
  graderSignatures?: string[];
  images?: {
    front?: string;
    rear?: string;
  };
  populationReport?: {
    higherGrades?: number;
    sameGrade?: number;
    totalGraded?: number;
  };
}

export interface CGCCertificateResponse {
  ok: boolean;
  error?: string;
  data?: CGCCertificateData;
  message?: string;
}

export const CGC_GRADE_COLORS: Record<string, string> = {
  '10.0': 'hsl(var(--chart-1))', // Gem Mint
  '9.9': 'hsl(var(--chart-1))',
  '9.8': 'hsl(var(--chart-2))', // Near Mint/Mint
  '9.6': 'hsl(var(--chart-2))',
  '9.4': 'hsl(var(--chart-2))',
  '9.2': 'hsl(var(--chart-3))', // Near Mint
  '9.0': 'hsl(var(--chart-3))',
  '8.5': 'hsl(var(--chart-3))',
  '8.0': 'hsl(var(--chart-4))', // Very Fine
  '7.5': 'hsl(var(--chart-4))',
  '7.0': 'hsl(var(--chart-4))',
  '6.5': 'hsl(var(--chart-5))', // Fine
  '6.0': 'hsl(var(--chart-5))',
};
