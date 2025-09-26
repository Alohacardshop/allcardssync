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

export function useTemplates(templateType: 'general' | 'raw' = 'general') {
  const [templates, setTemplates] = useState<LabelTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [defaultTemplate, setDefaultTemplate] = useState<LabelTemplate | null>(null);

  const fetchTemplates = async () => {
    try {
      // Load both old format templates and ZPL studio templates
      const [oldTemplatesResult, zplTemplatesResult] = await Promise.all([
        supabase
          .from('label_templates')
          .select('*')
          .eq('template_type', templateType)
          .order('created_at', { ascending: false }),
        supabase
          .from('label_templates')
          .select('*')
          .eq('template_type', 'zpl_studio')
          .order('created_at', { ascending: false })
      ]);

      if (oldTemplatesResult.error) throw oldTemplatesResult.error;
      if (zplTemplatesResult.error) throw zplTemplatesResult.error;

      // Process old format templates
      const oldTypedData = (oldTemplatesResult.data || []).map(item => ({
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

      // Process ZPL studio templates and convert to old format for compatibility
      const zplTypedData = (zplTemplatesResult.data || []).map(item => {
        const canvas = item.canvas as any;
        return {
          ...item,
          canvas: {
            zplLabel: canvas?.zplLabel || '',
            // Convert ZPL templates to include fieldConfig for compatibility
            fieldConfig: canvas?.fieldConfig || {
              includeTitle: true,
              includeSku: true,
              includePrice: true,
              includeLot: false,
              includeCondition: true,
              barcodeMode: 'barcode' as const
            },
            labelData: {
              title: 'Sample Card',
              sku: 'SKU123',
              price: '$0.00',
              lot: '',
              condition: 'NM',
              barcode: 'SKU123'
            },
            tsplSettings: {
              density: 10,
              speed: 4,
              gapInches: 0
            }
          }
        };
      }) as LabelTemplate[];
      
      // Combine both template types
      const allTemplates = [...oldTypedData, ...zplTypedData];
      
      setTemplates(allTemplates);
      
      // Find default template from either source
      const defaultFromOld = oldTypedData.find(t => t.is_default);
      const defaultFromZpl = zplTypedData.find(t => t.is_default);
      setDefaultTemplate(defaultFromZpl || defaultFromOld || null);
      
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