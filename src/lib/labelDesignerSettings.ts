/**
 * Utility to read Label Designer settings from localStorage
 * This ensures the batch queue uses the same settings as the Label Designer
 */

import { LabelFieldConfig } from "@/lib/labelRenderer";

export interface LabelDesignerSettings {
  fieldConfig: LabelFieldConfig;
  showGuides: boolean;
}

export function getLabelDesignerSettings(): LabelDesignerSettings {
  try {
    // Read settings from localStorage (same keys used in LabelDesigner.tsx)
    // Default to true if key doesn't exist (missing localStorage keys)
    const includeTitle = localStorage.getItem('field-title') !== 'false';
    const includeSku = localStorage.getItem('field-sku') !== 'false';
    const includePrice = localStorage.getItem('field-price') !== 'false';
    const includeLot = localStorage.getItem('field-lot') !== 'false';
    const includeCondition = localStorage.getItem('field-condition') !== 'false';
    const barcodeMode = localStorage.getItem('barcode-mode') || 'barcode';
    const showGuides = localStorage.getItem('labelDesigner_showGuides') === 'true';

    console.log('Label Designer Settings loaded:', {
      includeTitle,
      includeSku,
      includePrice,
      includeLot,
      includeCondition,
      barcodeMode
    });

    return {
      fieldConfig: {
        includeTitle,
        includeSku,
        includePrice,
        includeLot,
        includeCondition,
        barcodeMode: barcodeMode as 'qr' | 'barcode' | 'none'
      },
      showGuides
    };
  } catch (error) {
    console.error('Error reading label designer settings:', error);
    
    // Return sensible defaults if localStorage fails
    return {
      fieldConfig: {
        includeTitle: true,
        includeSku: true,
        includePrice: true,
        includeLot: true,
        includeCondition: true,
        barcodeMode: 'barcode'
      },
      showGuides: false
    };
  }
}