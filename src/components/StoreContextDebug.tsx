import React from 'react';
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Store, MapPin, AlertTriangle, CheckCircle } from "lucide-react";
import { useStore } from "@/contexts/StoreContext";

/**
 * Debug component showing current store/location context
 * Helps users understand which store context is active
 */
export const StoreContextDebug = ({ className }: { className?: string }) => {
  const { assignedStore, selectedLocation, assignedStoreName } = useStore();

  const hasCompleteContext = assignedStore && selectedLocation;
  
  return (
    <Card className={`border-dashed ${className}`}>
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 text-sm">
          {hasCompleteContext ? (
            <>
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-green-700">Active Context:</span>
            </>
          ) : (
            <>
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <span className="text-yellow-700">Incomplete Context:</span>
            </>
          )}
        </div>
        
        <div className="flex items-center gap-4 mt-2">
          <div className="flex items-center gap-1">
            <Store className="h-3 w-3 text-muted-foreground" />
            <Badge variant={assignedStore ? "default" : "secondary"}>
              {assignedStoreName || assignedStore || 'No Store'}
            </Badge>
          </div>
          
          <div className="flex items-center gap-1">
            <MapPin className="h-3 w-3 text-muted-foreground" />
            <Badge variant={selectedLocation ? "default" : "secondary"}>
              {selectedLocation ? `Location ${selectedLocation.split('/').pop()}` : 'No Location'}
            </Badge>
          </div>
        </div>
        
        {!hasCompleteContext && (
          <div className="text-xs text-muted-foreground mt-2">
            Items will only show when both store and location are selected
          </div>
        )}
      </CardContent>
    </Card>
  );
};