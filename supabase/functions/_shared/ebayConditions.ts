/**
 * eBay Condition Descriptors for Trading Cards
 * Based on eBay's official Trading Card condition requirements
 */

// eBay Condition IDs for Trading Cards
export const EBAY_CONDITION_IDS = {
  GRADED: '2750',      // Professionally Graded
  UNGRADED: '4000',    // Ungraded
  LIKE_NEW: '3000',    // Like New (legacy)
} as const;

// Professional Grader IDs (condition descriptor name: 27501)
export const EBAY_GRADER_IDS: Record<string, string> = {
  'PSA': '275010',
  'BGS': '275013',
  'BECKETT': '275013',
  'CGC': '275015',
  'SGC': '275016',
  'CSG': '275017',
  'HGA': '275019',
  'GMA': '275018',
  'KSA': '275020',
  'MNT': '275021',
  'TAG': '275022',
  'AGS': '275023',
  'CGA': '275024',
  'EGS': '275025',
  'RCG': '275026',
  'WSG': '275027',
  'BCCG': '275028',
  'CGCCOMICS': '275029',
  'CBCS': '275030',
} as const;

// Grade Value IDs (condition descriptor name: 27502)
// Maps numeric grades to eBay's grade IDs
export const EBAY_GRADE_IDS: Record<string, string> = {
  // PSA/Standard grades
  '10': '275110',
  '9.5': '275108',
  '9': '275106',
  '8.5': '275104',
  '8': '275102',
  '7.5': '275100',
  '7': '275098',
  '6.5': '275096',
  '6': '275094',
  '5.5': '275092',
  '5': '275090',
  '4.5': '275088',
  '4': '275086',
  '3.5': '275084',
  '3': '275082',
  '2.5': '275080',
  '2': '275078',
  '1.5': '275076',
  '1': '275074',
  'AUTHENTIC': '275112',
  'A': '275112',
  // BGS/Beckett perfect grades
  '10 PRISTINE': '275116',
  '10 BLACK LABEL': '275114',
  // PSA qualifiers
  'OC': '275072',  // Off-Center
  'MC': '275070',  // Miscut
  'ST': '275068',  // Stain
  'PD': '275066',  // Print Defect
  'MK': '275064',  // Marked
} as const;

// Ungraded Card Condition IDs (for condition 4000)
export const EBAY_UNGRADED_CONDITION_IDS: Record<string, string> = {
  'MINT': '400002',
  'NEAR_MINT': '400004',
  'NM': '400004',
  'NEAR MINT': '400004',
  'EXCELLENT': '400006',
  'EX': '400006',
  'VERY_GOOD': '400008',
  'VG': '400008',
  'GOOD': '400010',
  'G': '400010',
  'FAIR': '400012',
  'POOR': '400014',
  'LIGHTLY_PLAYED': '400006',
  'LP': '400006',
  'MODERATELY_PLAYED': '400008',
  'MP': '400008',
  'HEAVILY_PLAYED': '400010',
  'HP': '400010',
  'DAMAGED': '400014',
} as const;

// Common eBay Category IDs
export const EBAY_CATEGORY_IDS = {
  // Trading Cards
  CCG_INDIVIDUAL_CARDS: '183454',      // Pokemon, MTG, Yu-Gi-Oh, etc.
  SPORTS_TRADING_CARDS: '261328',       // Baseball, Basketball, Football, etc.
  NON_SPORT_TRADING_CARDS: '183050',    // Marvel, DC, Movies, etc.
  
  // Sports-specific categories
  BASEBALL_CARDS: '213',
  BASKETBALL_CARDS: '214215',
  FOOTBALL_CARDS: '215',
  HOCKEY_CARDS: '216',
  SOCCER_CARDS: '218',
  RACING_CARDS: '217',
  WRESTLING_CARDS: '183062',
  
  // Comics
  COMIC_BOOKS: '63',
  GRADED_COMIC_BOOKS: '259061',
  BRONZE_AGE_COMICS: '260',
  SILVER_AGE_COMICS: '137939',
  MODERN_AGE_COMICS: '138973',
  GOLDEN_AGE_COMICS: '137938',
  
  // Sports Memorabilia
  SPORTS_MEMORABILIA: '64482',
} as const;

// Comic Grader IDs (different from card graders)
export const EBAY_COMIC_GRADER_IDS: Record<string, string> = {
  'CGC': '400022',      // CGC Comics (different from CGC cards)
  'CBCS': '400023',     // CBCS
  'PGX': '400024',      // PGX
  'EGS': '400025',      // EGS Comics
} as const;

// Comic Grade IDs (condition descriptor name: 40002)
export const EBAY_COMIC_GRADE_IDS: Record<string, string> = {
  '10.0': '400200',
  '9.9': '400199',
  '9.8': '400198',
  '9.6': '400196',
  '9.4': '400194',
  '9.2': '400192',
  '9.0': '400190',
  '8.5': '400185',
  '8.0': '400180',
  '7.5': '400175',
  '7.0': '400170',
  '6.5': '400165',
  '6.0': '400160',
  '5.5': '400155',
  '5.0': '400150',
  '4.5': '400145',
  '4.0': '400140',
  '3.5': '400135',
  '3.0': '400130',
  '2.5': '400125',
  '2.0': '400120',
  '1.8': '400118',
  '1.5': '400115',
  '1.0': '400110',
  '0.5': '400105',
} as const;

// Sports Card specific brands for detection
export const SPORTS_BRAND_PATTERNS = {
  baseball: ['Topps', 'Bowman', 'Donruss', 'Fleer', 'Upper Deck', 'Leaf', 'Stadium Club', 'Finest', 'Chrome', 'Heritage'],
  basketball: ['Panini', 'Prizm', 'Select', 'Mosaic', 'Optic', 'Hoops', 'Donruss', 'Court Kings', 'National Treasures', 'Immaculate'],
  football: ['Panini', 'Prizm', 'Select', 'Mosaic', 'Optic', 'Contenders', 'Score', 'Donruss', 'Playbook'],
  hockey: ['Upper Deck', 'O-Pee-Chee', 'SP Authentic', 'Young Guns', 'Parkhurst'],
  soccer: ['Panini', 'Topps', 'Donruss', 'Prizm', 'Select', 'Merlin'],
} as const;

// Brand patterns for category auto-detection
export const CATEGORY_BRAND_PATTERNS = {
  tcg: [
    'Pokemon', 'Pokémon', 'MTG', 'Magic', 'Magic the Gathering', 'Magic: The Gathering',
    'Yu-Gi-Oh', 'Yugioh', 'Yu-Gi-Oh!', 'One Piece', 'Dragon Ball', 'Dragon Ball Super',
    'Weiss Schwarz', 'Cardfight', 'Vanguard', 'Flesh and Blood', 'Lorcana', 'Disney Lorcana',
    'Digimon', 'Final Fantasy', 'Union Arena', 'Battle Spirits', 'Star Wars Unlimited',
    'MetaZoo', 'Sorcery', 'Grand Archive'
  ],
  sports: [
    'Topps', 'Panini', 'Upper Deck', 'Bowman', 'Donruss', 'Prizm', 'Select', 'Fleer',
    'Score', 'Leaf', 'Contenders', 'Mosaic', 'Optic', 'National Treasures', 'Immaculate',
    'Chronicles', 'Court Kings', 'Hoops', 'Finest', 'Chrome', 'Obsidian', 'Revolution',
    'Stadium Club'
  ],
  comics: [
    'Marvel', 'DC', 'DC Comics', 'Image', 'Image Comics', 'Dark Horse', 'IDW', 'Valiant',
    'Boom', 'BOOM! Studios', 'Dynamite', 'Archie', 'Oni Press', 'AfterShock'
  ]
} as const;

/**
 * Get eBay grader ID from grading company name
 */
export function getGraderIdFromCompany(company: string | null | undefined): string | null {
  if (!company) return null;
  const normalized = company.toUpperCase().replace(/[^A-Z]/g, '');
  return EBAY_GRADER_IDS[normalized] || null;
}

/**
 * Get eBay grade ID from grade string
 */
export function getGradeId(grade: string | null | undefined): string | null {
  if (!grade) return null;
  const normalized = grade.toUpperCase().trim();
  
  // Direct match first
  if (EBAY_GRADE_IDS[normalized]) {
    return EBAY_GRADE_IDS[normalized];
  }
  
  // Try numeric extraction
  const numMatch = normalized.match(/^(\d+\.?\d*)/);
  if (numMatch) {
    const numGrade = numMatch[1];
    if (EBAY_GRADE_IDS[numGrade]) {
      return EBAY_GRADE_IDS[numGrade];
    }
  }
  
  // Check for 'AUTHENTIC' or 'A' grade
  if (normalized.includes('AUTH') || normalized === 'A') {
    return EBAY_GRADE_IDS['AUTHENTIC'];
  }
  
  return null;
}

/**
 * Build condition descriptors for graded cards
 */
export function buildGradedConditionDescriptors(
  gradingCompany: string | null | undefined,
  grade: string | null | undefined,
  certNumber: string | null | undefined
): Array<{ name: string; values?: string[]; additionalInfo?: string }> {
  const descriptors: Array<{ name: string; values?: string[]; additionalInfo?: string }> = [];
  
  // Professional Grader (required)
  const graderId = getGraderIdFromCompany(gradingCompany);
  if (graderId) {
    descriptors.push({
      name: '27501', // Professional Grader
      values: [graderId]
    });
  }
  
  // Grade (required)
  const gradeId = getGradeId(grade);
  if (gradeId) {
    descriptors.push({
      name: '27502', // Grade
      values: [gradeId]
    });
  }
  
  // Certification Number (optional but recommended)
  if (certNumber) {
    descriptors.push({
      name: '27503', // Certification Number
      additionalInfo: certNumber
    });
  }
  
  return descriptors;
}

/**
 * Detect main category based on brand name
 */
export function detectCategoryFromBrand(brand: string | null | undefined): 'tcg' | 'sports' | 'comics' | null {
  if (!brand) return null;
  
  const normalizedBrand = brand.toLowerCase();
  
  for (const pattern of CATEGORY_BRAND_PATTERNS.tcg) {
    if (normalizedBrand.includes(pattern.toLowerCase())) {
      return 'tcg';
    }
  }
  
  for (const pattern of CATEGORY_BRAND_PATTERNS.sports) {
    if (normalizedBrand.includes(pattern.toLowerCase())) {
      return 'sports';
    }
  }
  
  for (const pattern of CATEGORY_BRAND_PATTERNS.comics) {
    if (normalizedBrand.includes(pattern.toLowerCase())) {
      return 'comics';
    }
  }
  
  return null;
}

/**
 * Get eBay category ID from detected category
 */
export function getEbayCategoryId(category: 'tcg' | 'sports' | 'comics' | null, isGraded: boolean = false): string {
  switch (category) {
    case 'tcg':
      return EBAY_CATEGORY_IDS.CCG_INDIVIDUAL_CARDS;
    case 'sports':
      return EBAY_CATEGORY_IDS.SPORTS_TRADING_CARDS;
    case 'comics':
      return isGraded ? EBAY_CATEGORY_IDS.GRADED_COMIC_BOOKS : EBAY_CATEGORY_IDS.COMIC_BOOKS;
    default:
      return EBAY_CATEGORY_IDS.CCG_INDIVIDUAL_CARDS; // Default to CCG
  }
}

/**
 * Build item aspects for trading cards (TCG - Pokemon, MTG, etc.)
 */
export function buildTradingCardAspects(item: {
  year?: string | null;
  subject?: string | null;
  brand_title?: string | null;
  card_number?: string | null;
  grade?: string | null;
  grading_company?: string | null;
  psa_cert?: string | null;
  variant?: string | null;
}): Record<string, string[]> {
  const aspects: Record<string, string[]> = {};
  
  if (item.year) {
    aspects['Year Manufactured'] = [item.year];
  }
  
  if (item.subject) {
    aspects['Character'] = [item.subject];
    aspects['Card Name'] = [item.subject];
  }
  
  if (item.brand_title) {
    aspects['Manufacturer'] = [item.brand_title];
    aspects['Set'] = [item.brand_title];
  }
  
  if (item.card_number) {
    aspects['Card Number'] = [String(item.card_number)];
  }
  
  if (item.variant) {
    aspects['Parallel/Variety'] = [item.variant];
  }
  
  if (item.grade && item.grading_company) {
    aspects['Professional Grader'] = [item.grading_company];
    aspects['Grade'] = [item.grade];
  }
  
  if (item.psa_cert) {
    aspects['Certification Number'] = [item.psa_cert];
  }
  
  return aspects;
}

/**
 * Build item aspects for sports cards
 */
export function buildSportsCardAspects(item: {
  year?: string | null;
  subject?: string | null;
  brand_title?: string | null;
  card_number?: string | null;
  grade?: string | null;
  grading_company?: string | null;
  psa_cert?: string | null;
  variant?: string | null;
  team?: string | null;
  sport?: string | null;
}): Record<string, string[]> {
  const aspects: Record<string, string[]> = {};
  
  if (item.year) {
    aspects['Year Manufactured'] = [item.year];
    aspects['Season'] = [item.year];
  }
  
  if (item.subject) {
    aspects['Player/Athlete'] = [item.subject];
  }
  
  if (item.brand_title) {
    aspects['Manufacturer'] = [item.brand_title];
    aspects['Set'] = [item.brand_title];
  }
  
  if (item.card_number) {
    aspects['Card Number'] = [String(item.card_number)];
  }
  
  if (item.variant) {
    aspects['Parallel/Variety'] = [item.variant];
  }
  
  if (item.team) {
    aspects['Team'] = [item.team];
  }
  
  if (item.sport) {
    aspects['Sport'] = [item.sport];
  }
  
  if (item.grade && item.grading_company) {
    aspects['Professional Grader'] = [item.grading_company];
    aspects['Grade'] = [item.grade];
  }
  
  if (item.psa_cert) {
    aspects['Certification Number'] = [item.psa_cert];
  }
  
  // Common sports card aspects
  aspects['Card Condition'] = item.grade ? ['Graded'] : ['Ungraded'];
  aspects['Original/Reprint'] = ['Original'];
  
  return aspects;
}

/**
 * Build item aspects for graded comics
 */
export function buildComicAspects(item: {
  year?: string | null;
  subject?: string | null;
  brand_title?: string | null;
  card_number?: string | null; // Issue number for comics
  grade?: string | null;
  grading_company?: string | null;
  cgc_cert?: string | null;
  variant?: string | null;
}): Record<string, string[]> {
  const aspects: Record<string, string[]> = {};
  
  if (item.year) {
    aspects['Publication Year'] = [item.year];
  }
  
  if (item.subject) {
    aspects['Title'] = [item.subject];
  }
  
  if (item.brand_title) {
    aspects['Publisher'] = [item.brand_title];
  }
  
  if (item.card_number) {
    aspects['Issue Number'] = [String(item.card_number)];
  }
  
  if (item.variant) {
    aspects['Variant Cover'] = [item.variant];
  }
  
  if (item.grade && item.grading_company) {
    aspects['Grader'] = [item.grading_company];
    aspects['Grade'] = [item.grade];
  }
  
  if (item.cgc_cert) {
    aspects['Certification Number'] = [item.cgc_cert];
  }
  
  // Comic-specific aspects
  aspects['Format'] = ['Single Issue'];
  aspects['Type'] = ['Comic Book'];
  
  return aspects;
}

/**
 * Build condition descriptors for graded comics
 */
export function buildComicConditionDescriptors(
  gradingCompany: string | null | undefined,
  grade: string | null | undefined,
  certNumber: string | null | undefined
): Array<{ name: string; values?: string[]; additionalInfo?: string }> {
  const descriptors: Array<{ name: string; values?: string[]; additionalInfo?: string }> = [];
  
  if (!gradingCompany) return descriptors;
  
  // Comic Grader
  const normalized = gradingCompany.toUpperCase().replace(/[^A-Z]/g, '');
  const graderId = EBAY_COMIC_GRADER_IDS[normalized];
  if (graderId) {
    descriptors.push({
      name: '40001', // Comic Grader
      values: [graderId]
    });
  }
  
  // Comic Grade
  if (grade) {
    const gradeNormalized = grade.replace(/[^\d.]/g, '');
    const gradeId = EBAY_COMIC_GRADE_IDS[gradeNormalized];
    if (gradeId) {
      descriptors.push({
        name: '40002', // Comic Grade
        values: [gradeId]
      });
    }
  }
  
  // Certification Number
  if (certNumber) {
    descriptors.push({
      name: '40003', // Comic Certification Number
      additionalInfo: certNumber
    });
  }
  
  return descriptors;
}

/**
 * Detect sport type from brand name
 */
export function detectSportFromBrand(brand: string | null | undefined): string | null {
  if (!brand) return null;
  const normalizedBrand = brand.toLowerCase();
  
  for (const [sport, patterns] of Object.entries(SPORTS_BRAND_PATTERNS)) {
    for (const pattern of patterns) {
      if (normalizedBrand.includes(pattern.toLowerCase())) {
        return sport;
      }
    }
  }
  return null;
}

/**
 * Get sports-specific eBay category ID
 */
export function getSportsCardCategoryId(sport: string | null): string {
  switch (sport) {
    case 'baseball':
      return EBAY_CATEGORY_IDS.BASEBALL_CARDS;
    case 'basketball':
      return EBAY_CATEGORY_IDS.BASKETBALL_CARDS;
    case 'football':
      return EBAY_CATEGORY_IDS.FOOTBALL_CARDS;
    case 'hockey':
      return EBAY_CATEGORY_IDS.HOCKEY_CARDS;
    case 'soccer':
      return EBAY_CATEGORY_IDS.SOCCER_CARDS;
    default:
      return EBAY_CATEGORY_IDS.SPORTS_TRADING_CARDS;
  }
}
