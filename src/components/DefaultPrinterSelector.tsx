import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Settings, Printer, CheckCircle, AlertCircle } from 'lucide-react';
import { useZebraNetwork } from '@/hooks/useZebraNetwork';
import { ZebraPrinterSelectionDialog } from '@/components/ZebraPrinterSelectionDialog';

export function DefaultPrinterSelector() {
  const { selectedPrinter, isConnected } = useZebraNetwork();
  const [showPrinterDialog, setShowPrinterDialog] = useState(false);

  const handleSetDefault = async () => {
    // The dialog will handle setting the default printer
    // No additional action needed since it uses the useZebraNetwork hook
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Default Printer
          </CardTitle>
          <CardDescription>
            Set your default printer for all print operations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {selectedPrinter ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-muted rounded-md">
                <div className="flex items-center gap-3">
                  <Printer className="h-4 w-4" />
                  <div>
                    <div className="font-medium text-sm">{selectedPrinter.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {selectedPrinter.ip}:{selectedPrinter.port}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selectedPrinter.isConnected ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <Badge variant="secondary" className="bg-green-100 text-green-700">
                        Connected
                      </Badge>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-4 w-4 text-orange-600" />
                      <Badge variant="secondary" className="bg-orange-100 text-orange-700">
                        Offline
                      </Badge>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <Printer className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No default printer set</p>
            </div>
          )}

          <Button 
            onClick={() => setShowPrinterDialog(true)}
            variant="outline" 
            className="w-full"
          >
            {selectedPrinter ? 'Change Default Printer' : 'Set Default Printer'}
          </Button>

          <div className="text-xs text-muted-foreground">
            <p><strong>Note:</strong> This printer will be used for all print operations unless you choose a different one when printing.</p>
          </div>
        </CardContent>
      </Card>

      <ZebraPrinterSelectionDialog
        open={showPrinterDialog}
        onOpenChange={setShowPrinterDialog}
        onPrint={handleSetDefault}
        title="Set Default Printer"
        allowDefaultOnly={true}
      />
    </>
  );
}