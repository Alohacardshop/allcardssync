import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Trash2, Loader2 } from 'lucide-react';

interface TagCategoryMapping {
  id: string;
  tag_value: string;
  primary_category: string | null;
  condition_type: string | null;
  ebay_category_id: string | null;
  fulfillment_policy_id: string | null;
  payment_policy_id: string | null;
  return_policy_id: string | null;
  price_markup_percent: number | null;
  is_active: boolean;
}

interface PolicyOption {
  policy_id: string;
  name: string;
}

export function EbayTagCategoryMappings() {
  const [mappings, setMappings] = useState<TagCategoryMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [newMapping, setNewMapping] = useState({ tag_value: '', primary_category: '', condition_type: '', ebay_category_id: '', fulfillment_policy_id: '', payment_policy_id: '', return_policy_id: '', price_markup_percent: '' });
  const [adding, setAdding] = useState(false);
  const [fulfillmentPolicies, setFulfillmentPolicies] = useState<PolicyOption[]>([]);
  const [paymentPolicies, setPaymentPolicies] = useState<PolicyOption[]>([]);
  const [returnPolicies, setReturnPolicies] = useState<PolicyOption[]>([]);

  useEffect(() => {
    loadMappings();
    loadPolicies();
  }, []);

  const loadPolicies = async () => {
    const [fp, pp, rp] = await Promise.all([
      supabase.from('ebay_fulfillment_policies').select('policy_id, name').order('name'),
      supabase.from('ebay_payment_policies').select('policy_id, name').order('name'),
      supabase.from('ebay_return_policies').select('policy_id, name').order('name'),
    ]);
    setFulfillmentPolicies(fp.data || []);
    setPaymentPolicies(pp.data || []);
    setReturnPolicies(rp.data || []);
  };

  const loadMappings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('tag_category_mappings' as any)
        .select('*')
        .order('tag_value');
      if (error) throw error;
      setMappings((data as any[]) || []);
    } catch (e: any) {
      toast.error('Failed to load mappings: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const updateMapping = async (id: string, updates: Partial<TagCategoryMapping>) => {
    setSaving(id);
    try {
      const { error } = await supabase
        .from('tag_category_mappings' as any)
        .update(updates as any)
        .eq('id', id);
      if (error) throw error;
      setMappings(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
      toast.success('Mapping updated');
    } catch (e: any) {
      toast.error('Failed to update: ' + e.message);
    } finally {
      setSaving(null);
    }
  };

  const addMapping = async () => {
    if (!newMapping.tag_value.trim()) {
      toast.error('Tag value is required');
      return;
    }
    setAdding(true);
    try {
      const { data, error } = await supabase
        .from('tag_category_mappings' as any)
        .insert({
          tag_value: newMapping.tag_value.trim().toLowerCase(),
          primary_category: newMapping.primary_category.trim() || null,
          condition_type: newMapping.condition_type.trim() || null,
          ebay_category_id: newMapping.ebay_category_id.trim() || null,
          fulfillment_policy_id: newMapping.fulfillment_policy_id || null,
          payment_policy_id: newMapping.payment_policy_id || null,
          return_policy_id: newMapping.return_policy_id || null,
          price_markup_percent: newMapping.price_markup_percent ? parseFloat(newMapping.price_markup_percent) : null,
          is_active: true,
        } as any)
        .select()
        .single();
      if (error) throw error;
      setMappings(prev => [...prev, data as any]);
      setNewMapping({ tag_value: '', primary_category: '', condition_type: '', ebay_category_id: '', fulfillment_policy_id: '', payment_policy_id: '', return_policy_id: '', price_markup_percent: '' });
      toast.success('Mapping added');
    } catch (e: any) {
      toast.error('Failed to add: ' + e.message);
    } finally {
      setAdding(false);
    }
  };

  const deleteMapping = async (id: string) => {
    try {
      const { error } = await supabase
        .from('tag_category_mappings' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
      setMappings(prev => prev.filter(m => m.id !== id));
      toast.success('Mapping deleted');
    } catch (e: any) {
      toast.error('Failed to delete: ' + e.message);
    }
  };

  const PolicySelect = ({ value, options, onChange, placeholder }: { value: string | null; options: PolicyOption[]; onChange: (val: string | null) => void; placeholder: string }) => (
    <Select value={value || '__none__'} onValueChange={(v) => onChange(v === '__none__' ? null : v)}>
      <SelectTrigger className="h-8 w-36 text-xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">— Default —</SelectItem>
        {options.map(p => (
          <SelectItem key={p.policy_id} value={p.policy_id}>{p.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Tag → Category Mappings</CardTitle>
          <CardDescription>
            Control how Shopify tags map to categories, eBay policies, and price markup. Per-category policies override store defaults.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tag</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>eBay Cat ID</TableHead>
                <TableHead>Fulfillment</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Return</TableHead>
                <TableHead>Markup %</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mappings.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <Badge variant="secondary">{m.tag_value}</Badge>
                  </TableCell>
                  <TableCell>
                    <Input
                      value={m.primary_category || ''}
                      onChange={(e) => setMappings(prev => prev.map(x => x.id === m.id ? { ...x, primary_category: e.target.value || null } : x))}
                      onBlur={() => updateMapping(m.id, { primary_category: m.primary_category })}
                      placeholder="e.g. pokemon"
                      className="h-8 w-28"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={m.condition_type || ''}
                      onChange={(e) => setMappings(prev => prev.map(x => x.id === m.id ? { ...x, condition_type: e.target.value || null } : x))}
                      onBlur={() => updateMapping(m.id, { condition_type: m.condition_type })}
                      placeholder="e.g. graded"
                      className="h-8 w-24"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={m.ebay_category_id || ''}
                      onChange={(e) => setMappings(prev => prev.map(x => x.id === m.id ? { ...x, ebay_category_id: e.target.value || null } : x))}
                      onBlur={() => updateMapping(m.id, { ebay_category_id: m.ebay_category_id })}
                      placeholder="e.g. 183454"
                      className="h-8 w-24"
                    />
                  </TableCell>
                  <TableCell>
                    <PolicySelect
                      value={m.fulfillment_policy_id}
                      options={fulfillmentPolicies}
                      onChange={(v) => updateMapping(m.id, { fulfillment_policy_id: v })}
                      placeholder="Fulfillment"
                    />
                  </TableCell>
                  <TableCell>
                    <PolicySelect
                      value={m.payment_policy_id}
                      options={paymentPolicies}
                      onChange={(v) => updateMapping(m.id, { payment_policy_id: v })}
                      placeholder="Payment"
                    />
                  </TableCell>
                  <TableCell>
                    <PolicySelect
                      value={m.return_policy_id}
                      options={returnPolicies}
                      onChange={(v) => updateMapping(m.id, { return_policy_id: v })}
                      placeholder="Return"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={m.price_markup_percent ?? ''}
                      onChange={(e) => setMappings(prev => prev.map(x => x.id === m.id ? { ...x, price_markup_percent: e.target.value ? parseFloat(e.target.value) : null } : x))}
                      onBlur={() => updateMapping(m.id, { price_markup_percent: m.price_markup_percent })}
                      placeholder="%"
                      className="h-8 w-20"
                    />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={m.is_active}
                      onCheckedChange={(checked) => updateMapping(m.id, { is_active: checked })}
                    />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteMapping(m.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {/* Add new row */}
              <TableRow>
                <TableCell>
                  <Input
                    value={newMapping.tag_value}
                    onChange={(e) => setNewMapping(p => ({ ...p, tag_value: e.target.value }))}
                    placeholder="new tag"
                    className="h-8 w-28"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={newMapping.primary_category}
                    onChange={(e) => setNewMapping(p => ({ ...p, primary_category: e.target.value }))}
                    placeholder="category"
                    className="h-8 w-28"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={newMapping.condition_type}
                    onChange={(e) => setNewMapping(p => ({ ...p, condition_type: e.target.value }))}
                    placeholder="condition"
                    className="h-8 w-24"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={newMapping.ebay_category_id}
                    onChange={(e) => setNewMapping(p => ({ ...p, ebay_category_id: e.target.value }))}
                    placeholder="ebay cat id"
                    className="h-8 w-24"
                  />
                </TableCell>
                <TableCell>
                  <PolicySelect
                    value={newMapping.fulfillment_policy_id || null}
                    options={fulfillmentPolicies}
                    onChange={(v) => setNewMapping(p => ({ ...p, fulfillment_policy_id: v || '' }))}
                    placeholder="Fulfillment"
                  />
                </TableCell>
                <TableCell>
                  <PolicySelect
                    value={newMapping.payment_policy_id || null}
                    options={paymentPolicies}
                    onChange={(v) => setNewMapping(p => ({ ...p, payment_policy_id: v || '' }))}
                    placeholder="Payment"
                  />
                </TableCell>
                <TableCell>
                  <PolicySelect
                    value={newMapping.return_policy_id || null}
                    options={returnPolicies}
                    onChange={(v) => setNewMapping(p => ({ ...p, return_policy_id: v || '' }))}
                    placeholder="Return"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    value={newMapping.price_markup_percent}
                    onChange={(e) => setNewMapping(p => ({ ...p, price_markup_percent: e.target.value }))}
                    placeholder="%"
                    className="h-8 w-20"
                  />
                </TableCell>
                <TableCell colSpan={2}>
                  <Button size="sm" onClick={addMapping} disabled={adding}>
                    {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                    Add
                  </Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
