// Feature module exports
export { default as InventoryPage } from './pages/InventoryPage';
export { InventoryFiltersBar } from './components/InventoryFiltersBar';
export { InventoryList } from './components/InventoryList';
export { InventoryBulkBar } from './components/InventoryBulkBar';
export { useInventorySelection } from './hooks/useInventorySelection';
export { useInventoryActions } from './hooks/useInventoryActions';
export { useInventoryMutations } from './hooks/useInventoryMutations';
export type { ActionType, ItemActionState, BulkActionState } from './hooks/useInventoryMutations';
export * from './types';
