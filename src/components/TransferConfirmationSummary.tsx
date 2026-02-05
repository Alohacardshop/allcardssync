 import React from 'react';
 import { cn } from '@/lib/utils';
 import { ArrowRight, ArrowDown, ArrowUp, AlertTriangle, CheckCircle2 } from 'lucide-react';
 import { Badge } from '@/components/ui/badge';
 
 interface LocationChange {
   locationGid: string;
   locationName: string;
   before: number;
   change: number;
   after: number;
   isSource: boolean;
 }
 
 interface TransferConfirmationSummaryProps {
   sourceLocationGid: string;
   sourceLocationName: string;
   destinationLocationGid: string;
   destinationLocationName: string;
   /** Map of inventory_item_id -> available qty at source */
   sourceLevels: Map<string, number>;
   /** Map of inventory_item_id -> available qty at destination */
   destinationLevels: Map<string, number>;
   /** Number of items being transferred (qty delta) */
   itemCount: number;
   className?: string;
 }
 
 export function TransferConfirmationSummary({
   sourceLocationGid,
   sourceLocationName,
   destinationLocationGid,
   destinationLocationName,
   sourceLevels,
   destinationLevels,
   itemCount,
   className,
 }: TransferConfirmationSummaryProps) {
   // Calculate totals
   const sourceBefore = Array.from(sourceLevels.values()).reduce((sum, v) => sum + v, 0);
   const destBefore = Array.from(destinationLevels.values()).reduce((sum, v) => sum + v, 0);
   
   const sourceAfter = sourceBefore - itemCount;
   const destAfter = destBefore + itemCount;
   
   const wouldGoNegative = sourceAfter < 0;
   
   const locations: LocationChange[] = [
     {
       locationGid: sourceLocationGid,
       locationName: sourceLocationName,
       before: sourceBefore,
       change: -itemCount,
       after: sourceAfter,
       isSource: true,
     },
     {
       locationGid: destinationLocationGid,
       locationName: destinationLocationName,
       before: destBefore,
       change: itemCount,
       after: destAfter,
       isSource: false,
     },
   ];
 
   return (
     <div className={cn('space-y-3', className)}>
       {/* Status indicator */}
       {wouldGoNegative ? (
         <div className="flex items-center gap-2 text-destructive text-sm font-medium bg-destructive/10 rounded-md p-2">
           <AlertTriangle className="h-4 w-4" />
           Transfer would result in negative inventory
         </div>
       ) : (
         <div className="flex items-center gap-2 text-primary text-sm font-medium bg-primary/10 rounded-md p-2">
           <CheckCircle2 className="h-4 w-4" />
           Ready to transfer {itemCount} item{itemCount !== 1 ? 's' : ''}
         </div>
       )}
 
       {/* Location changes table */}
       <div className="border rounded-md overflow-hidden">
         <table className="w-full text-sm">
           <thead className="bg-muted/50">
             <tr>
               <th className="text-left font-medium px-3 py-2">Location</th>
               <th className="text-right font-medium px-3 py-2">Before</th>
               <th className="text-center font-medium px-3 py-2">Change</th>
               <th className="text-right font-medium px-3 py-2">After</th>
             </tr>
           </thead>
           <tbody>
             {locations.map((loc) => (
               <tr key={loc.locationGid} className="border-t">
                 <td className="px-3 py-2.5">
                   <div className="flex items-center gap-2">
                     <span className="font-medium">{loc.locationName}</span>
                     <Badge variant="outline" className="text-xs">
                       {loc.isSource ? 'Source' : 'Destination'}
                     </Badge>
                   </div>
                 </td>
                 <td className="text-right px-3 py-2.5 font-mono">
                   {loc.before}
                 </td>
                 <td className="text-center px-3 py-2.5">
                   <div className={cn(
                     'inline-flex items-center gap-1 font-mono font-medium',
                     loc.change < 0 ? 'text-destructive' : 'text-primary'
                   )}>
                     {loc.change < 0 ? (
                       <ArrowDown className="h-3 w-3" />
                     ) : (
                       <ArrowUp className="h-3 w-3" />
                     )}
                     {loc.change > 0 ? '+' : ''}{loc.change}
                   </div>
                 </td>
                 <td className={cn(
                   'text-right px-3 py-2.5 font-mono font-medium',
                   loc.after < 0 && 'text-destructive'
                 )}>
                   {loc.after}
                 </td>
               </tr>
             ))}
           </tbody>
         </table>
       </div>
 
       {/* Visual flow indicator */}
       <div className="flex items-center justify-center gap-3 text-muted-foreground text-sm py-2">
         <span className="font-medium">{sourceLocationName}</span>
         <ArrowRight className="h-4 w-4" />
         <span className="font-medium">{destinationLocationName}</span>
       </div>
     </div>
   );
 }
 
 /**
  * Check if transfer would result in negative inventory
  */
 export function wouldTransferGoNegative(
   sourceLevels: Map<string, number>,
   itemCount: number
 ): boolean {
   const totalAvailable = Array.from(sourceLevels.values()).reduce((sum, v) => sum + v, 0);
   return totalAvailable - itemCount < 0;
 }