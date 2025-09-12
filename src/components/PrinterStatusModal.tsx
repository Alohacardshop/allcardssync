import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle2, AlertTriangle, XCircle, Wifi, Network } from 'lucide-react';
import type { PrinterStatus } from '@/lib/zebraNetworkService';

interface PrinterStatusModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: PrinterStatus | null;
  printerIp: string;
}

export function PrinterStatusModal({ 
  open, 
  onOpenChange, 
  status, 
  printerIp 
}: PrinterStatusModalProps) {
  if (!status) {
    return null;
  }

  const getStatusIcon = (isReady: boolean) => {
    if (isReady) {
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    }
    return <XCircle className="h-4 w-4 text-red-600" />;
  };

  const getStatusBadge = (condition: boolean, label: string) => {
    return (
      <Badge 
        variant={condition ? "destructive" : "secondary"}
        className="flex items-center gap-1"
      >
        {condition ? (
          <AlertTriangle className="h-3 w-3" />
        ) : (
          <CheckCircle2 className="h-3 w-3" />
        )}
        {label}
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getStatusIcon(status.ready)}
            Printer Status - {printerIp}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Overall Status */}
          <div className="flex items-center gap-2">
            <span className="font-medium">Overall Status:</span>
            <Badge 
              variant={status.ready ? "default" : "destructive"}
              className="flex items-center gap-1"
            >
              {status.ready ? (
                <>
                  <CheckCircle2 className="h-3 w-3" />
                  Ready
                </>
              ) : (
                <>
                  <XCircle className="h-3 w-3" />
                  Not Ready
                </>
              )}
            </Badge>
          </div>

          <Separator />

          {/* Status Conditions */}
          <div className="space-y-3">
            <div className="font-medium">Conditions:</div>
            <div className="grid grid-cols-2 gap-2">
              {getStatusBadge(status.paused, status.paused ? "Paused" : "Running")}
              {getStatusBadge(status.headOpen, status.headOpen ? "Head Open" : "Head Closed")}
              {getStatusBadge(status.mediaOut, status.mediaOut ? "Media Out" : "Media OK")}
            </div>
          </div>

          {/* Network Information */}
          {(status.ipAddr || status.ssid) && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="font-medium">Network Information:</div>
                <div className="space-y-1">
                  {status.ipAddr && (
                    <div className="flex items-center gap-2 text-sm">
                      <Network className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">IP Address:</span>
                      <code className="px-2 py-1 bg-muted rounded text-xs">
                        {status.ipAddr}
                      </code>
                    </div>
                  )}
                  {status.ssid && (
                    <div className="flex items-center gap-2 text-sm">
                      <Wifi className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">WiFi Network:</span>
                      <code className="px-2 py-1 bg-muted rounded text-xs">
                        {status.ssid}
                      </code>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          <Separator />

          {/* Raw Status Response */}
          <div className="space-y-2">
            <div className="font-medium">Raw Status Response:</div>
            <ScrollArea className="h-32 w-full border rounded p-2">
              <pre className="text-xs whitespace-pre-wrap font-mono text-muted-foreground">
                {status.raw}
              </pre>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}