export type CcgCard = {
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

export type CcgLookupResponse = {
  ok: boolean;
  data?: CcgCard;
  error?: string;
};