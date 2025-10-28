import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Printer, Network, Activity } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PrintNodeSettings } from '@/components/PrintNodeSettings';
import { CutterSettingsPanel } from '@/components/CutterSettingsPanel';
import { ZebraPrinterPanel } from '@/components/ZebraPrinterPanel';
import { ZebraDiagnosticsPanel } from '@/components/ZebraDiagnosticsPanel';
import { TCGHealthCheck } from './TCGHealthCheck';

export function HardwareTabsSection() {
  return (
    <Tabs defaultValue="printers" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="printers" className="flex items-center gap-2">
          <Printer className="w-4 h-4" />
          <span>Printers</span>
        </TabsTrigger>
        <TabsTrigger value="network" className="flex items-center gap-2">
          <Network className="w-4 h-4" />
          <span>Network Devices</span>
        </TabsTrigger>
        <TabsTrigger value="diagnostics" className="flex items-center gap-2">
          <Activity className="w-4 h-4" />
          <span>Diagnostics</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="printers" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Printer Configuration</CardTitle>
            <CardDescription>Configure your printing hardware and preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <PrintNodeSettings />
            <CutterSettingsPanel />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="network" className="space-y-4">
        <ZebraPrinterPanel />
      </TabsContent>

      <TabsContent value="diagnostics" className="space-y-4">
        <ZebraDiagnosticsPanel />
        <TCGHealthCheck />
      </TabsContent>
    </Tabs>
  );
}
