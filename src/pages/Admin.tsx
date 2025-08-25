import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, CheckCircle, Settings, Store, Webhook, Key, Globe, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Navigation } from '@/components/Navigation';

interface ShopifyConfig {
  storeDomain: string;
  adminAccessToken: string;
  apiKey: string;
  apiSecret: string;
  webhookSecret: string;
}

interface DiagnosticsResult {
  storeDomain: string | null;
  hasAdminToken: boolean;
  hasWebhookSecret: boolean;
  shop: any;
  locations: any[];
}

interface SaveResult {
  key: string;
  action: 'created' | 'updated' | 'skipped';
  success: boolean;
  error?: string;
}

interface SaveResultsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  results: SaveResult[];
  storeName: string;
}


// Save Results Dialog Component
const SaveResultsDialog: React.FC<SaveResultsDialogProps> = ({ isOpen, onClose, results, storeName }) => {
  const successCount = results.filter(r => r.success).length;
  const errorCount = results.filter(r => !r.success).length;
  const errors = results.filter(r => !r.success);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {errorCount === 0 ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-500" />
            )}
            Save Results - {storeName}
          </DialogTitle>
          <DialogDescription>
            {errorCount === 0 
              ? `Successfully saved ${successCount} configuration keys.`
              : `${successCount} successful, ${errorCount} failed.`
            }
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-3">
          {results.map((result, index) => (
            <div key={index} className="flex items-center gap-2 text-sm">
              {result.success ? (
                <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
              ) : (
                <X className="h-4 w-4 text-red-500 flex-shrink-0" />
              )}
              <span className="flex-1">
                {result.key.split('_').slice(-1)[0]}: {result.action}
                {result.error && <span className="text-red-500 ml-1">({result.error})</span>}
              </span>
            </div>
          ))}
          
          {errors.length > 0 && (
            <div className="mt-3 p-2 bg-red-50 rounded text-xs text-red-700">
              Check console logs for detailed error information.
            </div>
          )}
        </div>
        
        <Button onClick={onClose} className="w-full mt-4">
          Close
        </Button>
      </DialogContent>
    </Dialog>
  );
};

const Admin = () => {
  const [selectedStore, setSelectedStore] = useState<string>('');
  const [hawaiiConfig, setHawaiiConfig] = useState<ShopifyConfig>({
    storeDomain: '',
    adminAccessToken: '',
    apiKey: '',
    apiSecret: '',
    webhookSecret: ''
  });
  const [lasVegasConfig, setLasVegasConfig] = useState<ShopifyConfig>({
    storeDomain: '',
    adminAccessToken: '',
    apiKey: '',
    apiSecret: '',
    webhookSecret: ''
  });
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [saveResults, setSaveResults] = useState<SaveResult[]>([]);
  const [showSaveResults, setShowSaveResults] = useState(false);
  const [saveResultsStore, setSaveResultsStore] = useState('');
  const [justTcgApiKey, setJustTcgApiKey] = useState('');
  const [isSavingJustTcg, setIsSavingJustTcg] = useState(false);
  const [firecrawlApiKey, setFirecrawlApiKey] = useState('');
  const [isSavingFirecrawl, setIsSavingFirecrawl] = useState(false);

  const loadConfiguration = async () => {
    setIsLoading(true);
    setError('');

    try {
      // Load Hawaii configuration
      const { data: hawaiiData, error: hawaiiError } = await supabase
        .from('system_settings')
        .select('key_name, key_value')
        .in('key_name', [
          'SHOPIFY_HAWAII_STORE_DOMAIN',
          'SHOPIFY_HAWAII_ACCESS_TOKEN',
          'SHOPIFY_HAWAII_API_KEY',
          'SHOPIFY_HAWAII_API_SECRET',
          'SHOPIFY_HAWAII_WEBHOOK_SECRET'
        ]);

      if (hawaiiError) {
        console.error('Error fetching Hawaii config:', hawaiiError);
        toast.error('Failed to load Hawaii configuration');
      } else if (hawaiiData) {
        setHawaiiConfig({
          storeDomain: hawaiiData.find(item => item.key_name === 'SHOPIFY_HAWAII_STORE_DOMAIN')?.key_value || '',
          adminAccessToken: hawaiiData.find(item => item.key_name === 'SHOPIFY_HAWAII_ACCESS_TOKEN')?.key_value || '',
          apiKey: hawaiiData.find(item => item.key_name === 'SHOPIFY_HAWAII_API_KEY')?.key_value || '',
          apiSecret: hawaiiData.find(item => item.key_name === 'SHOPIFY_HAWAII_API_SECRET')?.key_value || '',
          webhookSecret: hawaiiData.find(item => item.key_name === 'SHOPIFY_HAWAII_WEBHOOK_SECRET')?.key_value || ''
        });
      }

      // Load Las Vegas configuration
      const { data: lasVegasData, error: lasVegasError } = await supabase
        .from('system_settings')
        .select('key_name, key_value')
        .in('key_name', [
          'SHOPIFY_LAS_VEGAS_STORE_DOMAIN',
          'SHOPIFY_LAS_VEGAS_ACCESS_TOKEN',
          'SHOPIFY_LAS_VEGAS_API_KEY',
          'SHOPIFY_LAS_VEGAS_API_SECRET',
          'SHOPIFY_LAS_VEGAS_WEBHOOK_SECRET'
        ]);

      if (lasVegasError) {
        console.error('Error fetching Las Vegas config:', lasVegasError);
        toast.error('Failed to load Las Vegas configuration');
      } else if (lasVegasData) {
        setLasVegasConfig({
          storeDomain: lasVegasData.find(item => item.key_name === 'SHOPIFY_LAS_VEGAS_STORE_DOMAIN')?.key_value || '',
          adminAccessToken: lasVegasData.find(item => item.key_name === 'SHOPIFY_LAS_VEGAS_ACCESS_TOKEN')?.key_value || '',
          apiKey: lasVegasData.find(item => item.key_name === 'SHOPIFY_LAS_VEGAS_API_KEY')?.key_value || '',
          apiSecret: lasVegasData.find(item => item.key_name === 'SHOPIFY_LAS_VEGAS_API_SECRET')?.key_value || '',
          webhookSecret: lasVegasData.find(item => item.key_name === 'SHOPIFY_LAS_VEGAS_WEBHOOK_SECRET')?.key_value || ''
        });
      }

      // Load JustTCG API Key
      const { data: justTcgData, error: justTcgError } = await supabase
        .from('system_settings')
        .select('key_value')
        .eq('key_name', 'JUSTTCG_API_KEY')
        .limit(1)
        .maybeSingle();

      if (justTcgError) {
        console.error('Error fetching JustTCG config:', justTcgError);
      } else {
        setJustTcgApiKey(justTcgData?.key_value || '');
      }

      // Load Firecrawl API Key
      const { data: firecrawlData, error: firecrawlError } = await supabase
        .from('system_settings')
        .select('key_value')
        .eq('key_name', 'FIRECRAWL_API_KEY')
        .limit(1)
        .maybeSingle();

      if (firecrawlError) {
        console.error('Error fetching Firecrawl config:', firecrawlError);
      } else {
        setFirecrawlApiKey(firecrawlData?.key_value || '');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const saveConfiguration = async (store: 'hawaii' | 'lasvegas') => {
    if (!isAdmin) {
      toast.error('Access denied', { description: 'Only administrators can save configuration' });
      return;
    }

    setIsSaving(true);
    setError('');
    const results: SaveResult[] = [];
    
    try {
      const config = store === 'hawaii' ? hawaiiConfig : lasVegasConfig;
      const storeKey = store === 'hawaii' ? 'HAWAII' : 'LAS_VEGAS';
      const storeName = store === 'hawaii' ? 'Hawaii' : 'Las Vegas';
      
      console.log(`Saving configuration for ${store}:`, config);
      
      const updates = [
        { key: `SHOPIFY_${storeKey}_STORE_DOMAIN`, value: config.storeDomain },
        { key: `SHOPIFY_${storeKey}_ACCESS_TOKEN`, value: config.adminAccessToken },
        { key: `SHOPIFY_${storeKey}_API_KEY`, value: config.apiKey },
        { key: `SHOPIFY_${storeKey}_API_SECRET`, value: config.apiSecret },
        { key: `SHOPIFY_${storeKey}_WEBHOOK_SECRET`, value: config.webhookSecret }
      ];
      
      for (const update of updates) {
        try {
          console.log(`Processing ${update.key} with value:`, update.value ? '[REDACTED]' : 'empty');
          
          // Check if record exists
          const { data: existing, error: selectError } = await supabase
            .from('system_settings')
            .select('id')
            .eq('key_name', update.key)
            .limit(1)
            .maybeSingle();
          
          if (selectError) {
            console.error(`Error checking ${update.key}:`, selectError);
            results.push({
              key: update.key,
              action: 'skipped',
              success: false,
              error: selectError.message
            });
            continue;
          }

          if (existing) {
            // Update existing record
            const { error: updateError } = await supabase
              .from('system_settings')
              .update({ 
                key_value: update.value,
                updated_at: new Date().toISOString()
              })
              .eq('key_name', update.key);
            
            if (updateError) {
              console.error(`Error updating ${update.key}:`, updateError);
              results.push({
                key: update.key,
                action: 'updated',
                success: false,
                error: updateError.message
              });
            } else {
              results.push({
                key: update.key,
                action: 'updated',
                success: true
              });
            }
          } else {
            // Create new record
            const { error: insertError } = await supabase
              .from('system_settings')
              .insert({
                key_name: update.key,
                key_value: update.value,
                description: `Shopify ${update.key.split('_').slice(-1)[0]} for ${storeName} Store`,
                is_encrypted: true,
                category: 'shopify'
              });
            
            if (insertError) {
              console.error(`Error inserting ${update.key}:`, insertError);
              results.push({
                key: update.key,
                action: 'created',
                success: false,
                error: insertError.message
              });
            } else {
              results.push({
                key: update.key,
                action: 'created',
                success: true
              });
            }
          }
        } catch (fieldError: any) {
          console.error(`Error processing ${update.key}:`, fieldError);
          results.push({
            key: update.key,
            action: 'skipped',
            success: false,
            error: fieldError.message || 'Timeout or unknown error'
          });
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      const errorCount = results.filter(r => !r.success).length;
      
      console.log('Save operation completed:', { successCount, errorCount, results });
      
      // Show results dialog
      setSaveResults(results);
      setSaveResultsStore(storeName);
      setShowSaveResults(true);
      
      if (errorCount === 0) {
        toast.success(`${storeName} settings saved successfully!`, {
          description: `All ${successCount} configuration keys saved`
        });
        // Reload configuration after successful save
        loadConfiguration();
      } else {
        toast.warning(`${storeName} settings partially saved`, {
          description: `${successCount} successful, ${errorCount} failed`
        });
      }
      
    } catch (error: any) {
      console.error(`Error saving ${store} configuration:`, error);
      const errorMessage = error?.message || 'Unknown error occurred';
      setError(`Failed to save ${store === 'hawaii' ? 'Hawaii' : 'Las Vegas'} settings: ${errorMessage}`);
      toast.error(`Failed to save ${store === 'hawaii' ? 'Hawaii' : 'Las Vegas'} settings`, {
        description: errorMessage
      });
    } finally {
      setIsSaving(false);
    }
  };

  const runDiagnostics = async () => {
    if (!selectedStore) {
      toast.error('Please select a store first');
      return;
    }
    
    setIsLoading(true);
    setError('');
    
    try {
      console.log('Running diagnostics for store:', selectedStore);
      
      const { data, error } = await supabase.functions.invoke('shopify-config-check', {
        body: { storeKey: selectedStore }
      });
      
      if (error) {
        console.error('Diagnostics error:', error);
        throw error;
      }
      
      console.log('Diagnostics result:', data);
      setDiagnostics(data);
      
      if (data.shop) {
        toast.success('Shopify connection successful!', {
          description: `Connected to ${data.shop.name}`
        });
      } else {
        toast.warning('Shopify connection issues detected', {
          description: 'Check the diagnostics results below'
        });
      }
    } catch (error: any) {
      console.error('Error running diagnostics:', error);
      setError(`Diagnostics failed: ${error.message}`);
      toast.error('Diagnostics failed', {
        description: error.message
      });
    } finally {
      setIsLoading(false);
    }
  };

  const saveJustTcgKey = async () => {
    if (!isAdmin) {
      toast.error('Access denied', { description: 'Only administrators can save configuration' });
      return;
    }

    setIsSavingJustTcg(true);
    setError('');

    try {
      // Check if record exists
      const { data: existing, error: selectError } = await supabase
        .from('system_settings')
        .select('id')
        .eq('key_name', 'JUSTTCG_API_KEY')
        .limit(1)
        .maybeSingle();

      if (selectError) {
        throw selectError;
      }

      if (existing) {
        // Update existing record
        const { error: updateError } = await supabase
          .from('system_settings')
          .update({ 
            key_value: justTcgApiKey,
            updated_at: new Date().toISOString()
          })
          .eq('key_name', 'JUSTTCG_API_KEY');
        
        if (updateError) throw updateError;
      } else {
        // Create new record
        const { error: insertError } = await supabase
          .from('system_settings')
          .insert({
            key_name: 'JUSTTCG_API_KEY',
            key_value: justTcgApiKey,
            description: 'JustTCG API Key for card lookups',
            is_encrypted: true,
            category: 'integrations'
          });
        
        if (insertError) throw insertError;
      }

      toast.success('JustTCG API key saved successfully!');
      loadConfiguration(); // Reload to reflect changes
    } catch (error: any) {
      console.error('Error saving JustTCG API key:', error);
      toast.error('Failed to save JustTCG API key', {
        description: error.message
      });
    } finally {
      setIsSavingJustTcg(false);
    }
  };

  const clearJustTcgKey = async () => {
    if (!isAdmin) {
      toast.error('Access denied', { description: 'Only administrators can save configuration' });
      return;
    }

    setIsSavingJustTcg(true);
    setError('');

    try {
      const { error: deleteError } = await supabase
        .from('system_settings')
        .delete()
        .eq('key_name', 'JUSTTCG_API_KEY');

      if (deleteError) throw deleteError;

      setJustTcgApiKey('');
      toast.success('JustTCG API key cleared successfully!');
    } catch (error: any) {
      console.error('Error clearing JustTCG API key:', error);
      toast.error('Failed to clear JustTCG API key', {
        description: error.message
      });
    } finally {
      setIsSavingJustTcg(false);
    }
  };

  const saveFirecrawlKey = async () => {
    if (!isAdmin) {
      toast.error('Access denied', { description: 'Only administrators can save configuration' });
      return;
    }

    setIsSavingFirecrawl(true);
    setError('');

    try {
      // Check if record exists
      const { data: existing, error: selectError } = await supabase
        .from('system_settings')
        .select('id')
        .eq('key_name', 'FIRECRAWL_API_KEY')
        .limit(1)
        .maybeSingle();

      if (selectError) {
        throw selectError;
      }

      if (existing) {
        // Update existing record
        const { error: updateError } = await supabase
          .from('system_settings')
          .update({ 
            key_value: firecrawlApiKey,
            updated_at: new Date().toISOString()
          })
          .eq('key_name', 'FIRECRAWL_API_KEY');
        
        if (updateError) throw updateError;
      } else {
        // Create new record
        const { error: insertError } = await supabase
          .from('system_settings')
          .insert({
            key_name: 'FIRECRAWL_API_KEY',
            key_value: firecrawlApiKey,
            description: 'Firecrawl API Key for web scraping',
            is_encrypted: true,
            category: 'integrations'
          });
        
        if (insertError) throw insertError;
      }

      toast.success('Firecrawl API key saved successfully!');
      loadConfiguration(); // Reload to reflect changes
    } catch (error: any) {
      console.error('Error saving Firecrawl API key:', error);
      toast.error('Failed to save Firecrawl API key', {
        description: error.message
      });
    } finally {
      setIsSavingFirecrawl(false);
    }
  };

  const clearFirecrawlKey = async () => {
    if (!isAdmin) {
      toast.error('Access denied', { description: 'Only administrators can save configuration' });
      return;
    }

    setIsSavingFirecrawl(true);
    setError('');

    try {
      const { error: deleteError } = await supabase
        .from('system_settings')
        .delete()
        .eq('key_name', 'FIRECRAWL_API_KEY');

      if (deleteError) throw deleteError;

      setFirecrawlApiKey('');
      toast.success('Firecrawl API key cleared successfully!');
    } catch (error: any) {
      console.error('Error clearing Firecrawl API key:', error);
      toast.error('Failed to clear Firecrawl API key', {
        description: error.message
      });
    } finally {
      setIsSavingFirecrawl(false);
    }
  };

  // Check if user is admin on mount
  useEffect(() => {
    const checkAdminRole = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: adminCheck } = await supabase.rpc("has_role", { 
            _user_id: user.id, 
            _role: "admin" as any 
          });
          setIsAdmin((adminCheck as boolean) === true);
        } else {
          setIsAdmin(false);
        }
      } catch (error) {
        console.error('Error checking admin role:', error);
        setIsAdmin(false);
      }
    };

    checkAdminRole();
    loadConfiguration();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="h-6 w-6" />
            <h1 className="text-2xl font-bold text-foreground">Admin Settings</h1>
          </div>
          <Navigation />
        </div>
      </header>

      <div className="container mx-auto p-6 space-y-6">

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Save Results Dialog */}
      <SaveResultsDialog
        isOpen={showSaveResults}
        onClose={() => setShowSaveResults(false)}
        results={saveResults}
        storeName={saveResultsStore}
      />

      {/* JustTCG Integration Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            JustTCG Integration
          </CardTitle>
          <CardDescription>
            Store your JustTCG API key securely for card lookups
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isAdmin === false && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Only administrators can save configuration settings.
              </AlertDescription>
            </Alert>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="justtcg-api-key" className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              API Key
            </Label>
            <Input
              id="justtcg-api-key"
              type="password"
              value={justTcgApiKey}
              onChange={(e) => setJustTcgApiKey(e.target.value)}
              placeholder="Enter your JustTCG API key"
              disabled={isLoading}
            />
          </div>
          
          <div className="flex gap-2">
            <Button 
              onClick={saveJustTcgKey}
              disabled={!isAdmin || isSavingJustTcg}
              className="flex-1"
            >
              {isSavingJustTcg ? 'Saving...' : 'Save Key'}
            </Button>
            <Button 
              variant="outline"
              onClick={clearJustTcgKey}
              disabled={!isAdmin || isSavingJustTcg}
              className="flex-1"
            >
              {isSavingJustTcg ? 'Clearing...' : 'Clear Key'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Firecrawl Integration Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Firecrawl Integration
          </CardTitle>
          <CardDescription>
            Store your Firecrawl API key securely for web scraping functionality
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isAdmin === false && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Only administrators can save configuration settings.
              </AlertDescription>
            </Alert>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="firecrawl-api-key" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              API Key
            </Label>
            <Input
              id="firecrawl-api-key"
              type="password"
              value={firecrawlApiKey}
              onChange={(e) => setFirecrawlApiKey(e.target.value)}
              placeholder="Enter your Firecrawl API key"
              disabled={isLoading}
            />
          </div>
          
          <div className="flex gap-2">
            <Button 
              onClick={saveFirecrawlKey}
              disabled={!isAdmin || isSavingFirecrawl}
              className="flex-1"
            >
              {isSavingFirecrawl ? 'Saving...' : 'Save Key'}
            </Button>
            <Button 
              variant="outline"
              onClick={clearFirecrawlKey}
              disabled={!isAdmin || isSavingFirecrawl}
              className="flex-1"
            >
              {isSavingFirecrawl ? 'Clearing...' : 'Clear Key'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Shopify Diagnostics Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5" />
            Shopify Diagnostics
          </CardTitle>
          <CardDescription>
            Test your Shopify API connection and view configuration status
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Label htmlFor="diagnostic-store">Store</Label>
              <Select value={selectedStore} onValueChange={setSelectedStore}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a store to diagnose" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hawaii">Hawaii</SelectItem>
                  <SelectItem value="las_vegas">Las Vegas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={runDiagnostics} disabled={isLoading || !selectedStore}>
              {isLoading ? 'Checking...' : 'Recheck Configuration'}
            </Button>
          </div>

          {diagnostics && (
            <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
              <h4 className="font-semibold">Configuration Status</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center gap-2">
                  {diagnostics.storeDomain ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  )}
                  <span className="text-sm">
                    Store Domain: {diagnostics.storeDomain || 'Not configured'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {diagnostics.hasAdminToken ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  )}
                  <span className="text-sm">
                    Admin Token: {diagnostics.hasAdminToken ? 'Configured' : 'Missing'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {diagnostics.hasWebhookSecret ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  )}
                  <span className="text-sm">
                    Webhook Secret: {diagnostics.hasWebhookSecret ? 'Configured' : 'Missing'}
                  </span>
                </div>
              </div>
              
              {diagnostics.shop && (
                <div className="space-y-2">
                  <h5 className="font-medium">Shop Information</h5>
                  <div className="text-sm text-muted-foreground">
                    <p>Name: {diagnostics.shop.name}</p>
                    <p>Domain: {diagnostics.shop.domain}</p>
                    <p>Country: {diagnostics.shop.country_name}</p>
                  </div>
                </div>
              )}
              
              {diagnostics.locations && diagnostics.locations.length > 0 && (
                <div className="space-y-2">
                  <h5 className="font-medium">Locations ({diagnostics.locations.length})</h5>
                  <div className="text-sm text-muted-foreground">
                    {diagnostics.locations.map((location: any, index: number) => (
                      <p key={index}>{location.name}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Hawaii Store Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            Hawaii Store Configuration
          </CardTitle>
          <CardDescription>
            Configure Shopify API settings for the Hawaii store
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="hawaii-domain" className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Store Domain
              </Label>
              <Input
                id="hawaii-domain"
                placeholder="your-store.myshopify.com"
                value={hawaiiConfig.storeDomain}
                onChange={(e) => setHawaiiConfig(prev => ({ ...prev, storeDomain: e.target.value }))}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="hawaii-token" className="flex items-center gap-2">
                <Key className="h-4 w-4" />
                Admin Access Token
              </Label>
              <Input
                id="hawaii-token"
                type="password"
                placeholder="shpat_..."
                value={hawaiiConfig.adminAccessToken}
                onChange={(e) => setHawaiiConfig(prev => ({ ...prev, adminAccessToken: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="hawaii-api-key">API Key</Label>
                <Input
                  id="hawaii-api-key"
                  placeholder="API Key"
                  value={hawaiiConfig.apiKey}
                  onChange={(e) => setHawaiiConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hawaii-api-secret">API Secret</Label>
                <Input
                  id="hawaii-api-secret"
                  type="password"
                  placeholder="API Secret"
                  value={hawaiiConfig.apiSecret}
                  onChange={(e) => setHawaiiConfig(prev => ({ ...prev, apiSecret: e.target.value }))}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="hawaii-webhook">Webhook Secret</Label>
              <Input
                id="hawaii-webhook"
                type="password"
                placeholder="Webhook Secret"
                value={hawaiiConfig.webhookSecret}
                onChange={(e) => setHawaiiConfig(prev => ({ ...prev, webhookSecret: e.target.value }))}
              />
            </div>
          </div>
          
          {isAdmin === false && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Only administrators can save configuration settings.
              </AlertDescription>
            </Alert>
          )}
          
          <Button 
            onClick={() => saveConfiguration('hawaii')} 
            disabled={isSaving || isAdmin === false}
            className="w-full"
          >
            {isSaving ? 'Saving Hawaii Configuration...' : 'Save Hawaii Configuration'}
          </Button>
        </CardContent>
      </Card>

      {/* Las Vegas Store Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            Las Vegas Store Configuration
          </CardTitle>
          <CardDescription>
            Configure Shopify API settings for the Las Vegas store
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="lasvegas-domain" className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Store Domain
              </Label>
              <Input
                id="lasvegas-domain"
                placeholder="your-store.myshopify.com"
                value={lasVegasConfig.storeDomain}
                onChange={(e) => setLasVegasConfig(prev => ({ ...prev, storeDomain: e.target.value }))}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="lasvegas-token" className="flex items-center gap-2">
                <Key className="h-4 w-4" />
                Admin Access Token
              </Label>
              <Input
                id="lasvegas-token"
                type="password"
                placeholder="shpat_..."
                value={lasVegasConfig.adminAccessToken}
                onChange={(e) => setLasVegasConfig(prev => ({ ...prev, adminAccessToken: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="lasvegas-api-key">API Key</Label>
                <Input
                  id="lasvegas-api-key"
                  placeholder="API Key"
                  value={lasVegasConfig.apiKey}
                  onChange={(e) => setLasVegasConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lasvegas-api-secret">API Secret</Label>
                <Input
                  id="lasvegas-api-secret"
                  type="password"
                  placeholder="API Secret"
                  value={lasVegasConfig.apiSecret}
                  onChange={(e) => setLasVegasConfig(prev => ({ ...prev, apiSecret: e.target.value }))}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="lasvegas-webhook">Webhook Secret</Label>
              <Input
                id="lasvegas-webhook"
                type="password"
                placeholder="Webhook Secret"
                value={lasVegasConfig.webhookSecret}
                onChange={(e) => setLasVegasConfig(prev => ({ ...prev, webhookSecret: e.target.value }))}
              />
            </div>
          </div>
          
          {isAdmin === false && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Only administrators can save configuration settings.
              </AlertDescription>
            </Alert>
          )}
          
          <Button 
            onClick={() => saveConfiguration('lasvegas')} 
            disabled={isSaving || isAdmin === false}
            className="w-full"
          >
            {isSaving ? 'Saving Las Vegas Configuration...' : 'Save Las Vegas Configuration'}
          </Button>
        </CardContent>
      </Card>
      </div>
    </div>
  );
};

export default Admin;