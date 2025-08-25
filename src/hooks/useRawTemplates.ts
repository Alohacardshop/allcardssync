import { useTemplates } from './useTemplates';
import { useEffect } from 'react';
import { getLabelDesignerSettings } from '@/lib/labelDesignerSettings';

/**
 * Hook specifically for 'raw' template type used by Label Designer
 * Handles initialization and persistence of current layout
 */
export function useRawTemplates() {
  const templatesHook = useTemplates('raw');
  const { templates, defaultTemplate, saveTemplate, setAsDefault, loading } = templatesHook;

  // Initialize default raw template if none exists
  const initializeDefaultRawTemplate = async () => {
    if (loading || templates.length > 0) return;

    // Use normalized field config with all fields enabled for default template
    const normalizedConfig = {
      includeTitle: true,
      includeSku: true,
      includePrice: true,
      includeLot: true,
      includeCondition: true,
      barcodeMode: 'barcode' as const
    };
    
    console.log('Creating default raw template with normalized config:', normalizedConfig);
    
    // Create default raw template with all fields enabled
    const result = await saveTemplate(
      'Optimized Barcode Template',
      normalizedConfig,
      {
        title: "POKEMON GENGAR VMAX #020",
        sku: "120979260", 
        price: "1000",
        lot: "LOT-000001",
        condition: "Near Mint",
        barcode: "120979260"
      },
      { density: 10, speed: 4, gapInches: 0 }
    );

    if (result.success) {
      // Set as default since it's the default template
      const savedTemplate = result.template;
      if (savedTemplate) {
        await setAsDefault(savedTemplate.id);
      }
    }
  };

  // Auto-initialize when templates are loaded
  useEffect(() => {
    if (!loading && templates.length === 0) {
      initializeDefaultRawTemplate();
    }
  }, [loading, templates.length]);

  return {
    ...templatesHook,
    initializeDefaultRawTemplate
  };
}