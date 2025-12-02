/**
 * Document definitions for the Documents section
 * locationVisibility determines which users can see each document
 */

export type DocumentCategory = 'Handbook' | 'Procedure' | 'Policy';
export type LocationVisibility = 'ALL' | 'HAWAII' | 'LAS_VEGAS';

export interface Document {
  id: string;
  title: string;
  description: string;
  category: DocumentCategory;
  locationVisibility: LocationVisibility;
  url?: string;
  content?: string;
  updatedAt: string;
}

export const DOCUMENTS: Document[] = [
  {
    id: 'employee-handbook',
    title: 'Employee Handbook',
    description: 'General policies and guidelines for all employees',
    category: 'Handbook',
    locationVisibility: 'ALL',
    content: 'This is the employee handbook content. It covers company policies, benefits, and workplace expectations.',
    updatedAt: '2024-01-15',
  },
  {
    id: 'grading-guide',
    title: 'Card Grading Guide',
    description: 'How to assess and grade trading cards',
    category: 'Procedure',
    locationVisibility: 'ALL',
    content: 'This guide explains the grading process for trading cards, including condition assessment and pricing guidelines.',
    updatedAt: '2024-02-20',
  },
  {
    id: 'intake-procedures',
    title: 'Intake Procedures',
    description: 'Step-by-step guide for processing new inventory',
    category: 'Procedure',
    locationVisibility: 'ALL',
    content: 'Follow these steps when processing new inventory items: 1. Verify item condition 2. Enter into system 3. Print barcode labels',
    updatedAt: '2024-03-10',
  },
  {
    id: 'hawaii-opening',
    title: 'Hawaii Store Opening Procedures',
    description: 'Daily opening checklist for Hawaii location',
    category: 'Procedure',
    locationVisibility: 'HAWAII',
    content: 'Hawaii-specific opening procedures including register setup, display arrangement, and inventory checks.',
    updatedAt: '2024-03-01',
  },
  {
    id: 'hawaii-closing',
    title: 'Hawaii Store Closing Procedures',
    description: 'Daily closing checklist for Hawaii location',
    category: 'Procedure',
    locationVisibility: 'HAWAII',
    content: 'Hawaii-specific closing procedures including cash reconciliation, security checks, and reporting.',
    updatedAt: '2024-03-01',
  },
  {
    id: 'vegas-opening',
    title: 'Las Vegas Store Opening Procedures',
    description: 'Daily opening checklist for Las Vegas location',
    category: 'Procedure',
    locationVisibility: 'LAS_VEGAS',
    content: 'Las Vegas-specific opening procedures including register setup, display arrangement, and inventory checks.',
    updatedAt: '2024-03-05',
  },
  {
    id: 'vegas-closing',
    title: 'Las Vegas Store Closing Procedures',
    description: 'Daily closing checklist for Las Vegas location',
    category: 'Procedure',
    locationVisibility: 'LAS_VEGAS',
    content: 'Las Vegas-specific closing procedures including cash reconciliation, security checks, and reporting.',
    updatedAt: '2024-03-05',
  },
  {
    id: 'return-policy',
    title: 'Return Policy',
    description: 'Customer return and exchange guidelines',
    category: 'Policy',
    locationVisibility: 'ALL',
    content: 'Our return policy allows customers to return items within 30 days with original receipt. Graded cards are final sale.',
    updatedAt: '2024-01-01',
  },
  {
    id: 'pricing-policy',
    title: 'Pricing Policy',
    description: 'Guidelines for pricing inventory items',
    category: 'Policy',
    locationVisibility: 'ALL',
    content: 'Pricing guidelines based on market value, condition, and rarity. Always check TCGPlayer and recent sales for reference.',
    updatedAt: '2024-02-15',
  },
];

/**
 * Filter documents based on user's location
 */
export function filterDocumentsByLocation(
  documents: Document[],
  userRegion: string | null | undefined
): Document[] {
  return documents.filter(doc => {
    if (doc.locationVisibility === 'ALL') return true;
    if (doc.locationVisibility === 'HAWAII' && userRegion === 'hawaii') return true;
    if (doc.locationVisibility === 'LAS_VEGAS' && userRegion === 'las_vegas') return true;
    return false;
  });
}
