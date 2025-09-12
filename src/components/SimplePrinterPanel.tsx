/**
 * Simple Printer Panel
 * Direct printer configuration and testing for Zebra printers
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Printer, Settings, TestTube, Wifi, AlertCircle } from 'lucide-react';
import { useSimplePrinting } from '@/hooks/useSimplePrinting';
import { generateTestLabelZPL } from '@/lib/simpleZPLTemplates';
import type { PrinterConnection } from '@/lib/directLocalPrint';

export function SimplePrinterPanel() {
  const { currentPrinter, isLoading, testConnection, updatePrinter, print } = useSimplePrinting();
  
  const [showSettings, setShowSettings] = useState(false);
  const [tempPrinter, setTempPrinter] = useState<PrinterConnection>(currentPrinter);

  const handleSavePrinter = () => {
    updatePrinter(tempPrinter);
    setShowSettings(false);
  };

  const handleTestPrint = async () => {
    const testZPL = generateTestLabelZPL({
      dpi: 203,
      speed: 4,
      darkness: 10,
      copies: 1,
      cutAfter: true
    });
    
    await print(testZPL, 1);
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Printer className="h-5 w-5" />
          Zebra Printer
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Printer */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Current Printer:</span>
            <Badge variant="outline" className="gap-1">
              <Wifi className="h-3 w-3" />
              Ready
            </Badge>
          </div>
          
          <div className="p-3 bg-muted rounded-md">
            <div className="font-medium text-sm">{currentPrinter.name || 'Zebra Printer'}</div>
            <div className="text-xs text-muted-foreground">
              {currentPrinter.ip}:{currentPrinter.port}
            </div>
          </div>
        </div>

        <Separator />

        {/* Quick Actions */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Quick Actions:</label>
          
          <div className="grid grid-cols-2 gap-2">
            <Button 
              variant="outline"
              size="sm"
              onClick={testConnection}
              disabled={isLoading}
              className="gap-1"
            >
              <Settings className="h-3 w-3" />
              Test
            </Button>
            
            <Button 
              variant="outline"
              size="sm"
              onClick={handleTestPrint}
              disabled={isLoading}
              className="gap-1"
            >
              <TestTube className="h-3 w-3" />
              Print
            </Button>
          </div>
        </div>

        {/* Settings Dialog */}
        <Dialog open={showSettings} onOpenChange={setShowSettings}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full gap-2">
              <Settings className="h-4 w-4" />
              Printer Settings
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Zebra Printer Settings</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="printer-name">Printer Name</Label>
                <Input
                  id="printer-name"
                  placeholder="Zebra ZD410"
                  value={tempPrinter.name || ''}
                  onChange={(e) => setTempPrinter(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              
              <div>
                <Label htmlFor="printer-ip">IP Address *</Label>
                <Input
                  id="printer-ip"
                  placeholder="192.168.1.70"
                  value={tempPrinter.ip}
                  onChange={(e) => setTempPrinter(prev => ({ ...prev, ip: e.target.value }))}
                />
                <div className="text-xs text-muted-foreground mt-1">
                  Find this in your printer's network settings
                </div>
              </div>
              
              <div>
                <Label htmlFor="printer-port">Port</Label>
                <Input
                  id="printer-port"
                  placeholder="9100"
                  type="number"
                  value={tempPrinter.port}
                  onChange={(e) => setTempPrinter(prev => ({ ...prev, port: parseInt(e.target.value) || 9100 }))}
                />
                <div className="text-xs text-muted-foreground mt-1">
                  Standard Zebra port is 9100
                </div>
              </div>
              
              <div className="flex gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowSettings(false)} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={handleSavePrinter} className="flex-1">
                  Save Settings
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Info */}
        <div className="text-xs text-muted-foreground pt-2 border-t">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-3 w-3 mt-0.5 text-blue-500" />
            <div>
              Make sure your Zebra printer is connected to the same network and powered on.
              Default settings work for most ZD410 printers.
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}