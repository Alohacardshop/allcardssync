// Code-defined label templates for reliable TSPL printing
import { buildTSPL, TSPLOptions, generateBoxedLayoutTSPL } from './tspl';

export interface LabelData {
  title?: string;
  sku?: string;
  price?: string;
  lot?: string;
  condition?: string;
  barcode?: string;
}

export interface TSPLSettings {
  density?: number; // 0-15, default 10
  speed?: number;   // 2-8, default 4  
  gapInches?: number;
}

export interface LabelTemplate {
  id: string;
  name: string;
  description: string;
  generateTSPL: (data: LabelData, settings?: TSPLSettings) => string;
}

// Standard graded card template
export const gradedCardTemplate: LabelTemplate = {
  id: 'graded-card',
  name: 'Graded Card',
  description: 'Standard template for graded trading cards with title, condition, price, and barcode',
  generateTSPL: (data: LabelData, settings?: TSPLSettings): string => {
    const textLines: TSPLOptions['textLines'] = [];
    
    // Title - main heading
    if (data.title) {
      textLines.push({ 
        text: data.title.slice(0, 25), // Truncate to fit 2" width
        x: 10, 
        y: 10, 
        fontSize: 2 
      });
    }
    
    // SKU on left side
    if (data.sku) {
      textLines.push({ 
        text: `SKU: ${data.sku}`, 
        x: 10, 
        y: 40, 
        fontSize: 1 
      });
    }
    
    // Condition on right side
    if (data.condition) {
      textLines.push({ 
        text: data.condition, 
        x: 200, 
        y: 40, 
        fontSize: 1 
      });
    }
    
    // Lot number
    if (data.lot) {
      textLines.push({ 
        text: `LOT: ${data.lot}`, 
        x: 10, 
        y: 60, 
        fontSize: 1 
      });
    }
    
    // Price - prominent on right
    if (data.price) {
      const priceText = data.price.startsWith('$') ? data.price : `$${data.price}`;
      textLines.push({ 
        text: priceText, 
        x: 280, 
        y: 10, 
        fontSize: 3 
      });
    }

    const options: TSPLOptions = { 
      textLines,
      ...settings
    };
    
    // QR Code for barcode
    if (data.barcode) {
      options.qrcode = {
        data: data.barcode,
        x: 10,
        y: 90,
        size: 'M'
      };
    }

    return buildTSPL(options);
  }
};

// Compact template for smaller items
export const compactTemplate: LabelTemplate = {
  id: 'compact',
  name: 'Compact',
  description: 'Minimal template focusing on essential information',
  generateTSPL: (data: LabelData, settings?: TSPLSettings): string => {
    const textLines: TSPLOptions['textLines'] = [];
    
    // Title - smaller font
    if (data.title) {
      textLines.push({ 
        text: data.title.slice(0, 30),
        x: 10, 
        y: 5, 
        fontSize: 1 
      });
    }
    
    // Price and condition on same line
    let middleLine = '';
    if (data.price) {
      middleLine += data.price.startsWith('$') ? data.price : `$${data.price}`;
    }
    if (data.condition) {
      middleLine += middleLine ? ` • ${data.condition}` : data.condition;
    }
    if (middleLine) {
      textLines.push({ 
        text: middleLine, 
        x: 10, 
        y: 25, 
        fontSize: 2 
      });
    }
    
    // SKU small at bottom
    if (data.sku) {
      textLines.push({ 
        text: `SKU: ${data.sku}`, 
        x: 10, 
        y: 50, 
        fontSize: 1 
      });
    }

    const options: TSPLOptions = { 
      textLines,
      ...settings
    };
    
    // QR Code positioned on right
    if (data.barcode) {
      options.qrcode = {
        data: data.barcode,
        x: 250,
        y: 70,
        size: 'S'
      };
    }

    return buildTSPL(options);
  }
};

// Price tag template
export const priceTagTemplate: LabelTemplate = {
  id: 'price-tag',
  name: 'Price Tag',
  description: 'Focus on price with minimal other information',
  generateTSPL: (data: LabelData, settings?: TSPLSettings): string => {
    const textLines: TSPLOptions['textLines'] = [];
    
    // Large price display
    if (data.price) {
      const priceText = data.price.startsWith('$') ? data.price : `$${data.price}`;
      textLines.push({ 
        text: priceText, 
        x: 50, 
        y: 30, 
        fontSize: 5 
      });
    }
    
    // Small title below
    if (data.title) {
      textLines.push({ 
        text: data.title.slice(0, 35),
        x: 10, 
        y: 80, 
        fontSize: 1 
      });
    }
    
    // Condition if available
    if (data.condition) {
      textLines.push({ 
        text: data.condition, 
        x: 10, 
        y: 100, 
        fontSize: 1 
      });
    }

    const options: TSPLOptions = { 
      textLines,
      ...settings
    };
    
    // Small QR code in corner
    if (data.barcode) {
      options.qrcode = {
        data: data.barcode,
        x: 320,
        y: 100,
        size: 'S'
      };
    }

    return buildTSPL(options);
  }
};

// Inventory template with focus on tracking
export const inventoryTemplate: LabelTemplate = {
  id: 'inventory',
  name: 'Inventory',
  description: 'Template for inventory tracking with lot numbers and SKUs',
  generateTSPL: (data: LabelData, settings?: TSPLSettings): string => {
    const textLines: TSPLOptions['textLines'] = [];
    
    // Title
    if (data.title) {
      textLines.push({ 
        text: data.title.slice(0, 25),
        x: 10, 
        y: 5, 
        fontSize: 2 
      });
    }
    
    // SKU prominent
    if (data.sku) {
      textLines.push({ 
        text: `SKU: ${data.sku}`, 
        x: 10, 
        y: 35, 
        fontSize: 2 
      });
    }
    
    // Lot number
    if (data.lot) {
      textLines.push({ 
        text: `LOT: ${data.lot}`, 
        x: 10, 
        y: 60, 
        fontSize: 2 
      });
    }
    
    // Price smaller
    if (data.price) {
      const priceText = data.price.startsWith('$') ? data.price : `$${data.price}`;
      textLines.push({ 
        text: priceText, 
        x: 280, 
        y: 35, 
        fontSize: 2 
      });
    }

    const options: TSPLOptions = { 
      textLines,
      ...settings
    };
    
    // Large QR code for scanning
    if (data.barcode) {
      options.qrcode = {
        data: data.barcode,
        x: 10,
        y: 90,
        size: 'L'
      };
    }

    return buildTSPL(options);
  }
};

// Boxed layout template matching the uploaded image
export const boxedLayoutTemplate: LabelTemplate = {
  id: 'boxed-layout',
  name: 'Boxed Layout',
  description: 'Template with defined boxes for condition, price, barcode, and title with dynamic text sizing',
  generateTSPL: (data: LabelData, settings?: TSPLSettings): string => {
    return generateBoxedLayoutTSPL(data, {
      includeTitle: !!data.title,
      includeSku: !!data.sku, // Enable SKU below barcode
      includePrice: !!data.price,
      includeLot: false, // Not used in this layout
      includeCondition: !!data.condition,
      barcodeMode: data.barcode ? 'barcode' : 'none' // Use barcode instead of QR for better scanning
    }, settings);
  }
};

// Available templates
export const AVAILABLE_TEMPLATES: LabelTemplate[] = [
  gradedCardTemplate,
  compactTemplate,
  priceTagTemplate,
  inventoryTemplate,
  boxedLayoutTemplate
];

// Get template by ID
export function getTemplate(id: string): LabelTemplate | undefined {
  return AVAILABLE_TEMPLATES.find(t => t.id === id);
}

// Generate TSPL from template and data
export function generateLabelTSPL(
  templateId: string, 
  data: LabelData, 
  settings?: TSPLSettings
): string {
  const template = getTemplate(templateId);
  if (!template) {
    throw new Error(`Template "${templateId}" not found`);
  }
  return template.generateTSPL(data, settings);
}