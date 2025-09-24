import { LabelTemplate } from './types';
import { elementsToZpl, zplToElements } from './zplElementConverter';

const LS_KEY = 'label-templates/v1';

export function loadLocalTemplates(): Record<string, LabelTemplate> {
  try { 
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); 
  } catch { 
    return {}; 
  }
}

export function saveLocalTemplate(t: LabelTemplate) {
  // Convert elements format to ZPL for storage
  let templateToSave = { ...t };
  if (t.format === 'elements' && t.layout) {
    templateToSave = {
      ...t,
      format: 'zpl',
      zpl: elementsToZpl(t.layout),
      layout: undefined // Remove layout, store only ZPL
    };
  }
  
  const all = loadLocalTemplates();
  all[templateToSave.id] = { ...templateToSave, scope: 'local', updated_at: new Date().toISOString() };
  localStorage.setItem(LS_KEY, JSON.stringify(all));
}

export async function loadOrgTemplate(id: string): Promise<LabelTemplate | null> {
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    const { data, error } = await supabase
      .from('label_templates')
      .select('canvas, name, is_default')
      .eq('id', id)
      .maybeSingle();
    
    if (error || !data?.canvas) return null;
    
    // Convert from existing schema - now everything loads as ZPL
    const canvas = data.canvas as any;
    let zpl: string | undefined;
    
    if (typeof canvas === 'string') {
      // Direct ZPL string
      zpl = canvas;
    } else if (canvas?.zplLabel) {
      // Legacy zplLabel format
      if (typeof canvas.zplLabel === 'string') {
        zpl = canvas.zplLabel;
      } else if (canvas.zplLabel?.elements) {
        // Convert elements to ZPL
        zpl = elementsToZpl({
          dpi: canvas.zplLabel.dpi || 203,
          width: canvas.zplLabel.width || 406,
          height: canvas.zplLabel.height || 203,
          elements: canvas.zplLabel.elements
        });
      }
    } else if (canvas?.elements) {
      // Legacy elements format - convert to ZPL
      zpl = elementsToZpl({
        dpi: 203,
        width: 406,
        height: 203,
        elements: canvas.elements
      });
    }
    
    if (zpl) {
      return {
        id,
        name: data.name || id,
        type: id,
        format: 'zpl',
        zpl,
        is_default: data.is_default,
        scope: 'org'
      };
    }
    
    return null;
  } catch (error) {
    console.error('Failed to load org template:', error);
    return null;
  }
}

export async function saveOrgTemplate(t: LabelTemplate) {
  const { supabase } = await import('@/integrations/supabase/client');
  
  // Convert elements format to ZPL for storage
  let zplToSave: string;
  if (t.format === 'elements' && t.layout) {
    zplToSave = elementsToZpl(t.layout);
  } else if (t.format === 'zpl' && t.zpl) {
    zplToSave = t.zpl;
  } else {
    throw new Error('Template must have either elements layout or ZPL string');
  }
  
  // Store as ZPL string in the canvas field
  await supabase.from('label_templates').upsert({
    id: t.id,
    name: t.name,
    template_type: 'general',
    canvas: zplToSave, // Store pure ZPL string
    is_default: t.is_default || false,
    updated_at: new Date().toISOString()
  });
}

// Code default: 2x1 @ 203dpi
export function codeDefaultRawCard2x1(): LabelTemplate {
  return {
    id: 'raw_card_2x1',
    name: '2x1 Raw Card',
    type: 'raw_card_2x1',
    format: 'elements',
    scope: 'code',
    layout: {
      dpi: 203, 
      width: 406, 
      height: 203,
      elements: [
        { type: 'text', id: 'cardinfo', x: 16, y: 12, font: '0', h: 36, w: 36, text: 'CARD NAME • Set Name • #001', maxWidth: 360 },
        { type: 'text', id: 'condition', x: 16, y: 58, font: '0', h: 20, w: 40, text: 'NM' },
        { type: 'text', id: 'price', x: 270, y: 15, font: '0', h: 30, w: 30, text: '$0.00' },
        { type: 'barcode', id: 'barcode', x: 16, y: 85, height: 52, moduleWidth: 2, hr: false, data: '5150233' },
        { type: 'text', id: 'sku', x: 16, y: 145, font: '0', h: 15, w: 15, text: '5150233' },
      ],
    },
  };
}

export async function getTemplate(id: string): Promise<LabelTemplate> {
  // Try to load from org first
  const org = await loadOrgTemplate(id); 
  if (org) {
    // Convert ZPL back to elements for visual editor
    if (org.format === 'zpl' && org.zpl) {
      const layout = zplToElements(org.zpl);
      return {
        ...org,
        format: 'elements',
        layout,
        zpl: org.zpl // Keep original ZPL for reference
      };
    }
    return org;
  }
  
  // Try local storage
  const local = loadLocalTemplates()[id]; 
  if (local) {
    // Convert ZPL back to elements for visual editor
    if (local.format === 'zpl' && local.zpl) {
      const layout = zplToElements(local.zpl);
      return {
        ...local,
        format: 'elements',
        layout,
        zpl: local.zpl // Keep original ZPL for reference
      };
    }
    return local;
  }
  
  // Fallback to default
  if (id === 'raw_card_2x1') return codeDefaultRawCard2x1();
  return codeDefaultRawCard2x1(); // fallback
}