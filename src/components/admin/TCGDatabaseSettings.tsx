import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, CheckCircle, Database, Globe } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

const TCGDatabaseSettings = () => {
  const [externalApiUrl, setExternalApiUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  const loadConfiguration = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('key_value')
        .eq('key_name', 'EXTERNAL_TCG_API_URL')
        .limit(1)
        .maybeSingle();

      if (error) {
        logger.error('Error fetching TCG API URL', error instanceof Error ? error : new Error(String(error)), {}, 'tcg-database-settings');
      } else {
        setExternalApiUrl(data?.key_value || '');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const saveConfiguration = async () => {
    if (!isAdmin) {
      toast.error('Access denied', { description: 'Only administrators can save configuration' });
      return;
    }

    setIsSaving(true);
    try {
      // Check if record exists
      const { data: existing, error: selectError } = await supabase
        .from('system_settings')
        .select('id')
        .eq('key_name', 'EXTERNAL_TCG_API_URL')
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
            key_value: externalApiUrl,
            updated_at: new Date().toISOString()
          })
          .eq('key_name', 'EXTERNAL_TCG_API_URL');
        
        if (updateError) throw updateError;
      } else {
        // Create new record
        const { error: insertError } = await supabase
          .from('system_settings')
          .insert({
            key_name: 'EXTERNAL_TCG_API_URL',
            key_value: externalApiUrl,
            description: 'External TCG Database Service API URL',
            is_encrypted: false,
            category: 'integrations'
          });
        
        if (insertError) throw insertError;
      }

      toast.success('TCG Database settings saved successfully!');
      loadConfiguration();
    } catch (error: any) {
      logger.error('Error saving TCG Database settings', error instanceof Error ? error : new Error(String(error)), {}, 'tcg-database-settings');
      toast.error('Failed to save TCG Database settings', {
        description: error.message
      });
    } finally {
      setIsSaving(false);
    }
  };

  const testConnection = async () => {
    if (!externalApiUrl) {
      toast.error('Please enter an API URL first');
      return;
    }

    setIsLoading(true);
    try {
      // Basic connection test - this will be implemented when the external API is ready
      toast.info('Connection test feature will be implemented when external API is ready');
    } catch (error: any) {
      logger.error('Connection test failed', error instanceof Error ? error : new Error(String(error)), {}, 'tcg-database-settings');
      toast.error('Connection test failed', {
        description: error.message
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Check if user is admin
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
        logger.error('Error checking admin role', error instanceof Error ? error : new Error(String(error)), {}, 'tcg-database-settings');
        setIsAdmin(false);
      }
    };

    checkAdminRole();
    loadConfiguration();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          TCG Database Settings
        </CardTitle>
        <CardDescription>
          Configure connection to external TCG database service for card catalog data
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isAdmin === false && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Only administrators can modify TCG database settings.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="external-api-url" className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            External API URL
          </Label>
          <Input
            id="external-api-url"
            type="url"
            value={externalApiUrl}
            onChange={(e) => setExternalApiUrl(e.target.value)}
            placeholder="https://api.example.com/tcg"
            disabled={isLoading}
          />
          <p className="text-sm text-muted-foreground">
            URL of the external TCG database service API
          </p>
        </div>

        <div className="flex gap-2">
          <Button 
            onClick={saveConfiguration}
            disabled={!isAdmin || isSaving}
            className="flex-1"
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </Button>
          <Button 
            variant="outline"
            onClick={testConnection}
            disabled={!externalApiUrl || isLoading}
            className="flex-1"
          >
            {isLoading ? 'Testing...' : 'Test Connection'}
          </Button>
        </div>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            This application will connect to an external TCG database service for catalog data.
            The sync functionality has been removed in preparation for this integration.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};

export default TCGDatabaseSettings;