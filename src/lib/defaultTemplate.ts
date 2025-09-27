import { supabase } from '@/integrations/supabase/client';
import { useTemplateDefault } from '@/hooks/useTemplateDefault';

export interface DefaultTemplate {
  id: string;
  name: string;
  zpl: string;
  fieldConfig?: {
    includeTitle: boolean;
    includeSku: boolean;
    includePrice: boolean;
    includeLot: boolean;
    includeCondition: boolean;
    barcodeMode: 'qr' | 'barcode' | 'none';
  };
}

/**
 * Get the default template from database, fallback to code default
 */
export async function getDefaultTemplate(): Promise<DefaultTemplate> {
  try {
    // Try to get "Optimized Barcode Template" specifically first
    const { data: optimizedTemplate } = await supabase
      .from('label_templates')
      .select('*')
      .eq('template_type', 'raw')
      .eq('name', 'Optimized Barcode Template')
      .limit(1);
      
    if (optimizedTemplate && optimizedTemplate.length > 0) {
      const template = optimizedTemplate[0];
      const canvas = template.canvas as any;
      
      return {
        id: template.id,
        name: template.name,
        zpl: canvas?.zplLabel || '',
        fieldConfig: canvas?.fieldConfig || {
          includeTitle: true,
          includeSku: true,
          includePrice: true,
          includeLot: false,
          includeCondition: true,
          barcodeMode: 'barcode' as const
        }
      };
    }
    
    // Fallback to any default template
    const { data: templates } = await supabase
      .from('label_templates')
      .select('*')
      .eq('template_type', 'raw')
      .eq('is_default', true)
      .limit(1);
      
    if (templates && templates.length > 0) {
      const template = templates[0];
      const canvas = template.canvas as any;
      
      return {
        id: template.id,
        name: template.name,
        zpl: canvas?.zplLabel || '',
        fieldConfig: canvas?.fieldConfig || {
          includeTitle: true,
          includeSku: true,
          includePrice: true,
          includeLot: false,
          includeCondition: true,
          barcodeMode: 'barcode' as const
        }
      };
    }
  } catch (error) {
    console.error('Failed to load default template from database:', error);
  }
  
  // Fallback to code default
  const defaultTemplate = useTemplateDefault();
  const defaultZpl = `^XA
^PW406
^LL203
^LH0,0
^PR2
^MD0
^MNY
^MMC
^FO16,12^A0,28,28^FD{{CARDNAME}}^FS
^FO16,48^A0,24,24^FD{{CONDITION}}^FS
^FO160,48^A0,28,28^FD{{PRICE}}^FS
^FO16,78^A0,22,22^FD{{SKU}}^FS
^FO16,106^BY2^BCN,72,Y,N,N^FD{{BARCODE}}^FS
^XZ`;

  return {
    id: defaultTemplate.id,
    name: defaultTemplate.name,
    zpl: defaultZpl,
    fieldConfig: {
      includeTitle: true,
      includeSku: true,
      includePrice: true,
      includeLot: false,
      includeCondition: true,
      barcodeMode: 'barcode' as const
    }
  };
}

/**
 * Get template field config for printing
 */
export async function getDefaultTemplateFieldConfig() {
  const template = await getDefaultTemplate();
  return template.fieldConfig || {
    includeTitle: true,
    includeSku: true,
    includePrice: true,
    includeLot: false,
    includeCondition: true,
    barcodeMode: 'barcode' as const
  };
}