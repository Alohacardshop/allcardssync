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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Copy, Check, FileText } from 'lucide-react';
import { EbayCategorySelect } from './EbayCategorySelect';


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
  fulfillment_policy_id: string | null;
  payment_policy_id: string | null;
  return_policy_id: string | null;
  price_markup_percent: number | null;
  tag_match: string[];
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface PolicyOption {
  policy_id: string;
  name: string;
}

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
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<Partial<ListingTemplate> | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedCategoryName, setSelectedCategoryName] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [fulfillmentPolicies, setFulfillmentPolicies] = useState<PolicyOption[]>([]);
  const [paymentPolicies, setPaymentPolicies] = useState<PolicyOption[]>([]);
  const [returnPolicies, setReturnPolicies] = useState<PolicyOption[]>([]);

  useEffect(() => {
    loadData();
    loadPolicies();
  }, [storeKey]);

  async function loadPolicies() {
    const [fp, pp, rp] = await Promise.all([
      supabase.from('ebay_fulfillment_policies').select('policy_id, name').eq('store_key', storeKey).order('name'),
      supabase.from('ebay_payment_policies').select('policy_id, name').eq('store_key', storeKey).order('name'),
      supabase.from('ebay_return_policies').select('policy_id, name').eq('store_key', storeKey).order('name'),
    ]);
    setFulfillmentPolicies(fp.data || []);
    setPaymentPolicies(pp.data || []);
    setReturnPolicies(rp.data || []);
  }

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

      const typedTemplates = (templatesRes.data || []).map(t => ({
        ...t,
        aspects_mapping: (typeof t.aspects_mapping === 'object' && t.aspects_mapping !== null) 
          ? t.aspects_mapping as Record<string, any> 
          : null
      }));

      setTemplates(typedTemplates as ListingTemplate[]);
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
        category_name: selectedCategoryName || editingTemplate.category_name || null,
        condition_id: editingTemplate.condition_id || '2750',
        is_graded: editingTemplate.is_graded ?? true,
        title_template: editingTemplate.title_template || null,
        description_template: editingTemplate.description_template || null,
        default_grader: editingTemplate.default_grader || 'PSA',
        aspects_mapping: editingTemplate.aspects_mapping || {},
        fulfillment_policy_id: editingTemplate.fulfillment_policy_id || null,
        payment_policy_id: editingTemplate.payment_policy_id || null,
        return_policy_id: editingTemplate.return_policy_id || null,
        price_markup_percent: editingTemplate.price_markup_percent ?? null,
        tag_match: editingTemplate.tag_match || [],
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
      const { error } = await supabase.from('ebay_listing_templates').delete().eq('id', id);
      if (error) throw error;
      toast.success('Template deleted');
      loadData();
    } catch (error: any) {
      toast.error('Failed to delete template: ' + error.message);
    }
  }

  async function setAsDefault(id: string) {
    try {
      await supabase.from('ebay_listing_templates').update({ is_default: false }).eq('store_key', storeKey);
      const { error } = await supabase.from('ebay_listing_templates').update({ is_default: true }).eq('id', id);
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
      fulfillment_policy_id: null,
      payment_policy_id: null,
      return_policy_id: null,
      price_markup_percent: null,
      tag_match: [],
    });
    setSelectedCategoryName('');
    setTagInput('');
    setIsDialogOpen(true);
  }

  function duplicateTemplate(template: ListingTemplate) {
    setEditingTemplate({
      ...template,
      id: undefined,
      name: `${template.name} (Copy)`,
      is_default: false,
    });
    setSelectedCategoryName(template.category_name || '');
    setIsDialogOpen(true);
  }

  const PolicyDropdown = ({ label, value, options, onChange }: { label: string; value: string | null | undefined; options: PolicyOption[]; onChange: (v: string | null) => void }) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value || '__none__'} onValueChange={(v) => onChange(v === '__none__' ? null : v)}>
        <SelectTrigger>
          <SelectValue placeholder={`Select ${label.toLowerCase()}...`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— Store Default —</SelectItem>
          {options.map(p => (
            <SelectItem key={p.policy_id} value={p.policy_id}>{p.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
                      {template.tag_match?.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {template.tag_match.map(tag => (
                            <Badge key={tag} className="text-[10px] bg-purple-600 hover:bg-purple-700 text-white">{tag}</Badge>
                          ))}
                        </div>
                      )}
                      {template.price_markup_percent != null && (
                        <div className="mt-1">
                          <Badge variant="outline" className="text-[10px]">Markup: {template.price_markup_percent}%</Badge>
                        </div>
                      )}
                      {(template.fulfillment_policy_id || template.payment_policy_id || template.return_policy_id) && (
                        <div className="mt-1">
                          <Badge variant="outline" className="text-[10px]">Policy overrides</Badge>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => { setEditingTemplate(template); setSelectedCategoryName(template.category_name || ''); setIsDialogOpen(true); }}>
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => duplicateTemplate(template)}>
                        <Copy className="h-3 w-3" />
                      </Button>
                      {!template.is_default && (
                        <Button variant="outline" size="sm" onClick={() => setAsDefault(template.id)}>
                          <Check className="h-3 w-3" />
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => deleteTemplate(template.id)} className="text-destructive hover:text-destructive">
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
                  <EbayCategorySelect
                    value={editingTemplate?.category_id || '183454'}
                    onValueChange={(value) => setEditingTemplate(prev => ({ ...prev, category_id: value }))}
                    onCategoryNameChange={setSelectedCategoryName}
                  />
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

              {/* Tag Matching */}
              <div className="space-y-2 pt-2 border-t">
                <Label>Tag Match (AND logic — item must have ALL tags for this template to auto-match)</Label>
                <div className="flex gap-2">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="Add tag (e.g., graded, comics, psa)..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (!tagInput.trim()) return;
                        const normalized = tagInput.trim().toLowerCase();
                        const tags = editingTemplate?.tag_match || [];
                        if (!tags.includes(normalized)) {
                          setEditingTemplate(prev => ({ ...prev, tag_match: [...tags, normalized] }));
                        }
                        setTagInput('');
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={() => {
                    if (!tagInput.trim()) return;
                    const normalized = tagInput.trim().toLowerCase();
                    const tags = editingTemplate?.tag_match || [];
                    if (!tags.includes(normalized)) {
                      setEditingTemplate(prev => ({ ...prev, tag_match: [...tags, normalized] }));
                    }
                    setTagInput('');
                  }}>Add</Button>
                </div>
                {editingTemplate?.tag_match?.length ? (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {editingTemplate.tag_match.map((tag) => (
                      <Badge 
                        key={tag} 
                        className="cursor-pointer bg-purple-600 hover:bg-purple-700 text-white"
                        onClick={() => setEditingTemplate(prev => ({ ...prev, tag_match: (prev?.tag_match || []).filter(t => t !== tag) }))}
                      >
                        {tag} ×
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>

              {/* Price Markup */}
              <div className="space-y-3 pt-2 border-t">
                <Label className="text-sm font-medium">Price Markup</Label>
                <p className="text-xs text-muted-foreground">
                  Percentage added to item price when listed via this template. Overrides routing rule markup.
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={editingTemplate?.price_markup_percent ?? ''}
                    onChange={(e) => setEditingTemplate(prev => ({ ...prev, price_markup_percent: e.target.value ? parseFloat(e.target.value) : null }))}
                    placeholder="No markup"
                    className="w-32"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>

              {/* Policy Overrides */}
              <div className="space-y-3 pt-2 border-t">
                <Label className="text-sm font-medium">Policy Overrides</Label>
                <p className="text-xs text-muted-foreground">
                  Override routing rule policies for items using this template. Leave as "Store Default" to inherit.
                </p>
                <div className="grid grid-cols-3 gap-4">
                  <PolicyDropdown
                    label="Fulfillment"
                    value={editingTemplate?.fulfillment_policy_id}
                    options={fulfillmentPolicies}
                    onChange={(v) => setEditingTemplate(prev => ({ ...prev, fulfillment_policy_id: v }))}
                  />
                  <PolicyDropdown
                    label="Payment"
                    value={editingTemplate?.payment_policy_id}
                    options={paymentPolicies}
                    onChange={(v) => setEditingTemplate(prev => ({ ...prev, payment_policy_id: v }))}
                  />
                  <PolicyDropdown
                    label="Return"
                    value={editingTemplate?.return_policy_id}
                    options={returnPolicies}
                    onChange={(v) => setEditingTemplate(prev => ({ ...prev, return_policy_id: v }))}
                  />
                </div>
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
