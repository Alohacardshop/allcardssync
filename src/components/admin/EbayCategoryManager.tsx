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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, FolderTree } from 'lucide-react';

interface EbayCategory {
  id: string;
  name: string;
  parent_id: string | null;
  item_type: string | null;
  is_active: boolean;
  sort_order: number;
}

const ITEM_TYPES = [
  { value: 'tcg', label: 'TCG / CCG' },
  { value: 'sports', label: 'Sports Cards' },
  { value: 'comics', label: 'Comics' },
  { value: 'other', label: 'Other' },
];

export function EbayCategoryManager() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<EbayCategory> | null>(null);

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

      // upsert so admins can edit existing categories
      const { error } = await supabase
        .from('ebay_categories')
        .upsert(payload, { onConflict: 'id' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ebay-categories-admin'] });
      queryClient.invalidateQueries({ queryKey: ['ebay-categories'] });
      toast.success('Category saved');
      setIsDialogOpen(false);
      setEditing(null);
    },
    onError: (err: any) => toast.error('Failed to save: ' + err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ebay_categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ebay-categories-admin'] });
      queryClient.invalidateQueries({ queryKey: ['ebay-categories'] });
      toast.success('Category deleted');
    },
    onError: (err: any) => toast.error('Failed to delete: ' + err.message),
  });

  function openNew() {
    setEditing({ id: '', name: '', item_type: 'tcg', is_active: true, sort_order: (categories?.length ?? 0) + 1 });
    setIsDialogOpen(true);
  }

  function openEdit(cat: EbayCategory) {
    setEditing({ ...cat });
    setIsDialogOpen(true);
  }

  const typeColor = (t: string | null) => {
    switch (t) {
      case 'tcg': return 'default';
      case 'sports': return 'secondary';
      case 'comics': return 'outline';
      default: return 'outline';
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FolderTree className="h-5 w-5" />
            eBay Categories
          </CardTitle>
          <CardDescription>Manage the eBay category list used across templates and listings</CardDescription>
        </div>
        <Button onClick={openNew} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Category
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : !categories?.length ? (
          <p className="text-center text-muted-foreground py-6">No categories yet. Add your first eBay category.</p>
        ) : (
          <div className="space-y-2">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-muted-foreground w-16">{cat.id}</span>
                  <span className={!cat.is_active ? 'text-muted-foreground line-through' : ''}>{cat.name}</span>
                  <Badge variant={typeColor(cat.item_type) as any}>{cat.item_type || 'other'}</Badge>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(cat)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm(`Delete category "${cat.name}"?`)) deleteMutation.mutate(cat.id);
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

      {/* Add / Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.id && categories?.some(c => c.id === editing.id) ? 'Edit Category' : 'Add eBay Category'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>eBay Category ID</Label>
              <Input
                value={editing?.id || ''}
                onChange={(e) => setEditing(prev => prev ? { ...prev, id: e.target.value } : prev)}
                placeholder="e.g. 183454"
                disabled={!!(editing?.id && categories?.some(c => c.id === editing.id))}
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
                onChange={(e) => setEditing(prev => prev ? { ...prev, name: e.target.value } : prev)}
                placeholder="e.g. CCG Individual Cards"
              />
            </div>
            <div className="space-y-2">
              <Label>Item Type</Label>
              <Select
                value={editing?.item_type || 'other'}
                onValueChange={(v) => setEditing(prev => prev ? { ...prev, item_type: v } : prev)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ITEM_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Sort Order</Label>
              <Input
                type="number"
                value={editing?.sort_order ?? 0}
                onChange={(e) => setEditing(prev => prev ? { ...prev, sort_order: parseInt(e.target.value) || 0 } : prev)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={editing?.is_active ?? true}
                onCheckedChange={(v) => setEditing(prev => prev ? { ...prev, is_active: v } : prev)}
              />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => editing && saveMutation.mutate(editing)}
              disabled={saveMutation.isPending || !editing?.id || !editing?.name}
            >
              {saveMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
