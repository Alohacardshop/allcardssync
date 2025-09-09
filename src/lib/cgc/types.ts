export type CgcCard = {
  certNumber: string;
  grade: { 
    displayGrade: string; 
    autographGrade?: string | null; 
    autographType?: string | null;
  };
  collectible: {
    collectibleType?: string;
    collectibleSubtype?: string;
    cardName?: string;
    cardNumber?: string;
    cardYear?: string;
    game?: string;
    seriesName?: string;
    setName?: string;
    subsetName?: string;
    makerName?: string;
    language?: string;
    rarity?: string;
    isParallel?: boolean;
  };
  population?: {
    populationAtGrade?: number;
  };
  images?: {
    frontUrl?: string; 
    frontThumbnailUrl?: string;
    rearUrl?: string; 
    rearThumbnailUrl?: string;
  };
  metadata?: { 
    gradedDate?: string; 
    encapsulationDate?: string; 
    submissionNumber?: string; 
    barcode?: string;
  };
};

export type CgcLookupResponse = {
  ok: boolean;
  data?: CgcCard;
  error?: string;
  diagnostics?: {
    used?: string;
    firecrawlMs?: number;
    totalMs?: number;
  };
};

export type CgcLookupResult = {
  card: CgcCard;
  diagnostics?: {
    used?: string;
    firecrawlMs?: number;
    totalMs?: number;
  };
};