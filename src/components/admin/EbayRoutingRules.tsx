import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Loader2, Tag, FileText, Search } from 'lucide-react';
import { EbayCategorySelect } from './EbayCategorySelect';

// ── Types ──────────────────────────────────────────────────

type MatchType = 'tag' | 'brand' | 'keyword';

interface UnifiedRule {
  id: string;
  source: 'tag' | 'category';
  matchType: MatchType;
  matchValue: string;
  ebayCategoryId: string | null;
  ebayCategoryName: string | null;
  templateId: string | null;
  templateName: string | null;
  fulfillmentPolicyId: string | null;
  paymentPolicyId: string | null;
  returnPolicyId: string | null;
  priceMarkup: number | null;
  conditionType: string | null;
  primaryCategory: string | null;
  mainCategory: string | null;
  priority: number;
  isActive: boolean;
  brandMatch: string[] | null;
  keywordPattern: string | null;
}

interface PolicyOption {
  policy_id: string;
  name: string;
}

interface EbayRoutingRulesProps {
  storeKey: string;
}

const MAIN_CATEGORY_OPTIONS = [
  { value: 'tcg', label: 'TCG' },
  { value: 'sports', label: 'Sports' },
  { value: 'comics', label: 'Comics' },
  { value: 'other', label: 'Other' },
];

// ── Component ──────────────────────────────────────────────

export function EbayRoutingRules({ storeKey }: EbayRoutingRulesProps) {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'tag' | 'category'>('tag');
  const [searchFilter, setSearchFilter] = useState('');
  const [brandInput, setBrandInput] = useState('');
  const [selectedCategoryName, setSelectedCategoryName] = useState('');

  // Tag mapping edit state
  const [editingTag, setEditingTag] = useState<{
    id?: string;
    tag_value: string;
    primary_category: string;
    condition_type: string;
    ebay_category_id: string;
    fulfillment_policy_id: string;
    payment_policy_id: string;
    return_policy_id: string;
    price_markup_percent: string;
    is_active: boolean;
  } | null>(null);

  // Category mapping edit state
  const [editingCat, setEditingCat] = useState<{
    id?: string;
    category_id: string;
    category_name: string;
    brand_match: string[];
    keyword_pattern: string;
    main_category: string | null;
    default_template_id: string | null;
    priority: number;
    is_active: boolean;
  } | null>(null);

  // ── Queries ──────────────────────────────────────────────

  const { data: tagMappings, isLoading: loadingTags } = useQuery({
    queryKey: ['tag-category-mappings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tag_category_mappings')
        .select('*')
        .order('tag_value');
      if (error) throw error;
      return data;
    },
  });

  const { data: catMappings, isLoading: loadingCats } = useQuery({
    queryKey: ['ebay-category-mappings', storeKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ebay_category_mappings')
        .select('*')
        .eq('store_key', storeKey)
        .order('priority', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: templates } = useQuery({
    queryKey: ['ebay-templates', storeKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ebay_listing_templates')
        .select('id, name')
        .eq('store_key', storeKey)
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: policies } = useQuery({
    queryKey: ['ebay-policies-for-routing', storeKey],
    queryFn: async () => {
      const [fp, pp, rp] = await Promise.all([
        supabase.from('ebay_fulfillment_policies').select('policy_id, name').eq('store_key', storeKey).order('name'),
        supabase.from('ebay_payment_policies').select('policy_id, name').eq('store_key', storeKey).order('name'),
        supabase.from('ebay_return_policies').select('policy_id, name').eq('store_key', storeKey).order('name'),
      ]);
      return {
        fulfillment: (fp.data || []) as PolicyOption[],
        payment: (pp.data || []) as PolicyOption[],
        return: (rp.data || []) as PolicyOption[],
      };
    },
  });

  // ── Unify rules for display ──────────────────────────────

  const unifiedRules: UnifiedRule[] = [
    ...(tagMappings || []).map((t): UnifiedRule => ({
      id: t.id,
      source: 'tag',
      matchType: 'tag',
      matchValue: t.tag_value,
      ebayCategoryId: t.ebay_category_id,
      ebayCategoryName: null,
      templateId: null,
      templateName: null,
      fulfillmentPolicyId: t.fulfillment_policy_id,
      paymentPolicyId: t.payment_policy_id,
      returnPolicyId: t.return_policy_id,
      priceMarkup: t.price_markup_percent,
      conditionType: t.condition_type,
      primaryCategory: t.primary_category,
      mainCategory: null,
      priority: 0,
      isActive: t.is_active,
      brandMatch: null,
      keywordPattern: null,
    })),
    ...(catMappings || []).map((c): UnifiedRule => ({
      id: c.id,
      source: 'category',
      matchType: c.brand_match?.length ? 'brand' : 'keyword',
      matchValue: c.brand_match?.length ? c.brand_match.join(', ') : c.keyword_pattern || c.main_category || '—',
      ebayCategoryId: c.category_id,
      ebayCategoryName: c.category_name,
      templateId: c.default_template_id,
      templateName: templates?.find(t => t.id === c.default_template_id)?.name || null,
      fulfillmentPolicyId: null,
      paymentPolicyId: null,
      returnPolicyId: null,
      priceMarkup: null,
      conditionType: null,
      primaryCategory: null,
      mainCategory: c.main_category,
      priority: c.priority ?? 0,
      isActive: c.is_active ?? true,
      brandMatch: c.brand_match,
      keywordPattern: c.keyword_pattern,
    })),
  ];

  const filteredRules = searchFilter
    ? unifiedRules.filter(r =>
        r.matchValue.toLowerCase().includes(searchFilter.toLowerCase()) ||
        r.ebayCategoryName?.toLowerCase().includes(searchFilter.toLowerCase()) ||
        r.primaryCategory?.toLowerCase().includes(searchFilter.toLowerCase())
      )
    : unifiedRules;

  // ── Mutations ────────────────────────────────────────────

  const saveTagMutation = useMutation({
    mutationFn: async (tag: NonNullable<typeof editingTag>) => {
      const payload = {
        tag_value: tag.tag_value.trim().toLowerCase(),
        primary_category: tag.primary_category.trim() || null,
        condition_type: tag.condition_type.trim() || null,
        ebay_category_id: tag.ebay_category_id.trim() || null,
        fulfillment_policy_id: tag.fulfillment_policy_id || null,
        payment_policy_id: tag.payment_policy_id || null,
        return_policy_id: tag.return_policy_id || null,
        price_markup_percent: tag.price_markup_percent ? parseFloat(tag.price_markup_percent) : null,
        is_active: tag.is_active,
      };
      if (tag.id) {
        const { error } = await supabase.from('tag_category_mappings').update(payload).eq('id', tag.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('tag_category_mappings').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tag-category-mappings'] });
      setIsDialogOpen(false);
      toast.success('Tag rule saved');
    },
    onError: (e: any) => toast.error('Failed: ' + e.message),
  });

  const saveCatMutation = useMutation({
    mutationFn: async (cat: NonNullable<typeof editingCat>) => {
      const payload = {
        store_key: storeKey,
        category_id: cat.category_id,
        category_name: selectedCategoryName || cat.category_name || cat.category_id,
        brand_match: cat.brand_match || [],
        keyword_pattern: cat.keyword_pattern || null,
        main_category: cat.main_category || null,
        default_template_id: cat.default_template_id || null,
        priority: cat.priority,
        is_active: cat.is_active,
      };
      if (cat.id) {
        const { error } = await supabase.from('ebay_category_mappings').update(payload).eq('id', cat.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('ebay_category_mappings').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ebay-category-mappings', storeKey] });
      setIsDialogOpen(false);
      toast.success('Category rule saved');
    },
    onError: (e: any) => toast.error('Failed: ' + e.message),
  });

  const deleteTagMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tag_category_mappings').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tag-category-mappings'] });
      toast.success('Rule deleted');
    },
    onError: (e: any) => toast.error('Failed: ' + e.message),
  });

  const deleteCatMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ebay_category_mappings').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ebay-category-mappings', storeKey] });
      toast.success('Rule deleted');
    },
    onError: (e: any) => toast.error('Failed: ' + e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ rule }: { rule: UnifiedRule }) => {
      const table = rule.source === 'tag' ? 'tag_category_mappings' : 'ebay_category_mappings';
      const { error } = await supabase.from(table).update({ is_active: !rule.isActive }).eq('id', rule.id);
      if (error) throw error;
    },
    onSuccess: (_, { rule }) => {
      const key = rule.source === 'tag' ? ['tag-category-mappings'] : ['ebay-category-mappings', storeKey];
      queryClient.invalidateQueries({ queryKey: key });
    },
  });

  // ── Dialog openers ───────────────────────────────────────

  function openNewTag() {
    setDialogMode('tag');
    setEditingTag({
      tag_value: '', primary_category: '', condition_type: '', ebay_category_id: '',
      fulfillment_policy_id: '', payment_policy_id: '', return_policy_id: '',
      price_markup_percent: '', is_active: true,
    });
    setEditingCat(null);
    setIsDialogOpen(true);
  }

  function openNewCategory() {
    setDialogMode('category');
    setEditingCat({
      category_id: '', category_name: '', brand_match: [], keyword_pattern: '',
      main_category: null, default_template_id: null, priority: 0, is_active: true,
    });
    setEditingTag(null);
    setSelectedCategoryName('');
    setBrandInput('');
    setIsDialogOpen(true);
  }

  function openEditRule(rule: UnifiedRule) {
    if (rule.source === 'tag') {
      const raw = tagMappings?.find(t => t.id === rule.id);
      if (!raw) return;
      setDialogMode('tag');
      setEditingTag({
        id: raw.id,
        tag_value: raw.tag_value,
        primary_category: raw.primary_category || '',
        condition_type: raw.condition_type || '',
        ebay_category_id: raw.ebay_category_id || '',
        fulfillment_policy_id: raw.fulfillment_policy_id || '',
        payment_policy_id: raw.payment_policy_id || '',
        return_policy_id: raw.return_policy_id || '',
        price_markup_percent: raw.price_markup_percent?.toString() || '',
        is_active: raw.is_active,
      });
      setEditingCat(null);
    } else {
      const raw = catMappings?.find(c => c.id === rule.id);
      if (!raw) return;
      setDialogMode('category');
      setEditingCat({
        id: raw.id,
        category_id: raw.category_id,
        category_name: raw.category_name,
        brand_match: raw.brand_match || [],
        keyword_pattern: raw.keyword_pattern || '',
        main_category: raw.main_category,
        default_template_id: raw.default_template_id,
        priority: raw.priority ?? 0,
        is_active: raw.is_active ?? true,
      });
      setSelectedCategoryName(raw.category_name);
      setEditingTag(null);
      setBrandInput('');
    }
    setIsDialogOpen(true);
  }

  function deleteRule(rule: UnifiedRule) {
    if (!confirm('Delete this routing rule?')) return;
    if (rule.source === 'tag') deleteTagMutation.mutate(rule.id);
    else deleteCatMutation.mutate(rule.id);
  }

  function handleSave() {
    if (dialogMode === 'tag' && editingTag) {
      if (!editingTag.tag_value.trim()) { toast.error('Tag value is required'); return; }
      saveTagMutation.mutate(editingTag);
    } else if (dialogMode === 'category' && editingCat) {
      if (!editingCat.category_id) { toast.error('eBay category is required'); return; }
      saveCatMutation.mutate(editingCat);
    }
  }

  function addBrand() {
    if (!brandInput.trim() || !editingCat) return;
    if (!editingCat.brand_match.includes(brandInput.trim())) {
      setEditingCat({ ...editingCat, brand_match: [...editingCat.brand_match, brandInput.trim()] });
    }
    setBrandInput('');
  }

  // ── Policy Select helper ────────────────────────────────

  const PolicySelect = ({ value, options, onChange, placeholder }: {
    value: string; options: PolicyOption[]; onChange: (v: string) => void; placeholder: string;
  }) => (
    <Select value={value || '__none__'} onValueChange={v => onChange(v === '__none__' ? '' : v)}>
      <SelectTrigger className="h-9">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">— Default —</SelectItem>
        {options.map(p => <SelectItem key={p.policy_id} value={p.policy_id}>{p.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  // ── Match Type Badge ─────────────────────────────────────

  const MatchBadge = ({ type }: { type: MatchType }) => {
    const styles: Record<MatchType, string> = {
      tag: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
      brand: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
      keyword: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
    };
    return <Badge className={`text-xs font-medium ${styles[type]}`}>{type}</Badge>;
  };

  const isLoading = loadingTags || loadingCats;
  const isSaving = saveTagMutation.isPending || saveCatMutation.isPending;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // ── Render ───────────────────────────────────────────────

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>Mapping Rules</CardTitle>
              <CardDescription>
                Control how items are mapped to eBay categories, templates, policies, and pricing.
                Tag rules match Shopify tags. Brand/keyword rules match item titles.
              </CardDescription>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={openNewCategory}>
                <Plus className="h-4 w-4 mr-1" />
                Brand/Keyword
              </Button>
              <Button size="sm" onClick={openNewTag}>
                <Plus className="h-4 w-4 mr-1" />
                Tag Rule
              </Button>
            </div>
          </div>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter rules..."
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              className="pl-9 h-9 max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          {filteredRules.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No mapping rules configured. Items will use store defaults.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredRules.map(rule => (
                <div
                  key={`${rule.source}-${rule.id}`}
                  className={`flex items-center justify-between p-3 border rounded-lg transition-opacity ${!rule.isActive ? 'opacity-50' : ''}`}
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <MatchBadge type={rule.matchType} />
                      <span className="font-medium truncate">{rule.matchValue}</span>
                      {rule.mainCategory && (
                        <Badge variant="outline" className="text-xs">{rule.mainCategory}</Badge>
                      )}
                      {rule.primaryCategory && (
                        <Badge variant="outline" className="text-xs">cat: {rule.primaryCategory}</Badge>
                      )}
                      {rule.conditionType && (
                        <Badge variant="outline" className="text-xs">cond: {rule.conditionType}</Badge>
                      )}
                      {rule.priority > 0 && (
                        <span className="text-xs text-muted-foreground font-mono">P:{rule.priority}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {rule.ebayCategoryName && <span>→ {rule.ebayCategoryName}</span>}
                      {rule.ebayCategoryId && !rule.ebayCategoryName && <span>→ Cat #{rule.ebayCategoryId}</span>}
                      {rule.templateName && <span>• Template: {rule.templateName}</span>}
                      {rule.priceMarkup != null && <span>• +{rule.priceMarkup}%</span>}
                      {(rule.fulfillmentPolicyId || rule.paymentPolicyId || rule.returnPolicyId) && (
                        <span>• Policy overrides</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    <Switch
                      checked={rule.isActive}
                      onCheckedChange={() => toggleMutation.mutate({ rule })}
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditRule(rule)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => deleteRule(rule)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Edit/Create Dialog ── */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'tag'
                ? (editingTag?.id ? 'Edit Tag Rule' : 'New Tag Rule')
                : (editingCat?.id ? 'Edit Brand/Keyword Rule' : 'New Brand/Keyword Rule')}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === 'tag'
                ? 'Match items by their Shopify tags to set category, condition, policies, and markup.'
                : 'Match items by brand name or title keywords to route them to an eBay category and template.'}
            </DialogDescription>
          </DialogHeader>

          {dialogMode === 'tag' && editingTag && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Shopify Tag</Label>
                <Input
                  value={editingTag.tag_value}
                  onChange={e => setEditingTag({ ...editingTag, tag_value: e.target.value })}
                  placeholder="e.g. pokemon, graded, cgc"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Primary Category</Label>
                  <Input
                    value={editingTag.primary_category}
                    onChange={e => setEditingTag({ ...editingTag, primary_category: e.target.value })}
                    placeholder="e.g. pokemon"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Condition Type</Label>
                  <Input
                    value={editingTag.condition_type}
                    onChange={e => setEditingTag({ ...editingTag, condition_type: e.target.value })}
                    placeholder="e.g. graded"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>eBay Category</Label>
                <EbayCategorySelect
                  value={editingTag.ebay_category_id}
                  onValueChange={val => setEditingTag({ ...editingTag, ebay_category_id: val })}
                  placeholder="Select category..."
                />
              </div>
              <div className="space-y-2">
                <Label>Fulfillment Policy</Label>
                <PolicySelect value={editingTag.fulfillment_policy_id} options={policies?.fulfillment || []} onChange={v => setEditingTag({ ...editingTag, fulfillment_policy_id: v })} placeholder="Fulfillment" />
              </div>
              <div className="space-y-2">
                <Label>Payment Policy</Label>
                <PolicySelect value={editingTag.payment_policy_id} options={policies?.payment || []} onChange={v => setEditingTag({ ...editingTag, payment_policy_id: v })} placeholder="Payment" />
              </div>
              <div className="space-y-2">
                <Label>Return Policy</Label>
                <PolicySelect value={editingTag.return_policy_id} options={policies?.return || []} onChange={v => setEditingTag({ ...editingTag, return_policy_id: v })} placeholder="Return" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Price Markup %</Label>
                  <Input
                    type="number"
                    value={editingTag.price_markup_percent}
                    onChange={e => setEditingTag({ ...editingTag, price_markup_percent: e.target.value })}
                    placeholder="%"
                  />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch
                    checked={editingTag.is_active}
                    onCheckedChange={checked => setEditingTag({ ...editingTag, is_active: checked })}
                  />
                  <Label>Active</Label>
                </div>
              </div>
            </div>
          )}

          {dialogMode === 'category' && editingCat && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Item Type</Label>
                <Select
                  value={editingCat.main_category || 'none'}
                  onValueChange={v => setEditingCat({ ...editingCat, main_category: v === 'none' ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Any item type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Any</SelectItem>
                    {MAIN_CATEGORY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Brand Matches</Label>
                <div className="flex gap-2">
                  <Input
                    value={brandInput}
                    onChange={e => setBrandInput(e.target.value)}
                    placeholder="Add brand keyword..."
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addBrand())}
                  />
                  <Button type="button" variant="outline" onClick={addBrand}>Add</Button>
                </div>
                {editingCat.brand_match.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {editingCat.brand_match.map(b => (
                      <Badge key={b} variant="secondary" className="cursor-pointer" onClick={() => setEditingCat({ ...editingCat, brand_match: editingCat.brand_match.filter(x => x !== b) })}>
                        {b} ×
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Keyword Pattern (regex, optional)</Label>
                <Input
                  value={editingCat.keyword_pattern}
                  onChange={e => setEditingCat({ ...editingCat, keyword_pattern: e.target.value })}
                  placeholder="e.g., pokemon|pikachu"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>eBay Category</Label>
                <EbayCategorySelect
                  value={editingCat.category_id}
                  onValueChange={val => setEditingCat({ ...editingCat, category_id: val })}
                  onCategoryNameChange={setSelectedCategoryName}
                />
              </div>
              <div className="space-y-2">
                <Label>Default Template (optional)</Label>
                <Select
                  value={editingCat.default_template_id || 'none'}
                  onValueChange={v => setEditingCat({ ...editingCat, default_template_id: v === 'none' ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="No template linked" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No template</SelectItem>
                    {(templates || []).map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Input
                    type="number"
                    value={editingCat.priority}
                    onChange={e => setEditingCat({ ...editingCat, priority: parseInt(e.target.value) || 0 })}
                  />
                  <p className="text-xs text-muted-foreground">Higher = checked first</p>
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch
                    checked={editingCat.is_active}
                    onCheckedChange={checked => setEditingCat({ ...editingCat, is_active: checked })}
                  />
                  <Label>Active</Label>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {(editingTag?.id || editingCat?.id) ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
