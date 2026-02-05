 import React, { useState, useEffect } from 'react';
 import { Button } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
 import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
   DropdownMenuLabel,
 } from '@/components/ui/dropdown-menu';
 import {
   Dialog,
   DialogContent,
   DialogHeader,
   DialogTitle,
   DialogFooter,
 } from '@/components/ui/dialog';
 import { 
   BookmarkCheck, 
   ChevronDown, 
   Plus, 
   Star, 
   StarOff, 
   Trash2,
   Loader2,
   Eye
 } from 'lucide-react';
 import { useInventoryViews, getDefaultVisibleColumns } from '../hooks/useInventoryViews';
 import type { SavedInventoryView, InventoryColumn, SortField, SortDirection } from '../types/views';
 import type { InventoryFilterState } from '../types';
 
 interface SavedViewsDropdownProps {
   currentFilters: Partial<InventoryFilterState>;
   currentColumns: InventoryColumn[];
   sortColumn: SortField | null;
   sortDirection: SortDirection;
   activeViewId: string | null;
   onApplyView: (view: SavedInventoryView) => void;
   onViewChange: (viewId: string | null) => void;
 }
 
 export function SavedViewsDropdown({
   currentFilters,
   currentColumns,
   sortColumn,
   sortDirection,
   activeViewId,
   onApplyView,
   onViewChange,
 }: SavedViewsDropdownProps) {
   const { 
     views, 
     isLoading, 
     createView, 
     deleteView, 
     setDefaultView,
     initializeSystemViews,
   } = useInventoryViews();
   
   const [showSaveDialog, setShowSaveDialog] = useState(false);
   const [newViewName, setNewViewName] = useState('');
   
   // Initialize system views on first load if user has none
   useEffect(() => {
     if (!isLoading && views.length === 0) {
       initializeSystemViews.mutate();
     }
   }, [isLoading, views.length]);
 
   const activeView = views.find(v => v.id === activeViewId);
   
   const handleSaveView = async () => {
     if (!newViewName.trim()) return;
     
     await createView.mutateAsync({
       name: newViewName.trim(),
       filters: currentFilters,
       visible_columns: currentColumns,
       sort_column: sortColumn,
       sort_direction: sortDirection,
     });
     
     setShowSaveDialog(false);
     setNewViewName('');
   };
 
   const handleApplyView = (view: SavedInventoryView) => {
     onApplyView(view);
     onViewChange(view.id);
   };
 
   const handleClearView = () => {
     onViewChange(null);
   };
 
   const systemViews = views.filter(v => v.is_system);
   const userViews = views.filter(v => !v.is_system);
 
   return (
     <>
       <DropdownMenu>
         <DropdownMenuTrigger asChild>
           <Button variant="outline" size="sm" className="h-8 gap-1.5">
             <Eye className="h-4 w-4" />
             <span className="hidden sm:inline max-w-[120px] truncate">
               {activeView ? activeView.name : 'Views'}
             </span>
             <ChevronDown className="h-3.5 w-3.5 opacity-50" />
           </Button>
         </DropdownMenuTrigger>
         <DropdownMenuContent align="end" className="w-56">
           {isLoading ? (
             <div className="flex items-center justify-center py-4">
               <Loader2 className="h-4 w-4 animate-spin" />
             </div>
           ) : (
             <>
               {/* Clear active view */}
               {activeViewId && (
                 <>
                   <DropdownMenuItem onClick={handleClearView}>
                     <span className="text-muted-foreground">Clear view</span>
                   </DropdownMenuItem>
                   <DropdownMenuSeparator />
                 </>
               )}
               
               {/* System views */}
               {systemViews.length > 0 && (
                 <>
                   <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                     Quick Views
                   </DropdownMenuLabel>
                   {systemViews.map((view) => (
                     <DropdownMenuItem
                       key={view.id}
                       onClick={() => handleApplyView(view)}
                       className={activeViewId === view.id ? 'bg-accent' : ''}
                     >
                       <BookmarkCheck className="h-4 w-4 mr-2 text-muted-foreground" />
                       <span className="flex-1">{view.name}</span>
                       {view.is_default && (
                         <Star className="h-3 w-3 text-primary fill-primary" />
                       )}
                     </DropdownMenuItem>
                   ))}
                   <DropdownMenuSeparator />
                 </>
               )}
               
               {/* User views */}
               {userViews.length > 0 && (
                 <>
                   <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                     My Views
                   </DropdownMenuLabel>
                   {userViews.map((view) => (
                     <DropdownMenuItem
                       key={view.id}
                       onClick={() => handleApplyView(view)}
                       className={activeViewId === view.id ? 'bg-accent' : ''}
                     >
                       <span className="flex-1">{view.name}</span>
                       <div className="flex items-center gap-1">
                         {view.is_default ? (
                           <Button
                             variant="ghost"
                             size="sm"
                             className="h-6 w-6 p-0"
                             onClick={(e) => {
                               e.stopPropagation();
                               setDefaultView.mutate(null);
                             }}
                           >
                             <Star className="h-3 w-3 text-primary fill-primary" />
                           </Button>
                         ) : (
                           <Button
                             variant="ghost"
                             size="sm"
                             className="h-6 w-6 p-0"
                             onClick={(e) => {
                               e.stopPropagation();
                               setDefaultView.mutate(view.id);
                             }}
                           >
                             <StarOff className="h-3 w-3 text-muted-foreground" />
                           </Button>
                         )}
                         <Button
                           variant="ghost"
                           size="sm"
                           className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                           onClick={(e) => {
                             e.stopPropagation();
                             deleteView.mutate(view.id);
                           }}
                         >
                           <Trash2 className="h-3 w-3" />
                         </Button>
                       </div>
                     </DropdownMenuItem>
                   ))}
                   <DropdownMenuSeparator />
                 </>
               )}
               
               {/* Save current */}
               <DropdownMenuItem onClick={() => setShowSaveDialog(true)}>
                 <Plus className="h-4 w-4 mr-2" />
                 Save Current View
               </DropdownMenuItem>
             </>
           )}
         </DropdownMenuContent>
       </DropdownMenu>
 
       {/* Save View Dialog */}
       <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
         <DialogContent className="sm:max-w-[400px]">
           <DialogHeader>
             <DialogTitle>Save View</DialogTitle>
           </DialogHeader>
           <div className="py-4">
             <Input
               placeholder="View name..."
               value={newViewName}
               onChange={(e) => setNewViewName(e.target.value)}
               onKeyDown={(e) => {
                 if (e.key === 'Enter') handleSaveView();
               }}
               autoFocus
             />
             <p className="text-xs text-muted-foreground mt-2">
               Saves current filters, column visibility, and sort order.
             </p>
           </div>
           <DialogFooter>
             <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
               Cancel
             </Button>
             <Button 
               onClick={handleSaveView}
               disabled={!newViewName.trim() || createView.isPending}
             >
               {createView.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
               Save View
             </Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>
     </>
   );
 }