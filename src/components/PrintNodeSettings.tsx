import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, Cloud } from 'lucide-react';
import { usePrintNode } from '@/contexts/PrintNodeContext';
import { printNodeService } from '@/lib/printNodeService';
import { toast } from 'sonner';

export function PrintNodeSettings() {
  const [localApiKey, setLocalApiKey] = useState('');
  const {
    isConnected,
    isLoading,
    printers,
    selectedPrinterId,
    apiKey,
    testConnection,
    saveApiKey,
    setSelectedPrinterId,
    refreshPrinters
  } = usePrintNode();

  const handleSaveApiKey = async () => {
    const keyToSave = localApiKey.trim() || apiKey.trim();
    if (!keyToSave) return;
    
    try {
      await saveApiKey(keyToSave);
      setLocalApiKey(''); // Clear local input after successful save
    } catch (error) {
      // Error handling is done in the context
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cloud className="h-5 w-5" />
          PrintNode Integration
        </CardTitle>
        <CardDescription>
          Configure cloud-based printing with PrintNode for reliable, CORS-free printing
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connection Status */}
        <div className="flex items-center gap-2">
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isConnected ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : (
            <XCircle className="h-4 w-4 text-red-500" />
          )}
          <span className="text-sm">
            {isLoading ? 'Testing connection...' : isConnected ? 'Connected to PrintNode' : 'Not connected'}
          </span>
          {isConnected && (
            <Badge variant="secondary" className="ml-auto">
              {printers.length} printer(s) available
            </Badge>
          )}
        </div>

        {/* API Key Configuration */}
        <div className="space-y-2">
          <Label htmlFor="printnode-api-key">PrintNode API Key</Label>
          <div className="flex gap-2">
            <Input
              id="printnode-api-key"
              type="password"
              placeholder={apiKey ? "Enter new API key to replace current" : "Enter your PrintNode API key"}
              value={localApiKey}
              onChange={(e) => setLocalApiKey(e.target.value)}
            />
            <Button onClick={handleSaveApiKey} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Get your API key from{' '}
            <a
              href="https://app.printnode.com/account/api"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              PrintNode Dashboard
            </a>
          </p>
        </div>

        {/* Printer Selection */}
        {isConnected && printers.length > 0 && (
          <div className="space-y-2">
            <Label htmlFor="printnode-printer">Select Printer</Label>
            <Select value={selectedPrinterId} onValueChange={setSelectedPrinterId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a PrintNode printer" />
              </SelectTrigger>
              <SelectContent>
                {printers.map((printer) => (
                  <SelectItem key={printer.id} value={printer.id.toString()}>
                    <div className="flex items-center justify-between w-full">
                      <span>{printer.name}</span>
                      <Badge
                        variant={printer.status === 'online' ? 'default' : 'secondary'}
                        className="ml-2"
                      >
                        {printer.status}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button variant="outline" onClick={testConnection} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Test Connection'}
            </Button>
            {isConnected && (
              <Button variant="outline" onClick={refreshPrinters}>
                Refresh Printers
              </Button>
            )}
          </div>
          
          {/* Test Print Buttons */}
          {isConnected && selectedPrinterId && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Test Print Options:</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button 
                  onClick={async () => {
                    try {
                      // Use the EXACT working ZPL format from before (that was printing and cutting)
                      const workingZpl = `^XA
^MMC
^MT6
^PQ1,1,0
^FO50,50^A0N,30,30^FDTEST PRINT ZD410^FS
^FO50,100^A0N,20,20^FD${new Date().toLocaleString()}^FS
^FO50,130^A0N,15,15^FDZD410 Cut Test^FS
^XZ`;
                      
                      console.log('🖨️ Using EXACT working ZPL format');
                      
                      const result = await printNodeService.printZPL(workingZpl, parseInt(selectedPrinterId), 1);
                      
                      if (result.success) {
                        toast.success('EXACT working format test sent!', {
                          description: `Job ID: ${result.jobId} - This should work!`
                        });
                      } else {
                        toast.error(`Working format test failed: ${result.error}`);
                      }
                    } catch (error) {
                      toast.error(`Working format test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                    }
                  }}
                  disabled={isLoading}
                  className="bg-green-600 hover:bg-green-700 flex-1 sm:flex-none"
                >
                  Test EXACT Working Format
                </Button>
                
                <Button 
                  onClick={async () => {
                    try {
                      // Test with different line endings
                      const crlfZpl = `^XA\r\n^FO50,50^A0N,30,30^FDCRLF TEST^FS\r\n^XZ\r\n`;
                      
                      console.log('🖨️ Testing CRLF line endings ZPL');
                      
                      const result = await printNodeService.printZPL(crlfZpl, parseInt(selectedPrinterId), 1);
                      
                      if (result.success) {
                        toast.success('CRLF test sent!', {
                          description: 'Testing Windows-style line endings'
                        });
                      } else {
                        toast.error(`CRLF test failed: ${result.error}`);
                      }
                    } catch (error) {
                      toast.error(`CRLF test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                    }
                  }}
                  disabled={isLoading}
                  variant="outline"
                  className="flex-1 sm:flex-none"
                >
                  Test CRLF Format
                </Button>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p><strong>ZD410 Debugging Tests:</strong></p>
                <p>• <strong>Minimal ZPL:</strong> Tests basic printing without any special commands</p>
                <p>• <strong>CRLF Format:</strong> Tests Windows-style line endings (\\r\\n)</p>
                <p>• Check browser console for detailed ZPL analysis and encoding info</p>
                <p><strong>Expected behavior:</strong> If none print, there's a ZPL format issue</p>
              </div>
            </div>
          )}
        </div>

        {/* Help Text */}
        <div className="text-xs text-muted-foreground space-y-1">
          <p>• PrintNode eliminates CORS issues and provides reliable cloud printing</p>
          <p>• Install PrintNode client on your computer and add your printer</p>
          <p>• Fallback to direct printing if PrintNode is unavailable</p>
        </div>
      </CardContent>
    </Card>
  );
}