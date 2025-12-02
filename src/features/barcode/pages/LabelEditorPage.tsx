import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { LabelEditor } from '../components/LabelEditor';
import type { LabelLayout } from '../types/labelLayout';
import { DEFAULT_LABEL_LAYOUT } from '../types/labelLayout';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const LabelEditorPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const templateId = searchParams.get('id');
  
  const [layout, setLayout] = useState<LabelLayout | null>(null);
  const [loading, setLoading] = useState(!!templateId);

  useEffect(() => {
    if (templateId) {
      loadTemplate(templateId);
    } else {
      setLayout({ ...DEFAULT_LABEL_LAYOUT, id: crypto.randomUUID() });
    }
  }, [templateId]);

  const loadTemplate = async (id: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('label_templates')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      // Extract layout from canvas if available
      const canvas = data.canvas as any;
      if (canvas?.layout) {
        setLayout(canvas.layout);
      } else {
        // Create layout from template name
        setLayout({
          ...DEFAULT_LABEL_LAYOUT,
          id: data.id,
          name: data.name,
        });
      }
    } catch (error) {
      console.error('Failed to load template:', error);
      toast.error('Failed to load template');
      setLayout({ ...DEFAULT_LABEL_LAYOUT, id: crypto.randomUUID() });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = (savedLayout: LabelLayout, zplTemplate: string) => {
    setLayout(savedLayout);
    toast.success('Template saved');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-4 p-4 border-b bg-card">
        <Button variant="ghost" size="sm" onClick={() => navigate('/barcode')}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Barcode Printing
        </Button>
        <h1 className="text-lg font-semibold">Label Designer</h1>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        {layout && (
          <LabelEditor
            initialLayout={layout}
            onSave={handleSave}
          />
        )}
      </div>
    </div>
  );
};

export default LabelEditorPage;
