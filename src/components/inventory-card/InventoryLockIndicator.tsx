 import React, { memo } from 'react';
 import { Lock } from 'lucide-react';
 import { Badge } from '@/components/ui/badge';
 import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
 import { getLockTypeLabel, type LockType } from '@/hooks/useInventoryLocks';
 import { formatDistanceToNow } from 'date-fns';
 
 interface InventoryLockIndicatorProps {
   lockType: LockType;
   lockedBy?: string | null;
   expiresAt: string;
   className?: string;
 }
 
 /**
  * Subtle lock indicator for inventory items
  * Shows a lock icon with tooltip explaining the lock
  */
 export const InventoryLockIndicator = memo(({
   lockType,
   lockedBy,
   expiresAt,
   className = '',
 }: InventoryLockIndicatorProps) => {
   const expiresIn = formatDistanceToNow(new Date(expiresAt), { addSuffix: true });
   const isExpiringSoon = new Date(expiresAt).getTime() - Date.now() < 5 * 60 * 1000; // < 5 min
 
   return (
     <Tooltip>
       <TooltipTrigger asChild>
         <Badge 
           variant="outline" 
           className={`
             bg-amber-500/10 text-amber-600 border-amber-500/30 
             dark:bg-amber-500/20 dark:text-amber-400
             ${isExpiringSoon ? 'animate-pulse' : ''}
             ${className}
           `}
         >
           <Lock className="h-3 w-3 mr-1" />
           Locked
         </Badge>
       </TooltipTrigger>
       <TooltipContent side="top" className="max-w-xs">
         <div className="space-y-1">
           <p className="font-medium">Item is locked</p>
           <p className="text-xs text-muted-foreground">
             <strong>Operation:</strong> {getLockTypeLabel(lockType)}
           </p>
           {lockedBy && (
             <p className="text-xs text-muted-foreground">
               <strong>By:</strong> {lockedBy.slice(0, 8)}...
             </p>
           )}
           <p className="text-xs text-muted-foreground">
             <strong>Expires:</strong> {expiresIn}
           </p>
           <p className="text-xs text-muted-foreground mt-2">
             This item cannot be modified while locked.
           </p>
         </div>
       </TooltipContent>
     </Tooltip>
   );
 });
 
 InventoryLockIndicator.displayName = 'InventoryLockIndicator';