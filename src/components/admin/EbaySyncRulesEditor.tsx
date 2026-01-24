import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  ArrowUp,
  ArrowDown,
  Filter,
  CheckCircle2,
  XCircle,
  Loader2,
  Sparkles,
  Play,
} from 'lucide-react';
import { toast } from 'sonner';

interface SyncRule {
  id: string;
  store_key: string;
  name: string;
  rule_type: 'include' | 'exclude';
  category_match: string[];
  brand_match: string[];
  min_price: number | null;
  max_price: number | null;
  graded_only: boolean;
  priority: number;
  is_active: boolean;
  auto_queue: boolean;
  created_at: string;
  updated_at: string;
}

const CATEGORY_OPTIONS = [
  { value: 'Pokemon', label: 'Pokemon' },
  { value: 'Magic', label: 'Magic: The Gathering' },
  { value: 'Yu-Gi-Oh', label: 'Yu-Gi-Oh!' },
  { value: 'Baseball', label: 'Baseball' },
  { value: 'Basketball', label: 'Basketball' },
  { value: 'Football', label: 'Football' },
  { value: 'Hockey', label: 'Hockey' },
  { value: 'Soccer', label: 'Soccer' },
  { value: 'Comics', label: 'Comics' },
  { value: 'Other TCG', label: 'Other TCG' },
];

const DEFAULT_RULE: Partial<SyncRule> = {
  name: '',
  rule_type: 'include',
  category_match: [],
  brand_match: [],
  min_price: null,
  max_price: null,
  graded_only: false,
  priority: 0,
  is_active: true,
  auto_queue: false,
};

export function EbaySyncRulesEditor() {
  const queryClient = useQueryClient();
  const { assignedStore } = useStore();
  const storeKey = assignedStore || 'hawaii';

  const [editingRule, setEditingRule] = useState<Partial<SyncRule> | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [brandInput, setBrandInput] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [previewCount, setPreviewCount] = useState<number | null>(null);

  // Fetch rules
  const { data: rules, isLoading } = useQuery({
    queryKey: ['ebay-sync-rules', storeKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ebay_sync_rules')
        .select('*')
        .eq('store_key', storeKey)
        .order('priority', { ascending: false });
      
      if (error) throw error;
      return data as SyncRule[];
    },
  });

  // Create/update rule mutation
  const saveMutation = useMutation({
    mutationFn: async (rule: Partial<SyncRule>) => {
      if (rule.id) {
        // Update
        const { data, error } = await supabase
          .from('ebay_sync_rules')
          .update({
            name: rule.name,
            rule_type: rule.rule_type,
            category_match: rule.category_match,
            brand_match: rule.brand_match,
            min_price: rule.min_price,
            max_price: rule.max_price,
            graded_only: rule.graded_only,
            priority: rule.priority,
            is_active: rule.is_active,
            auto_queue: rule.auto_queue,
          })
          .eq('id', rule.id)
          .select()
          .single();
        
        if (error) throw error;
        return data;
      } else {
        // Create
        const { data, error } = await supabase
          .from('ebay_sync_rules')
          .insert({
            store_key: storeKey,
            name: rule.name,
            rule_type: rule.rule_type || 'include',
            category_match: rule.category_match || [],
            brand_match: rule.brand_match || [],
            min_price: rule.min_price,
            max_price: rule.max_price,
            graded_only: rule.graded_only ?? false,
            priority: rule.priority ?? 0,
            is_active: rule.is_active ?? true,
            auto_queue: rule.auto_queue ?? false,
          })
          .select()
          .single();
        
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ebay-sync-rules', storeKey] });
      setIsDialogOpen(false);
      setEditingRule(null);
      toast.success(editingRule?.id ? 'Rule updated' : 'Rule created');
    },
    onError: (error) => {
      toast.error(`Failed to save rule: ${error.message}`);
    },
  });

  // Delete rule mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('ebay_sync_rules')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ebay-sync-rules', storeKey] });
      toast.success('Rule deleted');
    },
    onError: (error) => {
      toast.error(`Failed to delete rule: ${error.message}`);
    },
  });

  // Toggle rule active state
  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('ebay_sync_rules')
        .update({ is_active })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ebay-sync-rules', storeKey] });
    },
  });

  // Update priority mutation
  const priorityMutation = useMutation({
    mutationFn: async ({ id, priority }: { id: string; priority: number }) => {
      const { error } = await supabase
        .from('ebay_sync_rules')
        .update({ priority })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ebay-sync-rules', storeKey] });
    },
  });

  // Apply rules
  const applyRules = async (dryRun: boolean = true) => {
    setIsApplying(true);
    setPreviewCount(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('ebay-apply-sync-rules', {
        body: { store_key: storeKey, dry_run: dryRun },
      });

      if (error) throw error;

      if (dryRun) {
        setPreviewCount(data.matched_count || 0);
        toast.info(`Preview: ${data.matched_count} items would be affected`);
      } else {
        toast.success(`Applied rules: ${data.matched_count} items updated`);
        queryClient.invalidateQueries({ queryKey: ['ebay-bulk-listing-items'] });
      }
    } catch (error: any) {
      toast.error(`Failed to apply rules: ${error.message}`);
    } finally {
      setIsApplying(false);
    }
  };

  const handleOpenNew = () => {
    setEditingRule({ ...DEFAULT_RULE });
    setIsDialogOpen(true);
  };

  const handleEdit = (rule: SyncRule) => {
    setEditingRule(rule);
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    if (!editingRule?.name?.trim()) {
      toast.error('Rule name is required');
      return;
    }
    saveMutation.mutate(editingRule);
  };

  const addBrand = () => {
    if (!brandInput.trim()) return;
    const brands = editingRule?.brand_match || [];
    if (!brands.includes(brandInput.trim())) {
      setEditingRule({
        ...editingRule,
        brand_match: [...brands, brandInput.trim()],
      });
    }
    setBrandInput('');
  };

  const removeBrand = (brand: string) => {
    setEditingRule({
      ...editingRule,
      brand_match: (editingRule?.brand_match || []).filter(b => b !== brand),
    });
  };

  const toggleCategory = (category: string) => {
    const categories = editingRule?.category_match || [];
    if (categories.includes(category)) {
      setEditingRule({
        ...editingRule,
        category_match: categories.filter(c => c !== category),
      });
    } else {
      setEditingRule({
        ...editingRule,
        category_match: [...categories, category],
      });
    }
  };

  const movePriority = (rule: SyncRule, direction: 'up' | 'down') => {
    const currentIdx = rules?.findIndex(r => r.id === rule.id) || 0;
    const targetIdx = direction === 'up' ? currentIdx - 1 : currentIdx + 1;
    
    if (!rules || targetIdx < 0 || targetIdx >= rules.length) return;
    
    const targetRule = rules[targetIdx];
    const tempPriority = rule.priority;
    
    priorityMutation.mutate({ id: rule.id, priority: targetRule.priority });
    priorityMutation.mutate({ id: targetRule.id, priority: tempPriority });
  };

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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              eBay Sync Rules
            </CardTitle>
            <CardDescription>
              Define rules to automatically flag items for eBay listing
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => applyRules(true)}
              disabled={isApplying || !rules?.length}
            >
              {isApplying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}
              Preview
              {previewCount !== null && ` (${previewCount})`}
            </Button>
            <Button 
              variant="default" 
              size="sm"
              onClick={() => applyRules(false)}
              disabled={isApplying || !rules?.length}
            >
              {isApplying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              Apply Rules
            </Button>
            <Button onClick={handleOpenNew}>
              <Plus className="h-4 w-4 mr-2" />
              Add Rule
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!rules?.length ? (
          <div className="text-center py-12 text-muted-foreground">
            <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">No sync rules configured</p>
            <p className="text-sm mb-4">Create rules to automatically include or exclude items from eBay sync</p>
            <Button onClick={handleOpenNew}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Rule
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">Active</TableHead>
                <TableHead className="w-[50px]">Type</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Filters</TableHead>
                <TableHead>Auto Queue</TableHead>
                <TableHead className="w-[120px]">Priority</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule, idx) => (
                <TableRow key={rule.id} className={!rule.is_active ? 'opacity-50' : ''}>
                  <TableCell>
                    <Switch
                      checked={rule.is_active}
                      onCheckedChange={(checked) => toggleMutation.mutate({ id: rule.id, is_active: checked })}
                    />
                  </TableCell>
                  <TableCell>
                    {rule.rule_type === 'include' ? (
                      <Badge className="bg-green-600 hover:bg-green-700">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Include
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        <XCircle className="h-3 w-3 mr-1" />
                        Exclude
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{rule.name}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {rule.category_match?.map(cat => (
                        <Badge key={cat} variant="outline" className="text-xs">{cat}</Badge>
                      ))}
                      {rule.brand_match?.map(brand => (
                        <Badge key={brand} variant="secondary" className="text-xs">{brand}</Badge>
                      ))}
                      {rule.min_price && (
                        <Badge variant="outline" className="text-xs">≥${rule.min_price}</Badge>
                      )}
                      {rule.max_price && (
                        <Badge variant="outline" className="text-xs">≤${rule.max_price}</Badge>
                      )}
                      {rule.graded_only && (
                        <Badge variant="outline" className="text-xs">Graded Only</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {rule.auto_queue ? (
                      <Badge className="bg-blue-600">Auto</Badge>
                    ) : (
                      <span className="text-muted-foreground">Manual</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => movePriority(rule, 'up')}
                        disabled={idx === 0}
                      >
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <span className="text-sm font-mono w-6 text-center">{rule.priority}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => movePriority(rule, 'down')}
                        disabled={idx === rules.length - 1}
                      >
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleEdit(rule)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm('Delete this rule?')) {
                            deleteMutation.mutate(rule.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Edit/Create Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingRule?.id ? 'Edit Sync Rule' : 'Create Sync Rule'}
              </DialogTitle>
              <DialogDescription>
                Define criteria for items to include or exclude from eBay sync
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name">Rule Name</Label>
                <Input
                  id="name"
                  value={editingRule?.name || ''}
                  onChange={(e) => setEditingRule({ ...editingRule, name: e.target.value })}
                  placeholder="e.g., High Value Pokemon"
                />
              </div>

              {/* Rule Type */}
              <div className="space-y-2">
                <Label>Rule Type</Label>
                <Select
                  value={editingRule?.rule_type || 'include'}
                  onValueChange={(v) => setEditingRule({ ...editingRule, rule_type: v as 'include' | 'exclude' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="include">
                      <span className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        Include - Mark matching items for eBay
                      </span>
                    </SelectItem>
                    <SelectItem value="exclude">
                      <span className="flex items-center gap-2">
                        <XCircle className="h-4 w-4 text-destructive" />
                        Exclude - Skip matching items
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Categories */}
              <div className="space-y-2">
                <Label>Categories</Label>
                <div className="flex flex-wrap gap-2 p-3 border rounded-lg">
                  {CATEGORY_OPTIONS.map((opt) => (
                    <Badge
                      key={opt.value}
                      variant={editingRule?.category_match?.includes(opt.value) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => toggleCategory(opt.value)}
                    >
                      {opt.label}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Brands */}
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
                {editingRule?.brand_match?.length ? (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {editingRule.brand_match.map((brand) => (
                      <Badge 
                        key={brand} 
                        variant="secondary"
                        className="cursor-pointer"
                        onClick={() => removeBrand(brand)}
                      >
                        {brand} ×
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>

              {/* Price Range */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="min_price">Min Price ($)</Label>
                  <Input
                    id="min_price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={editingRule?.min_price ?? ''}
                    onChange={(e) => setEditingRule({ 
                      ...editingRule, 
                      min_price: e.target.value ? parseFloat(e.target.value) : null 
                    })}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max_price">Max Price ($)</Label>
                  <Input
                    id="max_price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={editingRule?.max_price ?? ''}
                    onChange={(e) => setEditingRule({ 
                      ...editingRule, 
                      max_price: e.target.value ? parseFloat(e.target.value) : null 
                    })}
                    placeholder="No limit"
                  />
                </div>
              </div>

              {/* Toggles */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Graded Only</Label>
                    <p className="text-xs text-muted-foreground">Only match graded/slabbed items</p>
                  </div>
                  <Switch
                    checked={editingRule?.graded_only ?? false}
                    onCheckedChange={(checked) => setEditingRule({ ...editingRule, graded_only: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Auto Queue</Label>
                    <p className="text-xs text-muted-foreground">Automatically add to sync queue</p>
                  </div>
                  <Switch
                    checked={editingRule?.auto_queue ?? false}
                    onCheckedChange={(checked) => setEditingRule({ ...editingRule, auto_queue: checked })}
                  />
                </div>
              </div>

              {/* Priority */}
              <div className="space-y-2">
                <Label htmlFor="priority">Priority (higher = processed first)</Label>
                <Input
                  id="priority"
                  type="number"
                  value={editingRule?.priority ?? 0}
                  onChange={(e) => setEditingRule({ ...editingRule, priority: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingRule?.id ? 'Update Rule' : 'Create Rule'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
