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
      zplLabel?: any; // Allow ZPL label data
    };
    zplLabel?: any; // Allow ZPL label at canvas level too
  };
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export function useTemplates(templateType: 'general' | 'raw' = 'raw') {
  const [templates, setTemplates] = useState<LabelTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [defaultTemplate, setDefaultTemplate] = useState<LabelTemplate | null>(null);

  const fetchTemplates = async () => {
    try {
      // Load templates for the specified type only
      const templatesResult = await supabase
        .from('label_templates')
        .select('*')
        .eq('template_type', templateType)
        .order('created_at', { ascending: false });

      if (templatesResult.error) throw templatesResult.error;

      // Process templates - handle both ZPL string format and element-based format
      const processedTemplates = (templatesResult.data || []).map(item => {
        const canvas = item.canvas as any;
        
        // Check if canvas.zplLabel is a string (new format) or object (old element format)
        let zplString = '';
        if (typeof canvas?.zplLabel === 'string') {
          zplString = canvas.zplLabel;
        } else if (canvas?.zplLabel?.elements) {
          // Convert element-based format to placeholder ZPL for compatibility
          zplString = '^XA^FO50,50^A0N,30,30^FD{{CARDNAME}}^FS^FO50,100^A0N,20,20^FD{{CONDITION}}^FS^FO50,150^BY2^BCN,60,Y,N,N^FD{{BARCODE}}^FS^XZ';
        }
        
        return {
          ...item,
          canvas: {
            // Ensure consistent structure
            zplLabel: zplString,
            fieldConfig: canvas?.fieldConfig || {
              includeTitle: true,
              includeSku: true,
              includePrice: true,
              includeLot: false,
              includeCondition: true,
              barcodeMode: 'barcode' as const
            },
            labelData: canvas?.labelData || {
              title: 'Sample Card',
              sku: 'SKU123',
              price: '$0.00',
              lot: '',
              condition: 'NM',
              barcode: 'SKU123'
            },
            tsplSettings: canvas?.tsplSettings || {
              density: 10,
              speed: 4,
              gapInches: 0
            }
          }
        };
      }) as LabelTemplate[];
      
      setTemplates(processedTemplates);
      
      // Find default template
      const defaultTemplate = processedTemplates.find(t => t.is_default);
      setDefaultTemplate(defaultTemplate || null);
      
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
    templateId?: string,
    zplData?: any // Add optional ZPL data parameter
  ) => {
    try {
      // Handle both old format (fieldConfig/labelData) and new ZPL format
      let templateData;
      
      if (zplData && zplData.zplLabel) {
        // New ZPL-based template format
        console.log('Saving ZPL template:', name, zplData);
        templateData = {
          name,
          canvas: {
            zplLabel: zplData.zplLabel,
            zplSettings: zplData.zplSettings || {},
            // Keep old format for backward compatibility
            fieldConfig: fieldConfig || {},
            labelData: labelData || {},
            tsplSettings: tsplSettings || {}
          },
          template_type: templateType
        };
      } else {
        // Legacy format for old templates
        templateData = {
          name,
          canvas: {
            fieldConfig,
            labelData,
            tsplSettings,
          },
          template_type: templateType
        };
      }

      let result;
      if (templateId) {
        // Update existing template
        result = await supabase
          .from('label_templates')
          .update(templateData)
          .eq('id', templateId)
          .select()
          .maybeSingle();
      } else {
        // Create new template
        result = await supabase
          .from('label_templates')
          .insert(templateData)
          .select()
          .maybeSingle();
      }

      if (result.error) {
        console.error('Supabase error:', result.error);
        throw new Error(result.error.message || 'Database operation failed');
      }

      toast.success(templateId ? 'Template updated successfully' : 'Template saved successfully');
      await fetchTemplates();
      return { success: true, template: result.data };
    } catch (error) {
      console.error('Failed to save template:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save template';
      toast.error(`Save failed: ${errorMessage}`);
      return { success: false, error: errorMessage };
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