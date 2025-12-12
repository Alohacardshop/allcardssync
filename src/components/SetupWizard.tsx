import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  CheckCircle, 
  XCircle, 
  Printer, 
  ShoppingCart, 
  Settings, 
  PlayCircle,
  ArrowRight,
  ArrowLeft
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQzTray } from '@/hooks/useQzTray';
import { PrinterSelect } from '@/components/PrinterSelect';

interface SetupStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
}

interface SetupWizardProps {
  open: boolean;
  onComplete: () => void;
}

export function SetupWizard({ open, onComplete }: SetupWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedPrinter, setSelectedPrinter] = useState<string>('');
  const [shopifyTestResult, setShopifyTestResult] = useState<'pending' | 'success' | 'error'>('pending');
  const [printerTestResult, setPrinterTestResult] = useState<'pending' | 'success' | 'error'>('pending');
  const { toast } = useToast();
  const { isConnected, printers, isLoadingPrinters, printZpl } = useQzTray();

  const [steps, setSteps] = useState<SetupStep[]>([
    {
      id: 'printer',
      title: 'Printer Setup',
      description: 'Select and test your label printer via QZ Tray',
      completed: false
    },
    {
      id: 'shopify',
      title: 'Shopify Integration',
      description: 'Verify Shopify API connection',
      completed: false
    },
    {
      id: 'preferences',
      title: 'User Preferences',
      description: 'Configure your workspace preferences',
      completed: false
    },
    {
      id: 'tour',
      title: 'Feature Tour',
      description: 'Learn about key features and workflows',
      completed: false
    }
  ]);

  const updateStepCompletion = (stepId: string, completed: boolean) => {
    setSteps(prev => prev.map(step => 
      step.id === stepId ? { ...step, completed } : step
    ));
  };

  const testPrinterConnection = async () => {
    setPrinterTestResult('pending');
    try {
      if (!isConnected) {
        setPrinterTestResult('error');
        toast({ 
          title: "QZ Tray Not Running", 
          description: "Please start QZ Tray application and refresh the page",
          variant: "destructive"
        });
        return;
      }

      if (!selectedPrinter) {
        setPrinterTestResult('error');
        toast({ 
          title: "No Printer Selected", 
          description: "Please select a printer from the dropdown",
          variant: "destructive"
        });
        return;
      }
      
      // Send test print with simple ZPL
      const testZpl = '^XA^FO50,50^A0N,30,30^FDQZ Tray Test^FS^XZ';
      await printZpl(selectedPrinter, testZpl);
      
      setPrinterTestResult('success');
      updateStepCompletion('printer', true);
      toast({ 
        title: "Printer Test Sent", 
        description: `Test label sent to ${selectedPrinter}` 
      });
      
      // Save printer settings
      localStorage.setItem('printerSettings', JSON.stringify({
        name: selectedPrinter
      }));
    } catch (error) {
      setPrinterTestResult('error');
      toast({ 
        title: "Printer Test Failed", 
        description: error instanceof Error ? error.message : "Unable to test printer connection",
        variant: "destructive"
      });
    }
  };

  const testShopifyConnection = async () => {
    setShopifyTestResult('pending');
    try {
      // Test basic Shopify connectivity by calling the locations endpoint
      const { data, error } = await supabase.functions.invoke('shopify-locations', {
        body: { storeKey: 'hawaii' }
      });
      
      if (error) throw error;
      
      if (data?.ok) {
        setShopifyTestResult('success');
        updateStepCompletion('shopify', true);
        toast({ 
          title: "Shopify Connected", 
          description: `Found ${data.count} locations`
        });
      } else {
        setShopifyTestResult('error');
        toast({ 
          title: "Shopify Test Failed", 
          description: "Unable to connect to Shopify API",
          variant: "destructive"
        });
      }
    } catch (error) {
      setShopifyTestResult('error');
      toast({ 
        title: "Shopify Error", 
        description: "Failed to test Shopify connection",
        variant: "destructive"
      });
    }
  };

  const handlePreferencesSetup = () => {
    // Set default preferences
    const preferences = {
      autoAdvanceBarcode: true,
      showTooltips: true,
      compactView: false,
      defaultLabelTemplate: 'standard'
    };
    
    localStorage.setItem('userPreferences', JSON.stringify(preferences));
    updateStepCompletion('preferences', true);
    toast({ 
      title: "Preferences Saved", 
      description: "Default preferences have been configured"
    });
  };

  const startFeatureTour = () => {
    updateStepCompletion('tour', true);
    toast({ 
      title: "Feature Tour", 
      description: "Tour completed - you're ready to go!"
    });
  };

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const canProceed = () => {
    return steps[currentStep]?.completed || false;
  };

  const isComplete = () => {
    return steps.every(step => step.completed);
  };

  const handleComplete = () => {
    localStorage.setItem('setupCompleted', 'true');
    onComplete();
    toast({
      title: "Setup Complete!",
      description: "Welcome to your inventory management system"
    });
  };

  const progressPercentage = (steps.filter(s => s.completed).length / steps.length) * 100;

  const renderStepContent = () => {
    const step = steps[currentStep];
    
    switch (step.id) {
      case 'printer':
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Printer className="h-5 w-5" />
                Printer Connection Test
              </CardTitle>
              <CardDescription>
                Select and test your label printer via QZ Tray
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isConnected ? (
                <Alert className="border-yellow-200 bg-yellow-50">
                  <AlertDescription>
                    QZ Tray is not running. Please start the QZ Tray application and refresh this page.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Select Printer</Label>
                    <PrinterSelect
                      value={selectedPrinter}
                      onChange={setSelectedPrinter}
                      printers={printers}
                      isLoading={isLoadingPrinters}
                      placeholder="Choose a printer..."
                      showRefreshButton={false}
                    />
                  </div>
                  
                  <Button 
                    onClick={testPrinterConnection}
                    disabled={!selectedPrinter || printerTestResult === 'pending'}
                    className="w-full"
                  >
                    {printerTestResult === 'pending' ? 'Testing...' : 'Test Printer Connection'}
                  </Button>
                </>
              )}
              
              {printerTestResult !== 'pending' && (
                <Alert className={printerTestResult === 'error' ? 'border-red-200' : 'border-green-200'}>
                  {printerTestResult === 'success' ? 
                    <CheckCircle className="h-4 w-4" /> : 
                    <XCircle className="h-4 w-4" />
                  }
                  <AlertDescription>
                    {printerTestResult === 'success' ? 
                      'Printer test sent successfully!' : 
                      'Failed to connect to printer. Ensure QZ Tray is running and printer is available.'
                    }
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        );
        
      case 'shopify':
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Shopify Integration Test
              </CardTitle>
              <CardDescription>
                Verify connection to your Shopify store
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                onClick={testShopifyConnection}
                disabled={shopifyTestResult === 'pending'}
                className="w-full"
              >
                {shopifyTestResult === 'pending' ? 'Testing...' : 'Test Shopify Connection'}
              </Button>
              
              {shopifyTestResult !== 'pending' && (
                <Alert className={shopifyTestResult === 'error' ? 'border-red-200' : 'border-green-200'}>
                  {shopifyTestResult === 'success' ? 
                    <CheckCircle className="h-4 w-4" /> : 
                    <XCircle className="h-4 w-4" />
                  }
                  <AlertDescription>
                    {shopifyTestResult === 'success' ? 
                      'Shopify connection successful!' : 
                      'Failed to connect to Shopify. Check API credentials.'
                    }
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        );
        
      case 'preferences':
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                User Preferences
              </CardTitle>
              <CardDescription>
                Configure your workspace settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Auto-advance after barcode scan</span>
                  <Badge variant="outline">Enabled</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Show helpful tooltips</span>
                  <Badge variant="outline">Enabled</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Default label template</span>
                  <Badge variant="outline">Standard</Badge>
                </div>
              </div>
              
              <Button 
                onClick={handlePreferencesSetup}
                className="w-full"
              >
                Save Preferences
              </Button>
            </CardContent>
          </Card>
        );
        
      case 'tour':
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PlayCircle className="h-5 w-5" />
                Feature Tour
              </CardTitle>
              <CardDescription>
                Get familiar with key features
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>Dashboard - View daily stats and system status</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>Inventory - Add and manage trading cards</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>Labels - Design and print price labels</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>Batches - Process cards in bulk</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>Shopify - Sync inventory with your store</span>
                </div>
              </div>
              
              <Button 
                onClick={startFeatureTour}
                className="w-full"
              >
                Complete Tour
              </Button>
            </CardContent>
          </Card>
        );
        
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Welcome! Let's set up your system</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Setup Progress</span>
              <span>{Math.round(progressPercentage)}% complete</span>
            </div>
            <Progress value={progressPercentage} />
          </div>
          
          {/* Step indicators */}
          <div className="flex justify-between">
            {steps.map((step, index) => (
              <div 
                key={step.id}
                className={`flex flex-col items-center gap-2 ${
                  index === currentStep ? 'text-primary' : 
                  step.completed ? 'text-green-500' : 'text-muted-foreground'
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                  index === currentStep ? 'bg-primary text-primary-foreground' :
                  step.completed ? 'bg-green-500 text-white' : 'bg-muted'
                }`}>
                  {step.completed ? <CheckCircle className="h-4 w-4" /> : index + 1}
                </div>
                <span className="text-xs text-center">{step.title}</span>
              </div>
            ))}
          </div>
          
          {/* Step content */}
          <div className="min-h-[300px]">
            {renderStepContent()}
          </div>
          
          {/* Navigation */}
          <div className="flex justify-between">
            <Button 
              variant="outline"
              onClick={prevStep}
              disabled={currentStep === 0}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Previous
            </Button>
            
            {isComplete() ? (
              <Button onClick={handleComplete}>
                Complete Setup
              </Button>
            ) : currentStep === steps.length - 1 ? (
              <Button 
                onClick={nextStep}
                disabled={!canProceed()}
              >
                Finish
              </Button>
            ) : (
              <Button 
                onClick={nextStep}
                disabled={!canProceed()}
              >
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
