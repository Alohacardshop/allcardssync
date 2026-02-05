 import React from 'react';
 import { Button } from '@/components/ui/button';
 import { Checkbox } from '@/components/ui/checkbox';
 import { Label } from '@/components/ui/label';
 import {
   Popover,
   PopoverContent,
   PopoverTrigger,
 } from '@/components/ui/popover';
 import { Columns3 } from 'lucide-react';
 import { INVENTORY_COLUMNS, type InventoryColumn } from '../types/views';
 
 interface ColumnChooserProps {
   visibleColumns: InventoryColumn[];
   onChange: (columns: InventoryColumn[]) => void;
 }
 
 export function ColumnChooser({ visibleColumns, onChange }: ColumnChooserProps) {
   const toggleColumn = (columnId: InventoryColumn) => {
     const config = INVENTORY_COLUMNS.find(c => c.id === columnId);
     if (config?.locked) return; // Can't toggle locked columns
     
     if (visibleColumns.includes(columnId)) {
       onChange(visibleColumns.filter(id => id !== columnId));
     } else {
       // Add in original order
       const newColumns = INVENTORY_COLUMNS
         .filter(c => visibleColumns.includes(c.id) || c.id === columnId)
         .map(c => c.id);
       onChange(newColumns);
     }
   };
 
   const toggleableColumns = INVENTORY_COLUMNS.filter(c => !c.locked);
   const activeCount = visibleColumns.filter(id => 
     !INVENTORY_COLUMNS.find(c => c.id === id)?.locked
   ).length;
 
   return (
     <Popover>
       <PopoverTrigger asChild>
         <Button variant="outline" size="sm" className="h-8 gap-1.5">
           <Columns3 className="h-4 w-4" />
           <span className="hidden sm:inline">Columns</span>
           <span className="text-xs text-muted-foreground">
             ({activeCount}/{toggleableColumns.length})
           </span>
         </Button>
       </PopoverTrigger>
       <PopoverContent align="end" className="w-48 p-3">
         <div className="space-y-3">
           <div className="text-sm font-medium">Show Columns</div>
           <div className="space-y-2">
             {toggleableColumns.map((column) => (
               <div key={column.id} className="flex items-center gap-2">
                 <Checkbox
                   id={`col-${column.id}`}
                   checked={visibleColumns.includes(column.id)}
                   onCheckedChange={() => toggleColumn(column.id)}
                 />
                 <Label
                   htmlFor={`col-${column.id}`}
                   className="text-sm font-normal cursor-pointer"
                 >
                   {column.label}
                 </Label>
               </div>
             ))}
           </div>
           <div className="pt-2 border-t">
             <Button
               variant="ghost"
               size="sm"
               className="w-full h-7 text-xs"
               onClick={() => onChange(INVENTORY_COLUMNS.filter(c => c.defaultVisible).map(c => c.id))}
             >
               Reset to Default
             </Button>
           </div>
         </div>
       </PopoverContent>
     </Popover>
   );
 }