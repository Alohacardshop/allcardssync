import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  Database, 
  ShoppingCart, 
  Printer,
  Wifi,
  AlertTriangle,
  Play,
  RefreshCw
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { checkBridgeStatus } from '@/lib/printer/zebraService';

interface CheckItem {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'success' | 'error';
  error?: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface PreflightChecklistProps {
  open: boolean;
  onClose: () => void;
  onComplete: (allPassed: boolean) => void;
}

export function PreflightChecklist({ open, onClose, onComplete }: PreflightChecklistProps) {
  const [checks, setChecks] = useState<CheckItem[]>([
    {
      id: 'env-vars',
      name: 'Environment Variables',
      description: 'Verify all required environment variables are set',
      status: 'pending',
      icon: Database
    },
    {
      id: 'database',
      name: 'Database Connection',
      description: 'Test Supabase database connectivity',
      status: 'pending',
      icon: Database
    },
    {
      id: 'shopify',
      name: 'Shopify Integration',
      description: 'Verify Shopify API connectivity',
      status: 'pending',
      icon: ShoppingCart
    },
    {
      id: 'print-bridge',
      name: 'Print Bridge',
      description: 'Check local print bridge service (port 17777)',
      status: 'pending',
      icon: Printer
    },
    {
      id: 'network',
      name: 'Network Connectivity',
      description: 'Test external API endpoints',
      status: 'pending',
      icon: Wifi
    },
    {
      id: 'recent-errors',
      name: 'System Health',
      description: 'Check for critical errors in last hour',
      status: 'pending',
      icon: AlertTriangle
    }
  ]);
  
  const [isRunning, setIsRunning] = useState(false);
  const { toast } = useToast();

  const updateCheck = (id: string, updates: Partial<CheckItem>) => {
    setChecks(prev => prev.map(check => 
      check.id === id ? { ...check, ...updates } : check
    ));
  };

  const checkEnvironmentVariables = async () => {
    updateCheck('env-vars', { status: 'running' });
    
    try {
      const requiredVars = [
        'VITE_SUPABASE_URL',
        'VITE_SUPABASE_ANON_KEY'
      ];
      
      const missing = requiredVars.filter(varName => !import.meta.env[varName]);
      
      if (missing.length > 0) {
        updateCheck('env-vars', { 
          status: 'error', 
          error: `Missing: ${missing.join(', ')}` 
        });
      } else {
        updateCheck('env-vars', { status: 'success' });
      }
    } catch (error) {
      updateCheck('env-vars', { 
        status: 'error', 
        error: 'Failed to check environment variables' 
      });
    }
  };

  const checkDatabase = async () => {
    updateCheck('database', { status: 'running' });
    
    try {
      const { data, error } = await supabase
        .from('intake_items')
        .select('id')
        .limit(1);
      
      if (error) {
        updateCheck('database', { 
          status: 'error', 
          error: error.message 
        });
      } else {
        updateCheck('database', { status: 'success' });
      }
    } catch (error) {
      updateCheck('database', { 
        status: 'error', 
        error: 'Database connection failed' 
      });
    }
  };

  const checkShopify = async () => {
    updateCheck('shopify', { status: 'running' });
    
    try {
      const { data, error } = await supabase.functions.invoke('shopify-locations', {
        body: { storeKey: 'hawaii' }
      });
      
      if (error || !data?.ok) {
        updateCheck('shopify', { 
          status: 'error', 
          error: 'Shopify API connection failed' 
        });
      } else {
        updateCheck('shopify', { status: 'success' });
      }
    } catch (error) {
      updateCheck('shopify', { 
        status: 'error', 
        error: 'Shopify test failed' 
      });
    }
  };

  const checkPrintBridge = async () => {
    updateCheck('print-bridge', { status: 'running' });
    
    try {
      const result = await checkBridgeStatus();
      
      if (result.connected) {
        updateCheck('print-bridge', { status: 'success' });
      } else {
        updateCheck('print-bridge', { 
          status: 'error', 
          error: result.error || 'Print bridge not running on port 17777' 
        });
      }
    } catch (error) {
      updateCheck('print-bridge', { 
        status: 'error', 
        error: 'Print bridge not accessible' 
      });
    }
  };

  const checkNetwork = async () => {
    updateCheck('network', { status: 'running' });
    
    try {
      const endpoints = [
        'https://api.pokemontcg.io/v2/cards?page=1&pageSize=1',
        'https://httpbin.org/status/200'
      ];
      
      const results = await Promise.allSettled(
        endpoints.map(url => fetch(url, { method: 'HEAD' }))
      );
      
      const successful = results.filter(r => r.status === 'fulfilled').length;
      
      if (successful === endpoints.length) {
        updateCheck('network', { status: 'success' });
      } else {
        updateCheck('network', { 
          status: 'error', 
          error: `${successful}/${endpoints.length} endpoints reachable` 
        });
      }
    } catch (error) {
      updateCheck('network', { 
        status: 'error', 
        error: 'Network connectivity test failed' 
      });
    }
  };

  const checkSystemHealth = async () => {
    updateCheck('recent-errors', { status: 'running' });
    
    try {
      // Check for recent errors in localStorage
      const recentErrors = localStorage.getItem('recentErrors');
      const errorCount = recentErrors ? JSON.parse(recentErrors).length : 0;
      
      if (errorCount > 10) {
        updateCheck('recent-errors', { 
          status: 'error', 
          error: `${errorCount} recent errors detected` 
        });
      } else {
        updateCheck('recent-errors', { status: 'success' });
      }
    } catch (error) {
      updateCheck('recent-errors', { 
        status: 'error', 
        error: 'Unable to check system health' 
      });
    }
  };

  const runAllChecks = async () => {
    setIsRunning(true);
    
    // Reset all checks to pending
    setChecks(prev => prev.map(check => ({ ...check, status: 'pending' as const, error: undefined })));
    
    // Run checks sequentially with small delays
    const checkFunctions = [
      checkEnvironmentVariables,
      checkDatabase,
      checkShopify,
      checkPrintBridge,
      checkNetwork,
      checkSystemHealth
    ];
    
    for (let i = 0; i < checkFunctions.length; i++) {
      await checkFunctions[i]();
      // Small delay between checks for better UX
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    setIsRunning(false);
    
    // Check if all passed
    const finalChecks = checks.filter(check => check.status === 'success');
    const allPassed = finalChecks.length === checks.length;
    
    toast({
      title: allPassed ? "All Checks Passed" : "Some Checks Failed",
      description: allPassed ? "System is ready for deployment" : "Please address the failing checks",
      variant: allPassed ? "default" : "destructive"
    });
    
    onComplete(allPassed);
  };

  const getStatusIcon = (status: CheckItem['status']) => {
    switch (status) {
      case 'running':
        return <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: CheckItem['status']) => {
    switch (status) {
      case 'running':
        return <Badge variant="secondary">Running...</Badge>;
      case 'success':
        return <Badge variant="default" className="bg-green-500 hover:bg-green-600">Pass</Badge>;
      case 'error':
        return <Badge variant="destructive">Fail</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  const completedCount = checks.filter(check => check.status === 'success' || check.status === 'error').length;
  const progressPercentage = (completedCount / checks.length) * 100;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" />
            Pre-flight Checklist
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progress</span>
              <span>{completedCount}/{checks.length} complete</span>
            </div>
            <Progress value={progressPercentage} />
          </div>
          
          {/* Checks */}
          <div className="space-y-3">
            {checks.map((check) => (
              <Card key={check.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <check.icon className="h-4 w-4" />
                      {check.name}
                    </CardTitle>
                    {getStatusBadge(check.status)}
                  </div>
                  <CardDescription>{check.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(check.status)}
                    <span className="text-sm">
                      {check.status === 'pending' && 'Waiting to run...'}
                      {check.status === 'running' && 'Checking...'}
                      {check.status === 'success' && 'Check passed'}
                      {check.status === 'error' && (check.error || 'Check failed')}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          
          {/* Actions */}
          <div className="flex gap-2">
            <Button 
              onClick={runAllChecks}
              disabled={isRunning}
              className="flex-1"
            >
              {isRunning ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Running Checks...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Run All Checks
                </>
              )}
            </Button>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}