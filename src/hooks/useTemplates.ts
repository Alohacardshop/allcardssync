import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface LabelTemplate {
  id: string;
  name: string;
  canvas: {
    fieldConfig: {
      includeTitle: boolean;
      includeSku: boolean;
      includePrice: boolean;
      includeLot: boolean;
      includeCondition: boolean;
      barcodeMode: 'qr' | 'barcode' | 'none';
      templateStyle?: string;
    };
    labelData: {
      title: string;
      sku: string;
      price: string;
      lot: string;
      condition: string;
      barcode: string;
    };
    tsplSettings: {
      density: number;
      speed: number;
      gapInches: number;
    };
  };
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export function useTemplates(templateType: 'general' | 'raw' = 'general') {
  const [templates, setTemplates] = useState<LabelTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [defaultTemplate, setDefaultTemplate] = useState<LabelTemplate | null>(null);

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('label_templates')
        .select('*')
        .eq('template_type', templateType)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const typedData = (data || []).map(item => ({
        ...item,
        canvas: item.canvas as {
          fieldConfig: {
            includeTitle: boolean;
            includeSku: boolean;
            includePrice: boolean;
            includeLot: boolean;
            includeCondition: boolean;
            barcodeMode: 'qr' | 'barcode' | 'none';
            templateStyle?: string;
          };
          labelData: {
            title: string;
            sku: string;
            price: string;
            lot: string;
            condition: string;
            barcode: string;
          };
          tsplSettings: {
            density: number;
            speed: number;
            gapInches: number;
          };
        }
      })) as LabelTemplate[];
      
      setTemplates(typedData);
      setDefaultTemplate(typedData.find(t => t.is_default) || null);
    } catch (error) {
      console.error('Failed to fetch templates:', error);
      toast.error('Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const saveTemplate = async (
    name: string, 
    fieldConfig: any, 
    labelData: any, 
    tsplSettings: any,
    templateId?: string
  ) => {
    try {
      const templateData = {
        name,
        canvas: {
          fieldConfig,
          labelData,
          tsplSettings
        },
        template_type: templateType
      };

      let result;
      if (templateId) {
        // Update existing template
        result = await supabase
          .from('label_templates')
          .update(templateData)
          .eq('id', templateId)
          .select()
          .single();
      } else {
        // Create new template
        result = await supabase
          .from('label_templates')
          .insert(templateData)
          .select()
          .single();
      }

      if (result.error) {
        console.error('Supabase error:', result.error);
        throw new Error(result.error.message || 'Database operation failed');
      }

      toast.success(templateId ? 'Template updated successfully' : 'Template saved successfully');
      await fetchTemplates();
      return result.data;
    } catch (error) {
      console.error('Failed to save template:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save template';
      toast.error(`Save failed: ${errorMessage}`);
      return null;
    }
  };

  const deleteTemplate = async (templateId: string) => {
    try {
      const { error } = await supabase
        .from('label_templates')
        .delete()
        .eq('id', templateId);

      if (error) throw error;

      toast.success('Template deleted successfully');
      await fetchTemplates();
    } catch (error) {
      console.error('Failed to delete template:', error);
      toast.error('Failed to delete template');
    }
  };

  const setAsDefault = async (templateId: string) => {
    try {
      const { error } = await supabase.rpc('set_template_default', {
        template_id: templateId,
        template_type_param: templateType
      });

      if (error) throw error;

      toast.success('Default template updated');
      await fetchTemplates();
    } catch (error) {
      console.error('Failed to set default template:', error);
      toast.error('Failed to set default template');
    }
  };

  const loadDefaultTemplate = () => {
    return defaultTemplate;
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const refreshTemplates = async () => {
    setLoading(true);
    await fetchTemplates();
  };

  return {
    templates,
    loading,
    defaultTemplate,
    saveTemplate,
    deleteTemplate,
    setAsDefault,
    loadDefaultTemplate,
    refetch: fetchTemplates,
    refreshTemplates
  };
}