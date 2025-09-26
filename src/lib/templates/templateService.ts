import { supabase } from '@/integrations/supabase/client';

export type TemplateRecord = { 
  id: string; 
  name: string; 
  zpl: string; 
  required_fields: string[] 
};

// Load templates from Supabase
async function loadAllTemplates(): Promise<TemplateRecord[]> {
  const { data, error } = await supabase
    .from('label_templates')
    .select('*')
    .eq('template_type', 'raw');
    
  if (error) {
    console.error('Failed to load templates:', error);
    return [];
  }
  
  return (data || []).map(t => ({
    id: t.id,
    name: t.name,
    zpl: (t.canvas as any)?.zplLabel || '',
    required_fields: (t.canvas as any)?.fieldConfig ? Object.keys((t.canvas as any).fieldConfig) : []
  }));
}

export async function getTemplateByName(name: string): Promise<TemplateRecord> {
  const all = await loadAllTemplates();
  const t = all.find(x => x.name === name);
  if (!t) throw new Error(`Template '${name}' not found`);
  if (!t.zpl?.trim()) throw new Error(`Template '${name}' has empty ZPL`);
  return t;
}

export async function getTemplateById(id: string): Promise<TemplateRecord> {
  const { data, error } = await supabase
    .from('label_templates')
    .select('*')
    .eq('id', id)
    .single();
    
  if (error || !data) {
    throw new Error(`Template with id '${id}' not found`);
  }
  
  const zpl = (data.canvas as any)?.zplLabel || '';
  if (!zpl?.trim()) {
    throw new Error(`Template '${data.name}' has empty ZPL`);
  }
  
  return {
    id: data.id,
    name: data.name,
    zpl: zpl,
    required_fields: (data.canvas as any)?.fieldConfig ? Object.keys((data.canvas as any).fieldConfig) : []
  };
}