import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { 
  getTemplate, 
  saveLocalTemplate, 
  saveToSupabase, 
  loadAllFromSupabase,
  setAsDefault,
  deleteTemplate,
  type LabelTemplate,
  type TemplateType 
} from '@/lib/templateStore';
import { Trash2, Download, Upload, RefreshCw } from 'lucide-react';
import { logger } from '@/lib/logger';

export default function TemplateEditor() {
  const [selectedId, setSelectedId] = useState<TemplateType>('raw_card_2x1');
  const [json, setJson] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [allTemplates, setAllTemplates] = useState<Record<string, LabelTemplate>>({});
  const [loading, setLoading] = useState(false);
  const [defaultLoaded, setDefaultLoaded] = useState(false);

  async function loadTemplate() {
    setError(null);
    setLoading(true);
    try {
      const tpl = await getTemplate(selectedId);
      setJson(JSON.stringify(tpl, null, 2));
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function loadAllTemplates() {
    try {
      const templates = await loadAllFromSupabase();
      setAllTemplates(templates);
    } catch (e: any) {
      logger.error('Failed to load templates', e instanceof Error ? e : new Error(String(e)), undefined, 'template-editor');
    }
  }

  async function saveLocal() {
    try {
      const obj = JSON.parse(json) as LabelTemplate;
      saveLocalTemplate(obj);
      toast.success('Saved to localStorage');
      await loadAllTemplates();
    } catch (e: any) {
      setError(String(e?.message || e));
      toast.error('Failed to save locally');
    }
  }

  async function saveOrg() {
    try {
      const obj = JSON.parse(json) as LabelTemplate;
      obj.scope = 'org';
      await saveToSupabase(obj);
      toast.success('Saved to Supabase (Org)');
      await loadAllTemplates();
    } catch (e: any) {
      setError(String(e?.message || e));
      toast.error('Failed to save to organization');
    }
  }

  async function handleSetDefault(templateId: string) {
    try {
      await setAsDefault(templateId, selectedId);
      toast.success('Set as default template');
      await loadAllTemplates();
    } catch (e: any) {
      toast.error('Failed to set as default');
    }
  }

  async function handleDelete(templateId: string) {
    if (!confirm('Are you sure you want to delete this template?')) return;
    
    try {
      await deleteTemplate(templateId);
      toast.success('Template deleted');
      await loadAllTemplates();
      await loadTemplate(); // Reload current template
    } catch (e: any) {
      toast.error('Failed to delete template');
    }
  }

  function generateSampleZPLTemplate() {
    const sampleZPL = `^XA
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

    const template: LabelTemplate = {
      id: 'raw_card_2x1_zpl_sample',
      type: 'raw_card_2x1',
      format: 'zpl',
      dpi: 203,
      width: 406,
      height: 203,
      zpl: sampleZPL,
      scope: 'local'
    };

    setJson(JSON.stringify(template, null, 2));
  }

  useEffect(() => {
    loadTemplate();
    loadAllTemplates();
  }, [selectedId]);
  
  // Auto-load default template once templates are loaded
  useEffect(() => {
    if (!defaultLoaded && Object.keys(allTemplates).length > 0) {
      const templatesList = Object.values(allTemplates).filter(t => t.type === selectedId);
      const defaultTemplate = templatesList.find(t => t.is_default);
      if (defaultTemplate) {
        setJson(JSON.stringify(defaultTemplate, null, 2));
        setDefaultLoaded(true);
      }
    }
  }, [allTemplates, selectedId, defaultLoaded]);

  const templatesList = Object.values(allTemplates).filter(t => t.type === selectedId);

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Label Templates
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Manage label templates with org-shared storage, local overrides, and code defaults.
            Load order: Supabase (Org) → Local override → Code default.
          </p>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Template Type Selector */}
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium">Template Type:</label>
            <Select value={selectedId} onValueChange={(value: TemplateType) => setSelectedId(value)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="raw_card_2x1">Raw Card 2"×1"</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={generateSampleZPLTemplate}>
              Generate ZPL Sample
            </Button>
          </div>

          {/* Existing Templates */}
          {templatesList.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Existing Templates</h3>
              <div className="grid gap-2">
                {templatesList.map(template => (
                  <div key={template.id} className="flex items-center gap-2 p-2 border rounded">
                    <Badge variant={template.scope === 'org' ? 'default' : 'secondary'}>
                      {template.scope}
                    </Badge>
                    <Badge variant="outline">{template.format}</Badge>
                    <span className="text-sm flex-1">{template.id}</span>
                    {template.is_default && <Badge variant="destructive">Default</Badge>}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setJson(JSON.stringify(template, null, 2))}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSetDefault(template.id)}
                      disabled={template.is_default}
                    >
                      Set Default
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(template.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* JSON Editor */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Template JSON</label>
            <Textarea
              value={json}
              onChange={e => setJson(e.target.value)}
              className="h-96 font-mono text-sm"
              placeholder="Template JSON will appear here..."
            />
          </div>

          {error && (
            <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded">
              {error}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={loadTemplate} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Reload
            </Button>
            <Button variant="outline" onClick={saveLocal}>
              <Download className="h-4 w-4 mr-2" />
              Save (Local)
            </Button>
            <Button onClick={saveOrg}>
              <Upload className="h-4 w-4 mr-2" />
              Save (Org)
            </Button>
          </div>

          {/* Format Examples */}
          <div className="grid md:grid-cols-2 gap-4 text-xs">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Elements Format</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs text-muted-foreground overflow-x-auto">
{`{
  "format": "elements",
  "elements": [
    {
      "type": "text",
      "id": "cardname",
      "x": 16, "y": 12,
      "text": "CARD NAME"
    }
  ]
}`}
                </pre>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">ZPL Format</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs text-muted-foreground overflow-x-auto">
{`{
  "format": "zpl",
  "zpl": "^XA^FO16,12^A0,28,28^FD{{CARDNAME}}^FS^XZ"
}`}
                </pre>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
