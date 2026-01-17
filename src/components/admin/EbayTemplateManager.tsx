import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Copy, Check, Tag, FileText } from 'lucide-react';

interface ListingTemplate {
  id: string;
  store_key: string;
  name: string;
  description: string | null;
  category_id: string;
  category_name: string | null;
  condition_id: string;
  is_graded: boolean;
  title_template: string | null;
  description_template: string | null;
  default_grader: string | null;
  aspects_mapping: Record<string, any> | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface CategoryMapping {
  id: string;
  store_key: string;
  keyword_pattern: string | null;
  brand_match: string[] | null;
  main_category: string | null;
  category_id: string;
  category_name: string;
  default_template_id: string | null;
  priority: number;
  is_active: boolean;
}

const CATEGORY_OPTIONS = [
  { id: '183454', name: 'CCG Individual Cards (Pokemon, MTG, etc.)' },
  { id: '261328', name: 'Sports Trading Cards Singles' },
  { id: '183050', name: 'Non-Sport Trading Cards' },
  { id: '63', name: 'Collectible Comic Books' },
  { id: '259061', name: 'Graded Comic Books' },
];

const GRADER_OPTIONS = ['PSA', 'BGS', 'CGC', 'SGC', 'CSG', 'HGA', 'GMA', 'KSA'];

const CONDITION_OPTIONS = [
  { id: '2750', name: 'Professionally Graded', isGraded: true },
  { id: '4000', name: 'Ungraded', isGraded: false },
  { id: '3000', name: 'Like New', isGraded: false },
];

interface EbayTemplateManagerProps {
  storeKey: string;
}

export function EbayTemplateManager({ storeKey }: EbayTemplateManagerProps) {
  const [templates, setTemplates] = useState<ListingTemplate[]>([]);
  const [mappings, setMappings] = useState<CategoryMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<Partial<ListingTemplate> | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, [storeKey]);

  async function loadData() {
    setLoading(true);
    try {
      const [templatesRes, mappingsRes] = await Promise.all([
        supabase
          .from('ebay_listing_templates')
          .select('*')
          .eq('store_key', storeKey)
          .order('is_default', { ascending: false }),
        supabase
          .from('ebay_category_mappings')
          .select('*')
          .eq('store_key', storeKey)
          .order('priority', { ascending: false }),
      ]);

      if (templatesRes.error) throw templatesRes.error;
      if (mappingsRes.error) throw mappingsRes.error;

      // Cast the templates data to handle Json type
      const typedTemplates = (templatesRes.data || []).map(t => ({
        ...t,
        aspects_mapping: (typeof t.aspects_mapping === 'object' && t.aspects_mapping !== null) 
          ? t.aspects_mapping as Record<string, any> 
          : null
      }));

      setTemplates(typedTemplates as ListingTemplate[]);
      setMappings(mappingsRes.data || []);
    } catch (error: any) {
      toast.error('Failed to load templates: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveTemplate() {
    if (!editingTemplate?.name) {
      toast.error('Template name is required');
      return;
    }

    setSaving(true);
    try {
      const templateData = {
        store_key: storeKey,
        name: editingTemplate.name,
        description: editingTemplate.description || null,
        category_id: editingTemplate.category_id || '183454',
        category_name: CATEGORY_OPTIONS.find(c => c.id === editingTemplate.category_id)?.name || null,
        condition_id: editingTemplate.condition_id || '2750',
        is_graded: editingTemplate.is_graded ?? true,
        title_template: editingTemplate.title_template || null,
        description_template: editingTemplate.description_template || null,
        default_grader: editingTemplate.default_grader || 'PSA',
        aspects_mapping: editingTemplate.aspects_mapping || {},
        is_default: editingTemplate.is_default ?? false,
        is_active: editingTemplate.is_active ?? true,
        updated_at: new Date().toISOString(),
      };

      if (editingTemplate.id) {
        const { error } = await supabase
          .from('ebay_listing_templates')
          .update(templateData)
          .eq('id', editingTemplate.id);
        if (error) throw error;
        toast.success('Template updated');
      } else {
        const { error } = await supabase
          .from('ebay_listing_templates')
          .insert(templateData);
        if (error) throw error;
        toast.success('Template created');
      }

      setIsDialogOpen(false);
      setEditingTemplate(null);
      loadData();
    } catch (error: any) {
      toast.error('Failed to save template: ' + error.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate(id: string) {
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      const { error } = await supabase
        .from('ebay_listing_templates')
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast.success('Template deleted');
      loadData();
    } catch (error: any) {
      toast.error('Failed to delete template: ' + error.message);
    }
  }

  async function setAsDefault(id: string) {
    try {
      // Clear other defaults first
      await supabase
        .from('ebay_listing_templates')
        .update({ is_default: false })
        .eq('store_key', storeKey);

      // Set new default
      const { error } = await supabase
        .from('ebay_listing_templates')
        .update({ is_default: true })
        .eq('id', id);

      if (error) throw error;
      toast.success('Default template updated');
      loadData();
    } catch (error: any) {
      toast.error('Failed to set default: ' + error.message);
    }
  }

  function openNewTemplate() {
    setEditingTemplate({
      name: '',
      description: '',
      category_id: '183454',
      condition_id: '2750',
      is_graded: true,
      title_template: '{year} {brand_title} {subject} #{card_number} {grading_company} {grade}',
      description_template: '<h2>{subject}</h2>\n<p><strong>Year:</strong> {year}</p>\n<p><strong>Brand:</strong> {brand_title}</p>\n<p><strong>Card #:</strong> {card_number}</p>\n<p><strong>Grade:</strong> {grading_company} {grade}</p>\n<p><strong>Cert:</strong> {psa_cert}</p>',
      default_grader: 'PSA',
      is_default: false,
      is_active: true,
      aspects_mapping: {},
    });
    setIsDialogOpen(true);
  }

  function duplicateTemplate(template: ListingTemplate) {
    setEditingTemplate({
      ...template,
      id: undefined,
      name: `${template.name} (Copy)`,
      is_default: false,
    });
    setIsDialogOpen(true);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Templates Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Listing Templates
            </CardTitle>
            <CardDescription>
              Configure templates for different card types with categories, conditions, and title formats
            </CardDescription>
          </div>
          <Button onClick={openNewTemplate}>
            <Plus className="h-4 w-4 mr-2" />
            New Template
          </Button>
        </CardHeader>
        <CardContent>
          {templates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No templates configured. Create your first template to get started.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {templates.map((template) => (
                <Card key={template.id} className={template.is_default ? 'border-primary' : ''}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          {template.name}
                          {template.is_default && (
                            <Badge variant="default" className="text-xs">Default</Badge>
                          )}
                        </CardTitle>
                        <CardDescription className="text-xs mt-1">
                          {template.category_name || template.category_id}
                        </CardDescription>
                      </div>
                      <Badge variant={template.is_graded ? 'default' : 'secondary'}>
                        {template.is_graded ? 'Graded' : 'Raw'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <div className="text-xs text-muted-foreground mb-3">
                      {template.is_graded && template.default_grader && (
                        <span>Default grader: {template.default_grader}</span>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingTemplate(template);
                          setIsDialogOpen(true);
                        }}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => duplicateTemplate(template)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      {!template.is_default && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAsDefault(template.id)}
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteTemplate(template.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Category Mappings Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Category Mappings
          </CardTitle>
          <CardDescription>
            Auto-assign categories based on brand names. Items matching these brands will use the corresponding eBay category.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mappings.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              No category mappings configured.
            </div>
          ) : (
            <div className="space-y-2">
              {mappings.map((mapping) => (
                <div
                  key={mapping.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="font-medium">{mapping.category_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {mapping.brand_match?.slice(0, 5).join(', ')}
                      {mapping.brand_match && mapping.brand_match.length > 5 && 
                        ` +${mapping.brand_match.length - 5} more`}
                    </div>
                  </div>
                  <Badge variant="outline">{mapping.main_category || 'any'}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Template Editor Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate?.id ? 'Edit Template' : 'New Listing Template'}
            </DialogTitle>
            <DialogDescription>
              Configure how listings will be created on eBay
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Template Name</Label>
                  <Input
                    id="name"
                    value={editingTemplate?.name || ''}
                    onChange={(e) => setEditingTemplate(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Graded TCG Card"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">eBay Category</Label>
                  <Select
                    value={editingTemplate?.category_id || '183454'}
                    onValueChange={(value) => setEditingTemplate(prev => ({ ...prev, category_id: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_OPTIONS.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="condition">Condition</Label>
                  <Select
                    value={editingTemplate?.condition_id || '2750'}
                    onValueChange={(value) => {
                      const option = CONDITION_OPTIONS.find(c => c.id === value);
                      setEditingTemplate(prev => ({ 
                        ...prev, 
                        condition_id: value,
                        is_graded: option?.isGraded ?? false,
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONDITION_OPTIONS.map((cond) => (
                        <SelectItem key={cond.id} value={cond.id}>
                          {cond.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {editingTemplate?.is_graded && (
                  <div className="space-y-2">
                    <Label htmlFor="grader">Default Grader</Label>
                    <Select
                      value={editingTemplate?.default_grader || 'PSA'}
                      onValueChange={(value) => setEditingTemplate(prev => ({ ...prev, default_grader: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GRADER_OPTIONS.map((grader) => (
                          <SelectItem key={grader} value={grader}>
                            {grader}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="titleTemplate">Title Template</Label>
                <Input
                  id="titleTemplate"
                  value={editingTemplate?.title_template || ''}
                  onChange={(e) => setEditingTemplate(prev => ({ ...prev, title_template: e.target.value }))}
                  placeholder="{year} {brand_title} {subject} #{card_number} {grade}"
                />
                <p className="text-xs text-muted-foreground">
                  Available: {'{year}'}, {'{brand_title}'}, {'{subject}'}, {'{card_number}'}, {'{grade}'}, {'{grading_company}'}, {'{variant}'}, {'{psa_cert}'}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="descTemplate">Description Template (HTML)</Label>
                <Textarea
                  id="descTemplate"
                  value={editingTemplate?.description_template || ''}
                  onChange={(e) => setEditingTemplate(prev => ({ ...prev, description_template: e.target.value }))}
                  rows={6}
                  placeholder="<h2>{subject}</h2>..."
                />
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editingTemplate?.is_active ?? true}
                    onCheckedChange={(checked) => setEditingTemplate(prev => ({ ...prev, is_active: checked }))}
                  />
                  <Label>Active</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editingTemplate?.is_default ?? false}
                    onCheckedChange={(checked) => setEditingTemplate(prev => ({ ...prev, is_default: checked }))}
                  />
                  <Label>Set as Default</Label>
                </div>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveTemplate} disabled={saving}>
              {saving ? 'Saving...' : (editingTemplate?.id ? 'Update Template' : 'Create Template')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}