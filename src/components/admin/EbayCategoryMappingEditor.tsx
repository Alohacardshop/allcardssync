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
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Tag, Loader2 } from 'lucide-react';
import { EbayCategorySelect } from './EbayCategorySelect';

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

interface EbayCategoryMappingEditorProps {
  storeKey: string;
  templates: { id: string; name: string }[];
}

const MAIN_CATEGORY_OPTIONS = [
  { value: 'tcg', label: 'TCG' },
  { value: 'sports', label: 'Sports' },
  { value: 'comics', label: 'Comics' },
  { value: 'other', label: 'Other' },
];

export function EbayCategoryMappingEditor({ storeKey, templates }: EbayCategoryMappingEditorProps) {
  const queryClient = useQueryClient();
  const [editingMapping, setEditingMapping] = useState<Partial<CategoryMapping> | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [brandInput, setBrandInput] = useState('');
  const [selectedCategoryName, setSelectedCategoryName] = useState('');

  const { data: mappings, isLoading } = useQuery({
    queryKey: ['ebay-category-mappings', storeKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ebay_category_mappings')
        .select('*')
        .eq('store_key', storeKey)
        .order('priority', { ascending: false });
      if (error) throw error;
      return data as CategoryMapping[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (mapping: Partial<CategoryMapping>) => {
      const payload = {
        store_key: storeKey,
        category_id: mapping.category_id || '',
        category_name: selectedCategoryName || mapping.category_name || mapping.category_id || '',
        brand_match: mapping.brand_match || [],
        keyword_pattern: mapping.keyword_pattern || null,
        main_category: mapping.main_category || null,
        default_template_id: mapping.default_template_id || null,
        priority: mapping.priority ?? 0,
        is_active: mapping.is_active ?? true,
      };

      if (mapping.id) {
        const { error } = await supabase
          .from('ebay_category_mappings')
          .update(payload)
          .eq('id', mapping.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('ebay_category_mappings')
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ebay-category-mappings', storeKey] });
      setIsDialogOpen(false);
      setEditingMapping(null);
      setSelectedCategoryName('');
      toast.success(editingMapping?.id ? 'Mapping updated' : 'Mapping created');
    },
    onError: (error: any) => {
      toast.error('Failed to save mapping: ' + error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('ebay_category_mappings')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ebay-category-mappings', storeKey] });
      toast.success('Mapping deleted');
    },
    onError: (error: any) => {
      toast.error('Failed to delete: ' + error.message);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('ebay_category_mappings')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ebay-category-mappings', storeKey] });
    },
  });

  function openNew() {
    setEditingMapping({
      category_id: '',
      category_name: '',
      brand_match: [],
      keyword_pattern: '',
      main_category: null,
      default_template_id: null,
      priority: 0,
      is_active: true,
    });
    setSelectedCategoryName('');
    setBrandInput('');
    setIsDialogOpen(true);
  }

  function openEdit(mapping: CategoryMapping) {
    setEditingMapping(mapping);
    setSelectedCategoryName(mapping.category_name);
    setBrandInput('');
    setIsDialogOpen(true);
  }

  function addBrand() {
    if (!brandInput.trim()) return;
    const brands = editingMapping?.brand_match || [];
    if (!brands.includes(brandInput.trim())) {
      setEditingMapping({
        ...editingMapping,
        brand_match: [...brands, brandInput.trim()],
      });
    }
    setBrandInput('');
  }

  function removeBrand(brand: string) {
    setEditingMapping({
      ...editingMapping,
      brand_match: (editingMapping?.brand_match || []).filter(b => b !== brand),
    });
  }

  function handleSave() {
    if (!editingMapping?.category_id) {
      toast.error('eBay category is required');
      return;
    }
    saveMutation.mutate(editingMapping);
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              Category Mappings
            </CardTitle>
            <CardDescription>
              Route items to specific templates and categories based on brand, keyword, or item type
            </CardDescription>
          </div>
          <Button onClick={openNew} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            New Mapping
          </Button>
        </CardHeader>
        <CardContent>
          {!mappings?.length ? (
            <div className="text-center py-4 text-muted-foreground">
              No category mappings configured. Items will use the default template.
            </div>
          ) : (
            <div className="space-y-2">
              {mappings.map((mapping) => (
                <div
                  key={mapping.id}
                  className={`flex items-center justify-between p-3 border rounded-lg ${!mapping.is_active ? 'opacity-50' : ''}`}
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{mapping.category_name}</span>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {mapping.main_category || 'any'}
                      </Badge>
                      <span className="text-xs text-muted-foreground font-mono shrink-0">
                        P:{mapping.priority}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {mapping.brand_match?.map(brand => (
                        <Badge key={brand} variant="secondary" className="text-xs">{brand}</Badge>
                      ))}
                      {mapping.keyword_pattern && (
                        <Badge variant="outline" className="text-xs font-mono">/{mapping.keyword_pattern}/</Badge>
                      )}
                    </div>
                    {mapping.default_template_id && (
                      <div className="text-xs text-muted-foreground">
                        → {templates.find(t => t.id === mapping.default_template_id)?.name || 'Unknown template'}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    <Switch
                      checked={mapping.is_active}
                      onCheckedChange={(checked) => toggleMutation.mutate({ id: mapping.id, is_active: checked })}
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(mapping)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm('Delete this mapping?')) deleteMutation.mutate(mapping.id);
                      }}
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

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingMapping?.id ? 'Edit Mapping' : 'New Category Mapping'}</DialogTitle>
            <DialogDescription>
              Route items matching these criteria to a specific eBay category and template
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Item Type</Label>
              <Select
                value={editingMapping?.main_category || 'none'}
                onValueChange={(v) => setEditingMapping({ ...editingMapping, main_category: v === 'none' ? null : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any item type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Any</SelectItem>
                  {MAIN_CATEGORY_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Brand Matches</Label>
              <div className="flex gap-2">
                <Input
                  value={brandInput}
                  onChange={(e) => setBrandInput(e.target.value)}
                  placeholder="Add brand keyword..."
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addBrand())}
                />
                <Button type="button" variant="outline" onClick={addBrand}>Add</Button>
              </div>
              {editingMapping?.brand_match?.length ? (
                <div className="flex flex-wrap gap-1 mt-2">
                  {editingMapping.brand_match.map(brand => (
                    <Badge key={brand} variant="secondary" className="cursor-pointer" onClick={() => removeBrand(brand)}>
                      {brand} ×
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>Keyword Pattern (regex, optional)</Label>
              <Input
                value={editingMapping?.keyword_pattern || ''}
                onChange={(e) => setEditingMapping({ ...editingMapping, keyword_pattern: e.target.value })}
                placeholder="e.g., pokemon|pikachu"
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label>eBay Category</Label>
              <EbayCategorySelect
                value={editingMapping?.category_id || ''}
                onValueChange={(value) => setEditingMapping({ ...editingMapping, category_id: value })}
                onCategoryNameChange={setSelectedCategoryName}
              />
            </div>

            <div className="space-y-2">
              <Label>Default Template (optional)</Label>
              <Select
                value={editingMapping?.default_template_id || 'none'}
                onValueChange={(v) => setEditingMapping({ ...editingMapping, default_template_id: v === 'none' ? null : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No template linked" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No template</SelectItem>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Priority</Label>
                <Input
                  type="number"
                  value={editingMapping?.priority ?? 0}
                  onChange={(e) => setEditingMapping({ ...editingMapping, priority: parseInt(e.target.value) || 0 })}
                />
                <p className="text-xs text-muted-foreground">Higher = checked first</p>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch
                  checked={editingMapping?.is_active ?? true}
                  onCheckedChange={(checked) => setEditingMapping({ ...editingMapping, is_active: checked })}
                />
                <Label>Active</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingMapping?.id ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
