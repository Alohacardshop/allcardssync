import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { 
  ExternalLink, CheckCircle, AlertCircle, Loader2, Settings, Link2, RefreshCw,
  ShoppingCart, Clock, Package, ArrowRightLeft, Trash2, Shield
} from 'lucide-react';
import { EbaySyncQueueMonitor } from '@/components/admin/EbaySyncQueueMonitor';
import { EbayBulkListing } from '@/components/admin/EbayBulkListing';
import { EbayTemplateManager } from '@/components/admin/EbayTemplateManager';
import { EbayPolicyEditor } from '@/components/admin/EbayPolicyEditor';
import { EbaySyncRulesEditor } from '@/components/admin/EbaySyncRulesEditor';
import { EbayCategoryManager } from '@/components/admin/EbayCategoryManager';
import { EbayCategorySelect } from '@/components/admin/EbayCategorySelect';
import { Link, useLocation } from 'react-router-dom';
import { useStore } from '@/contexts/StoreContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { FileText, ClipboardList, Filter, FolderTree } from 'lucide-react';
import { DeleteConfirmationDialog } from '@/components/ConfirmationDialog';

// Token health status helper
interface TokenHealth {
  status: 'valid' | 'expiring' | 'expired' | 'unknown';
  label: string;
  color: string;
  expiresAt?: Date;
  refreshExpiresAt?: Date;
}

const getTokenHealth = (tokenData: any): TokenHealth => {
  if (!tokenData) {
    return { status: 'unknown', label: 'Unknown', color: 'text-muted-foreground' };
  }

  const now = new Date();
  const accessExpiry = tokenData.access_token_expires_at ? new Date(tokenData.access_token_expires_at) : null;
  const refreshExpiry = tokenData.refresh_token_expires_at ? new Date(tokenData.refresh_token_expires_at) : null;

  // Check if refresh token is expired (critical)
  if (refreshExpiry && refreshExpiry < now) {
    return { 
      status: 'expired', 
      label: 'Session Expired - Reconnect Required', 
      color: 'text-destructive',
      expiresAt: accessExpiry || undefined,
      refreshExpiresAt: refreshExpiry
    };
  }

  // Check if refresh token expires within 7 days
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  if (refreshExpiry && (refreshExpiry.getTime() - now.getTime()) < sevenDays) {
    return { 
      status: 'expiring', 
      label: 'Reconnect Soon', 
      color: 'text-yellow-600',
      expiresAt: accessExpiry || undefined,
      refreshExpiresAt: refreshExpiry
    };
  }

  return { 
    status: 'valid', 
    label: 'Connected', 
    color: 'text-green-600',
    expiresAt: accessExpiry || undefined,
    refreshExpiresAt: refreshExpiry
  };
};

interface EbayStoreConfig {
  id: string;
  store_key: string;
  location_key: string | null;
  environment: 'sandbox' | 'production';
  marketplace_id: string;
  ebay_user_id: string | null;
  oauth_connected_at: string | null;
  is_active: boolean;
  default_category_id: string | null;
  default_condition_id: string | null;
  default_fulfillment_policy_id: string | null;
  default_payment_policy_id: string | null;
  default_return_policy_id: string | null;
  title_template: string | null;
  description_template: string | null;
  price_markup_percent: number | null;
}

interface EbayPolicy {
  id: string;
  store_key: string;
  policy_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  synced_at: string;
}

export default function EbayApp() {
  const { assignedStore, assignedStoreName, isAdmin } = useStore();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [syncingPolicies, setSyncingPolicies] = useState(false);
  const [configs, setConfigs] = useState<EbayStoreConfig[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<EbayStoreConfig | null>(null);
  const [newStoreKey, setNewStoreKey] = useState('');
  const [tokenHealth, setTokenHealth] = useState<TokenHealth | null>(null);
  
  // Ref for debounced auto-save
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  
  // Ref to track latest configs for async operations
  const configsRef = useRef<EbayStoreConfig[]>([]);
  
  // Keep ref in sync with state
  useEffect(() => {
    configsRef.current = configs;
  }, [configs]);
  
  // Policy states
  const [fulfillmentPolicies, setFulfillmentPolicies] = useState<EbayPolicy[]>([]);
  const [paymentPolicies, setPaymentPolicies] = useState<EbayPolicy[]>([]);
  const [returnPolicies, setReturnPolicies] = useState<EbayPolicy[]>([]);
  const [policiesLastSynced, setPoliciesLastSynced] = useState<string | null>(null);

  // Derive connection status from configs array (not selectedConfig which can be stale)
  const selectedKey = selectedConfig?.store_key;
  const selectedFromList = configs.find(c => c.store_key === selectedKey);
  const isConnected = Boolean(selectedFromList?.oauth_connected_at);

  // Retry function to poll until connection is verified in DB
  const refreshUntilConnected = useCallback(async (storeKey: string, attempts = 8): Promise<boolean> => {
    for (let i = 0; i < attempts; i++) {
      await loadConfigs(true, storeKey);
      
      const latest = configsRef.current?.find(c => c.store_key === storeKey);
      if (latest?.oauth_connected_at) {
        console.log('Connection verified after', i + 1, 'attempts');
        return true;
      }
      
      await new Promise(r => setTimeout(r, 1000));
    }
    return false;
  }, []);

  // Check for OAuth redirect fallback (query params) - use useLocation for SPA compatibility
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const connected = urlParams.get('connected');
    const storeId = urlParams.get('store');
    
    if (connected === '1' && storeId) {
      console.log('OAuth redirect detected:', { storeId });
      // Clear the query params from URL
      window.history.replaceState({}, '', location.pathname);
      
      // Wait for context to be ready before loading
      if (isAdmin || assignedStore) {
        toast.success('eBay account connected!');
        loadConfigs(true, storeId);
      }
    }
  }, [location.search, location.pathname, assignedStore, isAdmin]);

  // Global message listener for OAuth popup communication
  useEffect(() => {
    const handler = async (event: MessageEvent) => {
      console.log('EBAY postMessage received:', {
        origin: event.origin,
        data: event.data,
        hasOpener: !!window.opener
      });
      
      if (event.data?.type !== 'EBAY_CONNECTED') return;
      
      const storeId = event.data?.storeId;
      console.log('Processing EBAY_CONNECTED for store:', storeId);
      
      if (event.data.success) {
        toast.success('eBay account connected successfully!');
        const ok = await refreshUntilConnected(storeId);
        if (!ok) {
          toast.info('Connected on backend - click Refresh Status if UI does not update');
        }
      } else {
        toast.error(event.data.message || 'eBay connection failed');
      }
      
      setConnecting(false);
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [refreshUntilConnected]);

  useEffect(() => {
    if (assignedStore) {
      loadConfigs();
    }
  }, [assignedStore]);

  useEffect(() => {
    if (selectedConfig?.store_key) {
      loadPolicies(selectedConfig.store_key);
      loadTokenHealth(selectedConfig.store_key);
    } else {
      setTokenHealth(null);
    }
  }, [selectedConfig?.store_key]);

  const loadTokenHealth = async (storeKey: string) => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('key_value')
        .eq('key_name', `EBAY_TOKENS_${storeKey}`)
        .maybeSingle();

      if (error || !data) {
        setTokenHealth(null);
        return;
      }

      const tokenData = JSON.parse(data.key_value);
      setTokenHealth(getTokenHealth(tokenData));
    } catch (e) {
      console.error('Failed to load token health:', e);
      setTokenHealth(null);
    }
  };

  const loadConfigs = async (forceRefresh = false, storeKeyToSelect?: string) => {
    setLoading(true);
    try {
      // Build query - filter by user's location unless admin
      let query = supabase
        .from('ebay_store_config')
        .select('*')
        .order('created_at', { ascending: false });
      
      // Non-admins only see configs for their assigned store
      if (!isAdmin && assignedStore) {
        query = query.eq('location_key', assignedStore);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      const typedData = (data || []).map(d => ({
        ...d,
        environment: d.environment as 'sandbox' | 'production'
      }));
      
      setConfigs(typedData);
      
      // If a specific store key was requested (e.g., after OAuth), select it
      if (storeKeyToSelect) {
        const targetConfig = typedData.find(c => c.store_key === storeKeyToSelect);
        if (targetConfig) {
          console.log('Selecting config after OAuth:', targetConfig.store_key, 'connected_at:', targetConfig.oauth_connected_at);
          setSelectedConfig(targetConfig);
          return;
        }
      }
      
      // Update selectedConfig if it exists in the new data (preserves selection after refresh)
      if (selectedConfig) {
        const updatedConfig = typedData.find(c => c.id === selectedConfig.id);
        if (updatedConfig) {
          console.log('Updating existing selectedConfig:', updatedConfig.store_key, 'connected_at:', updatedConfig.oauth_connected_at);
          setSelectedConfig(updatedConfig);
        } else if (typedData.length > 0) {
          // Config was deleted, select another
          const matchingConfig = typedData.find(c => c.location_key === assignedStore);
          setSelectedConfig(matchingConfig || typedData[0]);
        } else {
          setSelectedConfig(null);
        }
      } else if (typedData.length > 0) {
        // First load - auto-select config matching user's location
        const matchingConfig = typedData.find(c => c.location_key === assignedStore);
        setSelectedConfig(matchingConfig || typedData[0]);
      }
    } catch (error: any) {
      toast.error('Failed to load eBay configurations: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadPolicies = async (storeKey: string) => {
    try {
      const [fulfillment, payment, returns] = await Promise.all([
        supabase
          .from('ebay_fulfillment_policies')
          .select('*')
          .eq('store_key', storeKey)
          .order('name'),
        supabase
          .from('ebay_payment_policies')
          .select('*')
          .eq('store_key', storeKey)
          .order('name'),
        supabase
          .from('ebay_return_policies')
          .select('*')
          .eq('store_key', storeKey)
          .order('name')
      ]);

      if (fulfillment.data) setFulfillmentPolicies(fulfillment.data);
      if (payment.data) setPaymentPolicies(payment.data);
      if (returns.data) setReturnPolicies(returns.data);

      const allPolicies = [
        ...(fulfillment.data || []),
        ...(payment.data || []),
        ...(returns.data || [])
      ];
      
      if (allPolicies.length > 0) {
        const latestSync = allPolicies.reduce((latest, p) => {
          const syncDate = new Date(p.synced_at);
          return syncDate > latest ? syncDate : latest;
        }, new Date(0));
        
        if (latestSync.getTime() > 0) {
          setPoliciesLastSynced(latestSync.toISOString());
        }
      } else {
        setPoliciesLastSynced(null);
      }
    } catch (error: any) {
      console.error('Failed to load policies:', error);
    }
  };

  const syncPolicies = async () => {
    if (!selectedConfig) return;

    setSyncingPolicies(true);
    try {
      const { data, error } = await supabase.functions.invoke('ebay-sync-policies', {
        body: { store_key: selectedConfig.store_key }
      });

      if (error) throw error;

      toast.success(data.message || 'Policies synced successfully');
      await loadPolicies(selectedConfig.store_key);
    } catch (error: any) {
      toast.error('Failed to sync policies: ' + error.message);
    } finally {
      setSyncingPolicies(false);
    }
  };

  const createConfig = async () => {
    if (!newStoreKey.trim()) {
      toast.error('Please enter a store key');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('ebay_store_config')
        .insert({
          store_key: newStoreKey.trim(),
          location_key: assignedStore, // Link to user's location
          environment: 'sandbox',
          marketplace_id: 'EBAY_US',
          is_active: false, // Start inactive for safety
          sync_enabled: false,
          dry_run_mode: true
        })
        .select()
        .single();

      if (error) throw error;

      const typedData = {
        ...data,
        environment: data.environment as 'sandbox' | 'production'
      };

      setConfigs([typedData, ...configs]);
      setSelectedConfig(typedData);
      setNewStoreKey('');
      toast.success('eBay store configuration created (sandbox mode)');
    } catch (error: any) {
      toast.error('Failed to create configuration: ' + error.message);
    }
  };

  const saveConfig = async () => {
    if (!selectedConfig) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('ebay_store_config')
        .update({
          environment: selectedConfig.environment,
          marketplace_id: selectedConfig.marketplace_id,
          is_active: selectedConfig.is_active,
          default_category_id: selectedConfig.default_category_id,
          default_fulfillment_policy_id: selectedConfig.default_fulfillment_policy_id,
          default_payment_policy_id: selectedConfig.default_payment_policy_id,
          default_return_policy_id: selectedConfig.default_return_policy_id,
          title_template: selectedConfig.title_template,
          description_template: selectedConfig.description_template
        })
        .eq('id', selectedConfig.id);

      if (error) throw error;

      toast.success('Configuration saved');
      loadConfigs();
    } catch (error: any) {
      toast.error('Failed to save: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const connectEbay = async () => {
    if (!selectedConfig) return;

    setConnecting(true);
    const currentStoreKey = selectedConfig.store_key;
    
    try {
      console.log('Initiating eBay OAuth for store:', currentStoreKey);
      
      const { data, error } = await supabase.functions.invoke('ebay-auth-init', {
        body: { 
          store_key: currentStoreKey,
          origin: window.location.origin 
        }
      });

      console.log('ebay-auth-init response:', { data, error });

      if (error) {
        console.error('eBay auth init error:', error);
        throw error;
      }
      
      if (!data.auth_url) {
        console.error('No auth_url in response:', data);
        throw new Error('No auth URL returned');
      }

      console.log('Opening eBay auth URL:', data.auth_url);
      
      // Verify it's actually an eBay URL
      if (!data.auth_url.includes('ebay.com')) {
        console.error('WARNING: auth_url does not contain ebay.com!', data.auth_url);
        toast.error('Invalid auth URL returned - not an eBay URL');
        setConnecting(false);
        return;
      }

      // IMPORTANT: Do NOT use noopener/noreferrer - it kills window.opener
      const authWindow = window.open(data.auth_url, 'ebay_auth', 'width=600,height=700');
      console.log('Opened eBay auth window for store:', currentStoreKey);
      
      // Fallback: poll for window close with retry-until-connected logic
      const pollTimer = setInterval(async () => {
        if (authWindow?.closed) {
          clearInterval(pollTimer);
          console.log('Auth window closed, polling for connection...');
          
          const ok = await refreshUntilConnected(currentStoreKey);
          if (!ok) {
            toast.info('Connected on backend - click Refresh Status if UI does not update');
          }
          setConnecting(false);
        }
      }, 1000);

      // Timeout after 5 minutes
      setTimeout(() => {
        clearInterval(pollTimer);
        setConnecting(false);
      }, 300000);

    } catch (error: any) {
      console.error('connectEbay error:', error);
      toast.error('Failed to start eBay connection: ' + error.message);
      setConnecting(false);
    }
  };

  const disconnectEbay = async () => {
    if (!selectedConfig) return;
    
    const confirmed = window.confirm(
      `Are you sure you want to disconnect the eBay account for "${selectedConfig.store_key}"? You will need to reconnect to list items.`
    );
    
    if (!confirmed) return;
    
    setDisconnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('ebay-disconnect', {
        body: { store_key: selectedConfig.store_key }
      });

      if (error) throw error;
      
      toast.success(`Disconnected eBay account for ${selectedConfig.store_key}`);
      await loadConfigs(true, selectedConfig.store_key);
    } catch (error: any) {
      console.error('Disconnect error:', error);
      toast.error('Failed to disconnect: ' + error.message);
    } finally {
      setDisconnecting(false);
    }
  };

  const deleteConfig = async () => {
    if (!selectedConfig) return;
    
    setDeleting(true);
    try {
      // Delete related data first
      await Promise.all([
        supabase.from('ebay_fulfillment_policies').delete().eq('store_key', selectedConfig.store_key),
        supabase.from('ebay_payment_policies').delete().eq('store_key', selectedConfig.store_key),
        supabase.from('ebay_return_policies').delete().eq('store_key', selectedConfig.store_key),
        supabase.from('system_settings').delete().eq('key_name', `EBAY_TOKENS_${selectedConfig.store_key}`),
      ]);

      // Delete the config
      const { error } = await supabase
        .from('ebay_store_config')
        .delete()
        .eq('id', selectedConfig.id);

      if (error) throw error;

      toast.success(`Deleted configuration: ${selectedConfig.store_key}`);
      setDeleteDialogOpen(false);
      setSelectedConfig(null);
      await loadConfigs();
    } catch (error: any) {
      console.error('Delete error:', error);
      toast.error('Failed to delete configuration: ' + error.message);
    } finally {
      setDeleting(false);
    }
  };

  // Auto-saving updateConfig with debounce
  const updateConfig = useCallback((updates: Partial<EbayStoreConfig>) => {
    if (!selectedConfig) return;
    
    const newConfig = { ...selectedConfig, ...updates };
    setSelectedConfig(newConfig);
    
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Debounced auto-save
    saveTimeoutRef.current = setTimeout(async () => {
      setAutoSaving(true);
      try {
        const { error } = await supabase
          .from('ebay_store_config')
          .update({
            environment: newConfig.environment,
            marketplace_id: newConfig.marketplace_id,
            is_active: newConfig.is_active,
            default_category_id: newConfig.default_category_id,
            default_fulfillment_policy_id: newConfig.default_fulfillment_policy_id,
            default_payment_policy_id: newConfig.default_payment_policy_id,
            default_return_policy_id: newConfig.default_return_policy_id,
            title_template: newConfig.title_template,
            description_template: newConfig.description_template,
            price_markup_percent: newConfig.price_markup_percent
          })
          .eq('id', newConfig.id);
        
        if (error) throw error;
        toast.success('Settings saved', { duration: 2000 });
      } catch (error: any) {
        toast.error('Failed to save: ' + error.message);
      } finally {
        setAutoSaving(false);
      }
    }, 500);
  }, [selectedConfig]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <PageHeader
          title="eBay Integration"
          description="Manage eBay connection, listings, and sync queue"
          showEcosystem
          actions={
            <Link to="/ebay/sync">
              <Button variant="outline" className="flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4" />
                Inventory Sync Dashboard
              </Button>
            </Link>
          }
        />

        <Tabs defaultValue="settings" className="space-y-6">
          <TabsList className="grid w-full grid-cols-7 lg:w-auto lg:inline-grid">
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </TabsTrigger>
            <TabsTrigger value="policies" className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Policies
            </TabsTrigger>
            <TabsTrigger value="templates" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="categories" className="flex items-center gap-2">
              <FolderTree className="h-4 w-4" />
              Categories
            </TabsTrigger>
            <TabsTrigger value="rules" className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Sync Rules
            </TabsTrigger>
            <TabsTrigger value="bulk" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Bulk Listing
            </TabsTrigger>
            <TabsTrigger value="queue" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Sync Queue
            </TabsTrigger>
          </TabsList>

          {/* Templates Tab */}
          <TabsContent value="templates">
            {selectedConfig ? (
              <EbayTemplateManager storeKey={selectedConfig.store_key} />
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  Please select or create an eBay store configuration first.
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Categories Tab */}
          <TabsContent value="categories">
            <EbayCategoryManager />
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            {/* Progress Indicator */}
            {configs.length > 0 && selectedConfig && (
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                          <CheckCircle className="h-5 w-5" />
                        </div>
                        <span className="text-sm font-medium">1. Config Created</span>
                      </div>
                      <div className="h-px w-8 bg-border" />
                      <div className="flex items-center gap-2">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium ${
                          isConnected 
                            ? 'bg-primary text-primary-foreground' 
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          {isConnected ? <CheckCircle className="h-5 w-5" /> : '2'}
                        </div>
                        <span className={`text-sm ${isConnected ? 'font-medium' : 'text-muted-foreground'}`}>
                          2. eBay Connected
                        </span>
                      </div>
                      <div className="h-px w-8 bg-border" />
                      <div className="flex items-center gap-2">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium ${
                          fulfillmentPolicies.length > 0 
                            ? 'bg-primary text-primary-foreground' 
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          {fulfillmentPolicies.length > 0 ? <CheckCircle className="h-5 w-5" /> : '3'}
                        </div>
                        <span className={`text-sm ${fulfillmentPolicies.length > 0 ? 'font-medium' : 'text-muted-foreground'}`}>
                          3. Policies Synced
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Welcome/Onboarding when no configs */}
            {configs.length === 0 ? (
              <Card className="border-primary/30">
                <CardHeader className="text-center pb-2">
                  <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <ShoppingCart className="h-8 w-8 text-primary" />
                  </div>
                  <CardTitle className="text-2xl">Welcome to eBay Integration</CardTitle>
                  <CardDescription className="text-base">
                    Connect your eBay account to start listing items directly from your inventory
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Setup Steps */}
                  <div className="grid gap-4 py-4">
                    <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/50">
                      <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">
                        1
                      </div>
                      <div>
                        <p className="font-medium">Create Store Configuration</p>
                        <p className="text-sm text-muted-foreground">
                          Set up a configuration to link your inventory with eBay
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/30">
                      <div className="h-8 w-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-sm font-bold shrink-0">
                        2
                      </div>
                      <div>
                        <p className="font-medium text-muted-foreground">Connect eBay Account</p>
                        <p className="text-sm text-muted-foreground">
                          Authorize access to your eBay seller account
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/30">
                      <div className="h-8 w-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-sm font-bold shrink-0">
                        3
                      </div>
                      <div>
                        <p className="font-medium text-muted-foreground">Sync Business Policies</p>
                        <p className="text-sm text-muted-foreground">
                          Import your shipping, payment, and return policies
                        </p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Create First Config */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="store-key">Store Key</Label>
                      <p className="text-sm text-muted-foreground">
                        A unique identifier for this eBay configuration (e.g., "hawaii", "main", "primary")
                      </p>
                      <div className="flex gap-2">
                        <Input
                          id="store-key"
                          placeholder="Enter store key..."
                          value={newStoreKey}
                          onChange={(e) => setNewStoreKey(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && newStoreKey.trim() && createConfig()}
                        />
                        <Button onClick={createConfig} disabled={!newStoreKey.trim()} size="lg">
                          Get Started
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              /* Store Selection / Creation when configs exist */
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    eBay Store Configuration
                  </CardTitle>
                  <CardDescription>Select or create an eBay store configuration</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="flex-1 space-y-2">
                      <Label>Select Store</Label>
                      <Select
                        value={selectedConfig?.id || ''}
                        onValueChange={(id) => {
                          const config = configs.find(c => c.id === id);
                          setSelectedConfig(config || null);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a store configuration" />
                        </SelectTrigger>
                        <SelectContent>
                          {configs.map((config) => (
                            <SelectItem key={config.id} value={config.id}>
                              {config.store_key} ({config.environment})
                              {config.oauth_connected_at && ' ✓'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {selectedConfig && isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10 mt-6"
                        onClick={() => setDeleteDialogOpen(true)}
                        title="Delete this configuration"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {selectedConfig && (
              <>
                {/* Connection Status */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Link2 className="h-5 w-5" />
                      eBay Account Connection
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        {isConnected ? (
                          <>
                            <CheckCircle className={`h-6 w-6 ${tokenHealth?.status === 'expired' ? 'text-destructive' : tokenHealth?.status === 'expiring' ? 'text-yellow-500' : 'text-green-500'}`} />
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium">Connected to eBay</p>
                                {tokenHealth && (
                                  <Badge variant={tokenHealth.status === 'expired' ? 'destructive' : tokenHealth.status === 'expiring' ? 'secondary' : 'default'} className="text-xs">
                                    <Shield className="h-3 w-3 mr-1" />
                                    {tokenHealth.label}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                Account: {selectedFromList?.ebay_user_id || 'Loading...'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Connected: {selectedFromList?.oauth_connected_at ? new Date(selectedFromList.oauth_connected_at).toLocaleDateString() : ''}
                                {tokenHealth?.refreshExpiresAt && (
                                  <> · Session expires: {tokenHealth.refreshExpiresAt.toLocaleDateString()}</>
                                )}
                              </p>
                            </div>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="h-6 w-6 text-yellow-500" />
                            <div>
                              <p className="font-medium">Not Connected</p>
                              <p className="text-sm text-muted-foreground">
                                Connect your eBay account to enable listing
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="outline"
                          size="sm"
                          onClick={() => loadConfigs(true, selectedConfig?.store_key)}
                          disabled={loading}
                        >
                          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                          Refresh Status
                        </Button>
                        {isConnected && (
                          <Button 
                            variant="destructive"
                            size="sm"
                            onClick={disconnectEbay}
                            disabled={disconnecting}
                          >
                            {disconnecting ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Disconnecting...
                              </>
                            ) : (
                              'Disconnect'
                            )}
                          </Button>
                        )}
                        <Button 
                          onClick={connectEbay} 
                          disabled={connecting}
                          variant={isConnected ? 'outline' : 'default'}
                        >
                          {connecting ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Connecting...
                            </>
                          ) : isConnected ? (
                            'Reconnect'
                          ) : (
                            <>
                              Connect eBay Account
                              <ExternalLink className="h-4 w-4 ml-2" />
                            </>
                          )}
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Environment</Label>
                        <div className="flex items-center h-10 px-3 rounded-md border bg-muted text-sm">
                          Production (Live)
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Marketplace</Label>
                        <Select
                          value={selectedConfig.marketplace_id}
                          onValueChange={(v) => updateConfig({ marketplace_id: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="EBAY_US">United States</SelectItem>
                            <SelectItem value="EBAY_CA">Canada</SelectItem>
                            <SelectItem value="EBAY_GB">United Kingdom</SelectItem>
                            <SelectItem value="EBAY_AU">Australia</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Active</Label>
                        <p className="text-sm text-muted-foreground">Enable eBay listing for this store</p>
                      </div>
                      <Switch
                        checked={selectedConfig.is_active || false}
                        onCheckedChange={(checked) => updateConfig({ is_active: checked })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Price Markup (%)</Label>
                      <p className="text-sm text-muted-foreground">
                        Percentage to add to item price when listing on eBay
                      </p>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.5"
                          value={selectedConfig.price_markup_percent ?? 0}
                          onChange={(e) => updateConfig({ price_markup_percent: parseFloat(e.target.value) || 0 })}
                          className="w-32"
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Default Policies */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Default Policies</CardTitle>
                        <CardDescription>
                          Select default policies for new eBay listings
                        </CardDescription>
                      </div>
                      {isConnected && fulfillmentPolicies.length === 0 && (
                        <Button variant="outline" onClick={syncPolicies} disabled={syncingPolicies}>
                          {syncingPolicies ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4 mr-2" />
                          )}
                          Sync from eBay
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {!isConnected ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Connect your eBay account first
                      </p>
                    ) : fulfillmentPolicies.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No policies yet. Sync from eBay or go to the <strong>Policies</strong> tab to create new ones.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label>Shipping Policy</Label>
                          <Select
                            value={selectedConfig.default_fulfillment_policy_id || ''}
                            onValueChange={(v) => updateConfig({ default_fulfillment_policy_id: v || null })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select policy" />
                            </SelectTrigger>
                            <SelectContent>
                              {fulfillmentPolicies.map((policy) => (
                                <SelectItem key={policy.policy_id} value={policy.policy_id}>
                                  {policy.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Payment Policy</Label>
                          <Select
                            value={selectedConfig.default_payment_policy_id || ''}
                            onValueChange={(v) => updateConfig({ default_payment_policy_id: v || null })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select policy" />
                            </SelectTrigger>
                            <SelectContent>
                              {paymentPolicies.map((policy) => (
                                <SelectItem key={policy.policy_id} value={policy.policy_id}>
                                  {policy.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Return Policy</Label>
                          <Select
                            value={selectedConfig.default_return_policy_id || ''}
                            onValueChange={(v) => updateConfig({ default_return_policy_id: v || null })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select policy" />
                            </SelectTrigger>
                            <SelectContent>
                              {returnPolicies.map((policy) => (
                                <SelectItem key={policy.policy_id} value={policy.policy_id}>
                                  {policy.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Listing Defaults */}
                <Card>
                  <CardHeader>
                    <CardTitle>Listing Defaults</CardTitle>
                    <CardDescription>Default settings for new eBay listings</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Default Category</Label>
                      <EbayCategorySelect
                        value={selectedConfig.default_category_id || ''}
                        onValueChange={(value) => updateConfig({ default_category_id: value || null })}
                        placeholder="Select default eBay category..."
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Title Template</Label>
                      <Input
                        placeholder="{subject} {grade} {grading_company} - {brand_title}"
                        value={selectedConfig.title_template || ''}
                        onChange={(e) => updateConfig({ title_template: e.target.value || null })}
                      />
                      <p className="text-xs text-muted-foreground">
                        Available: {'{subject}'}, {'{grade}'}, {'{grading_company}'}, {'{brand_title}'}, {'{year}'}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Description Template</Label>
                      <textarea
                        className="w-full min-h-[100px] p-3 border rounded-md bg-background"
                        placeholder="Enter your default listing description template..."
                        value={selectedConfig.description_template || ''}
                        onChange={(e) => updateConfig({ description_template: e.target.value || null })}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Auto-save status indicator */}
                <div className="flex justify-end items-center gap-2 text-sm text-muted-foreground">
                  {autoSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 text-primary" />
                      <span>All changes saved</span>
                    </>
                  )}
                </div>
              </>
            )}
          </TabsContent>

          {/* Policies Tab */}
          <TabsContent value="policies">
            {selectedConfig ? (
              <EbayPolicyEditor 
                storeKey={selectedConfig.store_key}
                marketplaceId={selectedConfig.marketplace_id}
                isConnected={isConnected}
                onPoliciesChanged={() => loadPolicies(selectedConfig.store_key)}
              />
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  Please select or create an eBay store configuration first.
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Sync Rules Tab */}
          <TabsContent value="rules">
            <EbaySyncRulesEditor />
          </TabsContent>

          {/* Bulk Listing Tab */}
          <TabsContent value="bulk">
            <EbayBulkListing />
          </TabsContent>

          {/* Sync Queue Tab */}
          <TabsContent value="queue">
            <EbaySyncQueueMonitor />
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete Configuration Dialog */}
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={deleteConfig}
        title={`Delete "${selectedConfig?.store_key}" configuration?`}
        description="This will permanently delete this eBay store configuration, disconnect the eBay account, and remove all synced policies. This action cannot be undone."
        loading={deleting}
      />
    </div>
  );
}
