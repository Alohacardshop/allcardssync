import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Edit, Trash2, Loader2, Truck, CreditCard, RotateCcw, RefreshCw } from 'lucide-react';
import { DeleteConfirmationDialog } from '@/components/ConfirmationDialog';

interface EbayPolicyEditorProps {
  storeKey: string;
  marketplaceId: string;
  isConnected: boolean;
  onPoliciesChanged?: () => void;
}

interface FulfillmentPolicy {
  id: string;
  policy_id: string;
  name: string;
  description: string | null;
  handling_time: any;
  shipping_options: any;
  is_default: boolean;
}

interface PaymentPolicy {
  id: string;
  policy_id: string;
  name: string;
  description: string | null;
  payment_methods: any;
  is_default: boolean;
}

interface ReturnPolicy {
  id: string;
  policy_id: string;
  name: string;
  description: string | null;
  returns_accepted: boolean;
  return_period: string | null;
  refund_method: string | null;
  is_default: boolean;
}

type PolicyType = 'fulfillment' | 'payment' | 'return';

// Common shipping services for US
const COMMON_SHIPPING_SERVICES = [
  { code: 'USPSPriority', name: 'USPS Priority Mail' },
  { code: 'USPSFirstClass', name: 'USPS First Class' },
  { code: 'USPSParcel', name: 'USPS Parcel Select' },
  { code: 'UPSGround', name: 'UPS Ground' },
  { code: 'UPS3rdDay', name: 'UPS 3 Day Select' },
  { code: 'UPS2ndDay', name: 'UPS 2nd Day Air' },
  { code: 'UPSNextDay', name: 'UPS Next Day Air' },
  { code: 'FedExHomeDelivery', name: 'FedEx Home Delivery' },
  { code: 'FedExGround', name: 'FedEx Ground' },
  { code: 'FedEx2Day', name: 'FedEx 2Day' },
  { code: 'Other', name: 'Other (Standard Shipping)' },
];

export function EbayPolicyEditor({ storeKey, marketplaceId, isConnected, onPoliciesChanged }: EbayPolicyEditorProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  
  // Policy lists
  const [fulfillmentPolicies, setFulfillmentPolicies] = useState<FulfillmentPolicy[]>([]);
  const [paymentPolicies, setPaymentPolicies] = useState<PaymentPolicy[]>([]);
  const [returnPolicies, setReturnPolicies] = useState<ReturnPolicy[]>([]);
  
  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<PolicyType>('fulfillment');
  const [editingPolicy, setEditingPolicy] = useState<any>(null);
  const [isNewPolicy, setIsNewPolicy] = useState(false);
  
  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingPolicy, setDeletingPolicy] = useState<{ type: PolicyType; id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  
  // Form state for new/edit
  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    if (storeKey) {
      loadPolicies();
    }
  }, [storeKey]);

  const loadPolicies = async () => {
    setLoading(true);
    try {
      const [fulfillment, payment, returns] = await Promise.all([
        supabase.from('ebay_fulfillment_policies').select('*').eq('store_key', storeKey).order('name'),
        supabase.from('ebay_payment_policies').select('*').eq('store_key', storeKey).order('name'),
        supabase.from('ebay_return_policies').select('*').eq('store_key', storeKey).order('name'),
      ]);

      setFulfillmentPolicies(fulfillment.data || []);
      setPaymentPolicies(payment.data || []);
      setReturnPolicies(returns.data || []);
    } catch (error: any) {
      console.error('Failed to load policies:', error);
    } finally {
      setLoading(false);
    }
  };

  const syncPolicies = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('ebay-sync-policies', {
        body: { store_key: storeKey }
      });

      if (error) throw error;
      toast.success(data.message || 'Policies synced from eBay');
      await loadPolicies();
      onPoliciesChanged?.();
    } catch (error: any) {
      toast.error('Failed to sync policies: ' + error.message);
    } finally {
      setSyncing(false);
    }
  };

  const openNewPolicyDialog = (type: PolicyType) => {
    setEditingType(type);
    setIsNewPolicy(true);
    setEditingPolicy(null);
    
    // Set default form data based on type
    if (type === 'fulfillment') {
      setFormData({
        name: '',
        description: '',
        handlingTime: { value: 1, unit: 'BUSINESS_DAY' },
        shippingService: 'USPSPriority',
        shippingCost: '5.00',
        freeShipping: false,
      });
    } else if (type === 'payment') {
      setFormData({
        name: '',
        description: '',
        immediatePay: true,
      });
    } else {
      setFormData({
        name: '',
        description: '',
        returnsAccepted: true,
        returnPeriodValue: 30,
        returnPeriodUnit: 'DAY',
        refundMethod: 'MONEY_BACK',
        returnShippingCostPayer: 'BUYER',
      });
    }
    
    setEditDialogOpen(true);
  };

  const openEditPolicyDialog = (type: PolicyType, policy: any) => {
    setEditingType(type);
    setIsNewPolicy(false);
    setEditingPolicy(policy);
    
    // Parse existing policy data
    if (type === 'fulfillment') {
      const handlingTime = policy.handling_time || { value: 1, unit: 'BUSINESS_DAY' };
      const shippingOptions = policy.shipping_options || [];
      const domesticOption = shippingOptions.find((o: any) => o.optionType === 'DOMESTIC');
      const service = domesticOption?.shippingServices?.[0];
      
      setFormData({
        name: policy.name,
        description: policy.description || '',
        handlingTime: handlingTime,
        shippingService: service?.shippingServiceCode || 'USPSPriority',
        shippingCost: service?.shippingCost?.value || '5.00',
        freeShipping: service?.freeShipping || false,
      });
    } else if (type === 'payment') {
      setFormData({
        name: policy.name,
        description: policy.description || '',
        immediatePay: true,
      });
    } else {
      const periodMatch = policy.return_period?.match(/(\d+)\s+(\w+)/);
      setFormData({
        name: policy.name,
        description: policy.description || '',
        returnsAccepted: policy.returns_accepted,
        returnPeriodValue: periodMatch ? parseInt(periodMatch[1]) : 30,
        returnPeriodUnit: periodMatch ? periodMatch[2] : 'DAY',
        refundMethod: policy.refund_method || 'MONEY_BACK',
        returnShippingCostPayer: 'BUYER',
      });
    }
    
    setEditDialogOpen(true);
  };

  const savePolicy = async () => {
    setSaving(true);
    try {
      let policyData: any;
      
      if (editingType === 'fulfillment') {
        policyData = {
          name: formData.name,
          description: formData.description || undefined,
          marketplaceId: marketplaceId,
          handlingTime: formData.handlingTime,
          shippingOptions: [{
            optionType: 'DOMESTIC',
            costType: formData.freeShipping ? 'NOT_SPECIFIED' : 'FLAT_RATE',
            shippingServices: [{
              shippingServiceCode: formData.shippingService,
              shippingCost: formData.freeShipping ? undefined : {
                value: formData.shippingCost,
                currency: 'USD',
              },
              freeShipping: formData.freeShipping,
              sortOrder: 1,
            }],
          }],
        };
      } else if (editingType === 'payment') {
        policyData = {
          name: formData.name,
          description: formData.description || undefined,
          marketplaceId: marketplaceId,
          immediatePay: formData.immediatePay,
        };
      } else {
        policyData = {
          name: formData.name,
          description: formData.description || undefined,
          marketplaceId: marketplaceId,
          returnsAccepted: formData.returnsAccepted,
          returnPeriod: formData.returnsAccepted ? {
            value: formData.returnPeriodValue,
            unit: formData.returnPeriodUnit,
          } : undefined,
          refundMethod: formData.returnsAccepted ? formData.refundMethod : undefined,
          returnShippingCostPayer: formData.returnsAccepted ? formData.returnShippingCostPayer : undefined,
        };
      }

      const { data, error } = await supabase.functions.invoke('ebay-manage-policy', {
        body: {
          store_key: storeKey,
          policy_type: editingType,
          operation: isNewPolicy ? 'create' : 'update',
          policy_id: isNewPolicy ? undefined : editingPolicy?.policy_id,
          policy_data: policyData,
        }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      toast.success(isNewPolicy ? 'Policy created on eBay' : 'Policy updated on eBay');
      setEditDialogOpen(false);
      await loadPolicies();
      onPoliciesChanged?.();
    } catch (error: any) {
      console.error('Save policy error:', error);
      toast.error('Failed to save policy: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDeletePolicy = (type: PolicyType, policyId: string, name: string) => {
    setDeletingPolicy({ type, id: policyId, name });
    setDeleteDialogOpen(true);
  };

  const deletePolicy = async () => {
    if (!deletingPolicy) return;
    
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('ebay-manage-policy', {
        body: {
          store_key: storeKey,
          policy_type: deletingPolicy.type,
          operation: 'delete',
          policy_id: deletingPolicy.id,
        }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      toast.success('Policy deleted from eBay');
      setDeleteDialogOpen(false);
      setDeletingPolicy(null);
      await loadPolicies();
      onPoliciesChanged?.();
    } catch (error: any) {
      toast.error('Failed to delete policy: ' + error.message);
    } finally {
      setDeleting(false);
    }
  };

  const renderPolicyList = (type: PolicyType, policies: any[], icon: React.ReactNode) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <span className="text-sm font-medium">{policies.length} policies</span>
        </div>
        <Button size="sm" variant="outline" onClick={() => openNewPolicyDialog(type)} disabled={!isConnected}>
          <Plus className="h-4 w-4 mr-1" />
          New
        </Button>
      </div>
      
      {policies.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          No policies yet. Create one or sync from eBay.
        </p>
      ) : (
        <div className="space-y-2">
          {policies.map((policy) => (
            <div key={policy.id} className="flex items-center justify-between p-3 border rounded-lg bg-card">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{policy.name}</span>
                  {policy.is_default && <Badge variant="secondary" className="text-xs">Default</Badge>}
                </div>
                {policy.description && (
                  <p className="text-sm text-muted-foreground line-clamp-1">{policy.description}</p>
                )}
                {type === 'fulfillment' && policy.handling_time && (
                  <p className="text-xs text-muted-foreground">
                    Handling: {policy.handling_time.value} {policy.handling_time.unit?.toLowerCase()}
                  </p>
                )}
                {type === 'return' && (
                  <p className="text-xs text-muted-foreground">
                    {policy.returns_accepted ? `Returns: ${policy.return_period}` : 'No returns'}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button 
                  size="icon" 
                  variant="ghost" 
                  onClick={() => openEditPolicyDialog(type, policy)}
                  disabled={!isConnected}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => confirmDeletePolicy(type, policy.policy_id, policy.name)}
                  disabled={!isConnected || policy.is_default}
                  title={policy.is_default ? "Cannot delete default policy" : "Delete policy"}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Business Policies</CardTitle>
              <CardDescription>
                Manage your eBay shipping, payment, and return policies
              </CardDescription>
            </div>
            <Button variant="outline" onClick={syncPolicies} disabled={syncing || !isConnected}>
              {syncing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sync from eBay
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!isConnected ? (
            <p className="text-center text-muted-foreground py-4">
              Connect your eBay account to manage policies
            </p>
          ) : (
            <Tabs defaultValue="fulfillment" className="space-y-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="fulfillment" className="flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  Shipping
                </TabsTrigger>
                <TabsTrigger value="payment" className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Payment
                </TabsTrigger>
                <TabsTrigger value="return" className="flex items-center gap-2">
                  <RotateCcw className="h-4 w-4" />
                  Returns
                </TabsTrigger>
              </TabsList>

              <TabsContent value="fulfillment">
                {renderPolicyList('fulfillment', fulfillmentPolicies, <Truck className="h-4 w-4" />)}
              </TabsContent>

              <TabsContent value="payment">
                {renderPolicyList('payment', paymentPolicies, <CreditCard className="h-4 w-4" />)}
              </TabsContent>

              <TabsContent value="return">
                {renderPolicyList('return', returnPolicies, <RotateCcw className="h-4 w-4" />)}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* Edit/Create Policy Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {isNewPolicy ? 'Create' : 'Edit'} {editingType.charAt(0).toUpperCase() + editingType.slice(1)} Policy
            </DialogTitle>
            <DialogDescription>
              {isNewPolicy 
                ? 'Create a new policy on eBay'
                : 'Update this policy on eBay'
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Policy Name *</Label>
              <Input
                id="name"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Standard Shipping"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description"
              />
            </div>

            {editingType === 'fulfillment' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Handling Time</Label>
                    <Input
                      type="number"
                      min={0}
                      value={formData.handlingTime?.value || 1}
                      onChange={(e) => setFormData({
                        ...formData,
                        handlingTime: { ...formData.handlingTime, value: parseInt(e.target.value) }
                      })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Unit</Label>
                    <Select
                      value={formData.handlingTime?.unit || 'BUSINESS_DAY'}
                      onValueChange={(v) => setFormData({
                        ...formData,
                        handlingTime: { ...formData.handlingTime, unit: v }
                      })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BUSINESS_DAY">Business Days</SelectItem>
                        <SelectItem value="DAY">Calendar Days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Shipping Service</Label>
                  <Select
                    value={formData.shippingService || 'USPSPriority'}
                    onValueChange={(v) => setFormData({ ...formData, shippingService: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COMMON_SHIPPING_SERVICES.map((s) => (
                        <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <Label>Free Shipping</Label>
                  <Switch
                    checked={formData.freeShipping || false}
                    onCheckedChange={(v) => setFormData({ ...formData, freeShipping: v })}
                  />
                </div>

                {!formData.freeShipping && (
                  <div className="space-y-2">
                    <Label>Shipping Cost (USD)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      value={formData.shippingCost || '5.00'}
                      onChange={(e) => setFormData({ ...formData, shippingCost: e.target.value })}
                    />
                  </div>
                )}
              </>
            )}

            {editingType === 'payment' && (
              <div className="flex items-center justify-between">
                <div>
                  <Label>Immediate Payment Required</Label>
                  <p className="text-xs text-muted-foreground">Require payment at checkout</p>
                </div>
                <Switch
                  checked={formData.immediatePay ?? true}
                  onCheckedChange={(v) => setFormData({ ...formData, immediatePay: v })}
                />
              </div>
            )}

            {editingType === 'return' && (
              <>
                <div className="flex items-center justify-between">
                  <Label>Accept Returns</Label>
                  <Switch
                    checked={formData.returnsAccepted ?? true}
                    onCheckedChange={(v) => setFormData({ ...formData, returnsAccepted: v })}
                  />
                </div>

                {formData.returnsAccepted && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Return Period</Label>
                        <Input
                          type="number"
                          min={1}
                          value={formData.returnPeriodValue || 30}
                          onChange={(e) => setFormData({
                            ...formData,
                            returnPeriodValue: parseInt(e.target.value)
                          })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Unit</Label>
                        <Select
                          value={formData.returnPeriodUnit || 'DAY'}
                          onValueChange={(v) => setFormData({ ...formData, returnPeriodUnit: v })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="DAY">Days</SelectItem>
                            <SelectItem value="MONTH">Months</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Refund Method</Label>
                      <Select
                        value={formData.refundMethod || 'MONEY_BACK'}
                        onValueChange={(v) => setFormData({ ...formData, refundMethod: v })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MONEY_BACK">Money Back</SelectItem>
                          <SelectItem value="MERCHANDISE_CREDIT">Store Credit</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Return Shipping Paid By</Label>
                      <Select
                        value={formData.returnShippingCostPayer || 'BUYER'}
                        onValueChange={(v) => setFormData({ ...formData, returnShippingCostPayer: v })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="BUYER">Buyer</SelectItem>
                          <SelectItem value="SELLER">Seller</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={savePolicy} disabled={saving || !formData.name?.trim()}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                isNewPolicy ? 'Create Policy' : 'Update Policy'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={deletePolicy}
        title={`Delete "${deletingPolicy?.name}"?`}
        description="This will permanently delete this policy from eBay. Any listings using this policy may be affected."
        loading={deleting}
      />
    </>
  );
}
