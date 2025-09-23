import { LabelTemplate } from './types';

const LS_KEY = 'label-templates/v1';

export function loadLocalTemplates(): Record<string, LabelTemplate> {
  try { 
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); 
  } catch { 
    return {}; 
  }
}

export function saveLocalTemplate(t: LabelTemplate) {
  const all = loadLocalTemplates();
  all[t.id] = { ...t, scope: 'local', updated_at: new Date().toISOString() };
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
    
    // Convert from existing schema
    const canvas = data.canvas as any;
    if (canvas?.zplLabel) {
      return {
        id,
        name: data.name || id,
        type: id,
        format: 'zpl',
        zpl: canvas.zplLabel,
        is_default: data.is_default,
        scope: 'org'
      };
    } else if (canvas?.elements) {
      return {
        id,
        name: data.name || id,
        type: id,
        format: 'elements',
        layout: {
          dpi: 203,
          width: 406,
          height: 203,
          elements: canvas.elements
        },
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
  
  // Convert to existing schema format
  const canvas = t.format === 'zpl' 
    ? { zplLabel: t.zpl }
    : { elements: t.layout?.elements };
  
  await supabase.from('label_templates').upsert({
    id: t.id,
    name: t.name,
    template_type: 'general',
    canvas: canvas as any,
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
        { type: 'text', id: 'condition', x: 16, y: 58, font: '0', h: 24, w: 24, text: 'NM' },
        { type: 'text', id: 'price', x: 270, y: 15, font: '0', h: 30, w: 30, text: '$0.00' },
        { type: 'barcode', id: 'barcode', x: 16, y: 85, height: 52, moduleWidth: 2, hr: false, data: '5150233' },
        { type: 'text', id: 'sku', x: 16, y: 145, font: '0', h: 15, w: 15, text: '5150233' },
      ],
    },
  };
}

export async function getTemplate(id: string): Promise<LabelTemplate> {
  const org = await loadOrgTemplate(id); 
  if (org) return org;
  
  const local = loadLocalTemplates()[id]; 
  if (local) return local;
  
  if (id === 'raw_card_2x1') return codeDefaultRawCard2x1();
  return codeDefaultRawCard2x1(); // fallback
}