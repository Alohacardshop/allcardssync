// src/lib/templateStore.ts
export type TemplateType = 'raw_card_2x1';
export type TemplateFormat = 'elements' | 'zpl';

// Simple ZPL element interface for backwards compatibility
export interface SimpleZPLElement {
  type: 'text' | 'barcode' | 'line';
  id?: string;
  x: number;
  y: number;
  font?: string;
  h?: number;
  w?: number;
  text?: string;
  height?: number;
  moduleWidth?: number;
  data?: string;
  x2?: number;
  y2?: number;
  thickness?: number;
}

export interface LabelTemplate {
  id: string;                 // e.g., 'raw_card_2x1'
  type: TemplateType;
  format: TemplateFormat;     // 'elements' or 'zpl'
  dpi: 203 | 300;
  width: number;              // dots
  height: number;             // dots
  elements?: SimpleZPLElement[]; // when format = 'elements'
  zpl?: string;               // when format = 'zpl'
  updated_at?: string;
  scope?: 'org' | 'store' | 'local' | 'code';
  is_default?: boolean;
}

const LS_KEY = 'label-templates/v1';

function loadLocal(): Record<string, LabelTemplate> {
  try { 
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); 
  } catch { 
    return {}; 
  }
}

function saveLocal(all: Record<string, LabelTemplate>) {
  localStorage.setItem(LS_KEY, JSON.stringify(all));
}

function createDefaultLabelTemplate(): Omit<LabelTemplate, 'id' | 'type' | 'scope'> {
  // 2" x 1" @ 203dpi -> width ~406 dots, height 203 dots
  return {
    format: 'elements' as const,
    dpi: 203 as const,
    width: 406,
    height: 203,
    elements: [
      { type: 'text', id: 'cardname', x: 16, y: 12, font: '0', h: 28, w: 28, text: 'CARD NAME' },
      { type: 'text', id: 'condition', x: 16, y: 48, font: '0', h: 24, w: 24, text: 'NM' },
      { type: 'text', id: 'price', x: 160, y: 48, font: '0', h: 28, w: 28, text: '$0.00' },
      { type: 'text', id: 'sku', x: 16, y: 78, font: '0', h: 22, w: 22, text: 'SKU' },
      { type: 'barcode', id: 'barcode', x: 16, y: 106, height: 72, moduleWidth: 2, data: 'SKU123' },
    ] as SimpleZPLElement[],
  };
}

// ---- Supabase helpers ----
export async function loadFromSupabase(id: string): Promise<LabelTemplate | null> {
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    const { data, error } = await supabase
      .from('label_templates')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    
    if (error || !data) return null;
    
    // Convert from existing schema to our format
    const canvas = data.canvas as any;
    if (canvas?.zplLabel) {
      return {
        id: data.id,
        type: 'raw_card_2x1',
        format: 'zpl' as const,
        dpi: 203,
        width: 406,
        height: 203,
        zpl: canvas.zplLabel as string,
        scope: 'org',
        is_default: data.is_default || false
      };
    } else {
      return {
        id: data.id,
        type: 'raw_card_2x1',
        format: 'elements' as const,
        dpi: 203,
        width: 406,
        height: 203,
        elements: canvas?.elements || [],
        scope: 'org',
        is_default: data.is_default || false
      };
    }
  } catch (error) {
    console.error('Failed to load template from Supabase:', error);
    return null;
  }
}

export async function saveToSupabase(t: LabelTemplate) {
  const { supabase } = await import('@/integrations/supabase/client');
  
  // Convert to existing schema format
  const canvas = t.format === 'zpl' 
    ? { zplLabel: t.zpl }
    : { elements: t.elements };
  
  const { error } = await supabase.from('label_templates')
    .upsert({
      id: t.id,
      name: t.id,
      template_type: 'general',
      canvas: canvas as any,
      is_default: t.is_default || false,
      updated_at: new Date().toISOString()
    });
  
  if (error) {
    console.error('Failed to save template to Supabase:', error);
    throw error;
  }
}

export async function loadAllFromSupabase(): Promise<Record<string, LabelTemplate>> {
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    const { data, error } = await supabase
      .from('label_templates')
      .select('*');
    
    if (error || !data) return {};
    
    const templates: Record<string, LabelTemplate> = {};
    for (const row of data) {
      // Convert from existing schema to our format
      const canvas = row.canvas as any;
      if (canvas?.zplLabel) {
        templates[row.id] = {
          id: row.id,
          type: 'raw_card_2x1',
          format: 'zpl' as const,
          dpi: 203,
          width: 406,
          height: 203,
          zpl: canvas.zplLabel as string,
          scope: 'org',
          is_default: row.is_default || false
        };
      } else {
        templates[row.id] = {
          id: row.id,
          type: 'raw_card_2x1',
          format: 'elements' as const,
          dpi: 203,
          width: 406,
          height: 203,
          elements: canvas?.elements || [],
          scope: 'org',
          is_default: row.is_default || false
        };
      }
    }
    return templates;
  } catch (error) {
    console.error('Failed to load templates from Supabase:', error);
    return {};
  }
}

// ---- Public API ----
export async function getTemplate(id: TemplateType): Promise<LabelTemplate> {
  // 1) Supabase (org-shared)
  const remote = await loadFromSupabase(id);
  if (remote) return remote;

  // 2) Local override
  const local = loadLocal()[id];
  if (local) return local;

  // 3) Code default
  const def = createDefaultLabelTemplate();
  return { ...def, id, type: id, scope: 'code' };
}

export function saveLocalTemplate(t: LabelTemplate) {
  const all = loadLocal();
  all[t.id] = { ...t, scope: 'local', updated_at: new Date().toISOString() };
  saveLocal(all);
}

export async function setAsDefault(templateId: string, templateType: TemplateType) {
  const { supabase } = await import('@/integrations/supabase/client');
  const { error } = await supabase.rpc('set_template_default', {
    template_id: templateId,
    template_type_param: templateType
  });
  
  if (error) {
    console.error('Failed to set default template:', error);
    throw error;
  }
}

export async function deleteTemplate(templateId: string) {
  const { supabase } = await import('@/integrations/supabase/client');
  const { error } = await supabase
    .from('label_templates')
    .delete()
    .eq('id', templateId);
  
  if (error) {
    console.error('Failed to delete template:', error);
    throw error;
  }
}

// Add ZPL generation function
export interface ZPLLayout {
  width: number;   // dots
  height: number;  // dots
  dpi: 203 | 300;
  elements: SimpleZPLElement[];
}

export function generateZPLFromElements(
  layout: ZPLLayout,
  originX = 0,
  originY = 0,
  opts?: { stockMode?: 'gap' | 'blackmark'; leftShift?: number }
): string {
  const { width, height, elements } = layout;
  const lines: string[] = [];
  lines.push('^XA');
  lines.push('^PW' + width);
  lines.push('^LL' + height);
  lines.push('^LH' + originX + ',' + originY);
  lines.push('^PR2');     // print speed
  lines.push('^MD0');     // darkness offset 0 (printer setting can vary)
  lines.push('^MNY');     // gap/notch media (default)
  lines.push('^MMC');     // cutter enabled (if printer supports)
  
  for (const el of elements) {
    if (el.type === 'text') {
      const font = el.font ?? '0';
      const h = el.h ?? 30;
      const w = el.w ?? 30;
      lines.push(`^FO${el.x},${el.y}^A${font},${h},${w}^FD${escapeZPL(el.text || '')}^FS`);
    } else if (el.type === 'barcode') {
      const h = el.height ?? 80;
      const m = el.moduleWidth ?? 2;
      lines.push(`^FO${el.x},${el.y}^BY${m}^BCN,${h},Y,N,N^FD${escapeZPL(el.data || '')}^FS`);
    } else if (el.type === 'line') {
      const thickness = el.thickness ?? 2;
      const widthPx = Math.max(1, Math.abs((el.x2 || el.x) - el.x));
      const heightPx = Math.max(1, Math.abs((el.y2 || el.y) - el.y));
      lines.push(`^FO${Math.min(el.x, el.x2 || el.x)},${Math.min(el.y, el.y2 || el.y)}^GB${widthPx},${heightPx},${thickness}^FS`);
    }
  }
  
  lines.push('^PQ1,1,0,Y'); // 1 copy; cut between labels if supported
  lines.push('^XZ');
  return lines.join('');
}

function escapeZPL(s: string) {
  return (s ?? '').replace(/\^/g, ' ').replace(/~/g, ' ');
}