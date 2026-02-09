import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, FolderTree, Search, Download, Loader2, Eye, EyeOff } from 'lucide-react';
import { useStore } from '@/contexts/StoreContext';

interface EbayCategory {
  id: string;
  name: string;
  parent_id: string | null;
  item_type: string | null;
  is_active: boolean;
  sort_order: number;
}

interface EbayRemoteCategory {
  id: string;
  name: string;
  parent_id: string | null;
  full_path: string;
  leaf?: boolean;
  has_children?: boolean;
}

const ITEM_TYPES = [
  { value: 'tcg', label: 'TCG / CCG' },
  { value: 'sports', label: 'Sports Cards' },
  { value: 'comics', label: 'Comics' },
  { value: 'other', label: 'Other' },
];

export function EbayCategoryManager() {
  const queryClient = useQueryClient();
  const { assignedStore } = useStore();
  const storeKey = assignedStore || '';

  // Local state
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<EbayCategory> | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedForDelete, setSelectedForDelete] = useState<Set<string>>(new Set());

  // eBay search state
  const [ebaySearchQuery, setEbaySearchQuery] = useState('');
  const [ebayResults, setEbayResults] = useState<EbayRemoteCategory[]>([]);
  const [ebaySearching, setEbaySearching] = useState(false);
  const [selectedToImport, setSelectedToImport] = useState<Set<string>>(new Set());

  // Fetch local categories
  const { data: categories, isLoading } = useQuery({
    queryKey: ['ebay-categories-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ebay_categories')
        .select('*')
        .order('sort_order');
      if (error) throw error;
      return data as EbayCategory[];
    },
  });

  // Save (upsert) mutation
  const saveMutation = useMutation({
    mutationFn: async (cat: Partial<EbayCategory>) => {
      if (!cat.id || !cat.name) throw new Error('Category ID and name are required');
      const payload = {
        id: cat.id,
        name: cat.name,
        parent_id: cat.parent_id || null,
        item_type: cat.item_type || null,
        is_active: cat.is_active ?? true,
        sort_order: cat.sort_order ?? 0,
      };
      const { error } = await supabase
        .from('ebay_categories')
        .upsert(payload, { onConflict: 'id' });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast.success('Category saved');
      setIsEditDialogOpen(false);
      setEditing(null);
    },
    onError: (err: any) => toast.error('Failed to save: ' + err.message),
  });

  // Toggle active mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('ebay_categories')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(),
    onError: (err: any) => toast.error('Failed to toggle: ' + err.message),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('ebay_categories')
        .delete()
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: (_, ids) => {
      invalidateAll();
      setSelectedForDelete(new Set());
      toast.success(`Deleted ${ids.length} categor${ids.length === 1 ? 'y' : 'ies'}`);
    },
    onError: (err: any) => toast.error('Failed to delete: ' + err.message),
  });

  // Import mutation
  const importMutation = useMutation({
    mutationFn: async (cats: EbayRemoteCategory[]) => {
      const maxSort = categories?.reduce((max, c) => Math.max(max, c.sort_order), 0) ?? 0;
      const rows = cats.map((cat, i) => ({
        id: cat.id,
        name: cat.name,
        parent_id: cat.parent_id || null,
        item_type: 'other' as string,
        is_active: true,
        sort_order: maxSort + i + 1,
      }));
      const { error } = await supabase
        .from('ebay_categories')
        .upsert(rows, { onConflict: 'id' });
      if (error) throw error;
    },
    onSuccess: (_, cats) => {
      invalidateAll();
      setSelectedToImport(new Set());
      toast.success(`Imported ${cats.length} categor${cats.length === 1 ? 'y' : 'ies'}`);
    },
    onError: (err: any) => toast.error('Failed to import: ' + err.message),
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['ebay-categories-admin'] });
    queryClient.invalidateQueries({ queryKey: ['ebay-categories'] });
  }

  // Search eBay for categories
  async function searchEbayCategories() {
    if (!ebaySearchQuery.trim() || !storeKey) return;
    setEbaySearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('ebay-fetch-categories', {
        body: { store_key: storeKey, query: ebaySearchQuery.trim() },
      });
      if (error) throw error;
      setEbayResults(data.categories || []);
      if (!data.categories?.length) {
        toast.info('No categories found for that search');
      }
    } catch (err: any) {
      toast.error('Search failed: ' + err.message);
    } finally {
      setEbaySearching(false);
    }
  }

  function handleImportSelected() {
    const toImport = ebayResults.filter((c) => selectedToImport.has(c.id));
    if (!toImport.length) return;
    importMutation.mutate(toImport);
  }

  // Helpers
  function openNew() {
    setEditing({ id: '', name: '', item_type: 'tcg', is_active: true, sort_order: (categories?.length ?? 0) + 1 });
    setIsEditDialogOpen(true);
  }

  function openEdit(cat: EbayCategory) {
    setEditing({ ...cat });
    setIsEditDialogOpen(true);
  }

  function toggleSelectForDelete(id: string) {
    setSelectedForDelete((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleBulkDelete() {
    if (!selectedForDelete.size) return;
    if (!confirm(`Delete ${selectedForDelete.size} selected categor${selectedForDelete.size === 1 ? 'y' : 'ies'}?`)) return;
    deleteMutation.mutate(Array.from(selectedForDelete));
  }

  // Already-imported IDs for highlighting in import dialog
  const existingIds = new Set(categories?.map((c) => c.id) || []);

  // Filtered list
  const filtered = (categories || []).filter((cat) => {
    if (!searchFilter) return true;
    const q = searchFilter.toLowerCase();
    return cat.name.toLowerCase().includes(q) || cat.id.includes(q) || (cat.item_type || '').toLowerCase().includes(q);
  });

  const typeColor = (t: string | null): 'default' | 'secondary' | 'outline' => {
    switch (t) {
      case 'tcg': return 'default';
      case 'sports': return 'secondary';
      default: return 'outline';
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FolderTree className="h-5 w-5" />
              eBay Categories
            </CardTitle>
            <CardDescription>
              Manage which categories appear in dropdowns. Toggle visibility, import from eBay, or add manually.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { setIsImportDialogOpen(true); setEbayResults([]); setSelectedToImport(new Set()); setEbaySearchQuery(''); }}>
              <Download className="h-4 w-4 mr-2" />
              Import from eBay
            </Button>
            <Button size="sm" onClick={openNew}>
              <Plus className="h-4 w-4 mr-2" />
              Add Manual
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search + Bulk Actions */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Filter categories..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
              />
            </div>
            {selectedForDelete.size > 0 && (
              <Button variant="destructive" size="sm" onClick={handleBulkDelete} disabled={deleteMutation.isPending}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete {selectedForDelete.size} selected
              </Button>
            )}
          </div>

          {/* Category List */}
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !filtered.length ? (
            <p className="text-center text-muted-foreground py-6">
              {searchFilter ? 'No categories match your filter.' : 'No categories yet. Add manually or import from eBay.'}
            </p>
          ) : (
            <div className="space-y-1">
              {filtered.map((cat) => (
                <div
                  key={cat.id}
                  className={`flex items-center gap-3 p-3 border rounded-lg transition-colors ${
                    !cat.is_active ? 'opacity-60' : ''
                  } ${selectedForDelete.has(cat.id) ? 'border-destructive bg-destructive/5' : ''}`}
                >
                  <Checkbox
                    checked={selectedForDelete.has(cat.id)}
                    onCheckedChange={() => toggleSelectForDelete(cat.id)}
                  />
                  <span className="font-mono text-xs text-muted-foreground w-16 shrink-0">{cat.id}</span>
                  <span className={`flex-1 text-sm ${!cat.is_active ? 'line-through text-muted-foreground' : ''}`}>
                    {cat.name}
                  </span>
                  <Badge variant={typeColor(cat.item_type)}>{cat.item_type || 'other'}</Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title={cat.is_active ? 'Hide from dropdowns' : 'Show in dropdowns'}
                    onClick={() => toggleActiveMutation.mutate({ id: cat.id, is_active: !cat.is_active })}
                  >
                    {cat.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(cat)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm(`Delete "${cat.name}"?`)) deleteMutation.mutate([cat.id]);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {categories && categories.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {categories.filter((c) => c.is_active).length} active / {categories.length} total categories
            </p>
          )}
        </CardContent>
      </Card>

      {/* Edit / Add Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing?.id && categories?.some((c) => c.id === editing.id) ? 'Edit Category' : 'Add eBay Category'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>eBay Category ID</Label>
              <Input
                value={editing?.id || ''}
                onChange={(e) => setEditing((prev) => (prev ? { ...prev, id: e.target.value } : prev))}
                placeholder="e.g. 183454"
                disabled={!!(editing?.id && categories?.some((c) => c.id === editing.id))}
              />
              <p className="text-xs text-muted-foreground">
                Find IDs at{' '}
                <a href="https://www.isoldwhat.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  isoldwhat.com
                </a>
              </p>
            </div>
            <div className="space-y-2">
              <Label>Display Name</Label>
              <Input
                value={editing?.name || ''}
                onChange={(e) => setEditing((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
                placeholder="e.g. CCG Individual Cards"
              />
            </div>
            <div className="space-y-2">
              <Label>Item Type</Label>
              <Select
                value={editing?.item_type || 'other'}
                onValueChange={(v) => setEditing((prev) => (prev ? { ...prev, item_type: v } : prev))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ITEM_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Sort Order</Label>
              <Input
                type="number"
                value={editing?.sort_order ?? 0}
                onChange={(e) =>
                  setEditing((prev) => (prev ? { ...prev, sort_order: parseInt(e.target.value) || 0 } : prev))
                }
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={editing?.is_active ?? true}
                onCheckedChange={(v) => setEditing((prev) => (prev ? { ...prev, is_active: v } : prev))}
              />
              <Label>Show in dropdowns</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => editing && saveMutation.mutate(editing)}
              disabled={saveMutation.isPending || !editing?.id || !editing?.name}
            >
              {saveMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import from eBay Dialog */}
      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Import Categories from eBay</DialogTitle>
            <DialogDescription>
              Search eBay's category tree and import the ones you need.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Search bar */}
            <div className="flex gap-2">
              <Input
                placeholder="Search eBay categories (e.g. 'trading cards', 'pokemon')..."
                value={ebaySearchQuery}
                onChange={(e) => setEbaySearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchEbayCategories()}
              />
              <Button onClick={searchEbayCategories} disabled={ebaySearching || !ebaySearchQuery.trim() || !storeKey}>
                {ebaySearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>

            {!storeKey && (
              <p className="text-sm text-destructive">No store selected. Please select an eBay store first.</p>
            )}

            {/* Results */}
            <ScrollArea className="max-h-[50vh]">
              {ebayResults.length > 0 ? (
                <div className="space-y-1 pr-4">
                  {ebayResults.map((cat) => {
                    const alreadyExists = existingIds.has(cat.id);
                    return (
                      <div
                        key={cat.id}
                        className={`flex items-center gap-3 p-3 border rounded-lg ${
                          alreadyExists ? 'opacity-50 bg-muted/30' : ''
                        }`}
                      >
                        <Checkbox
                          checked={selectedToImport.has(cat.id) || alreadyExists}
                          disabled={alreadyExists}
                          onCheckedChange={() => {
                            if (alreadyExists) return;
                            setSelectedToImport((prev) => {
                              const next = new Set(prev);
                              if (next.has(cat.id)) next.delete(cat.id);
                              else next.add(cat.id);
                              return next;
                            });
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-muted-foreground">{cat.id}</span>
                            <span className="font-medium text-sm">{cat.name}</span>
                            {alreadyExists && (
                              <Badge variant="secondary" className="text-xs">Already added</Badge>
                            )}
                          </div>
                          {cat.full_path && cat.full_path !== cat.name && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">{cat.full_path}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : ebaySearching ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-12">
                  Search for categories above to see results
                </p>
              )}
            </ScrollArea>
          </div>

          <Separator />

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsImportDialogOpen(false)}>
              Close
            </Button>
            <Button
              onClick={handleImportSelected}
              disabled={selectedToImport.size === 0 || importMutation.isPending}
            >
              {importMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Import {selectedToImport.size} selected
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
