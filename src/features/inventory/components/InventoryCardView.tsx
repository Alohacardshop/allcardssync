import React, { memo } from 'react';
import { InventoryList } from './InventoryList';
import type { VirtualInventoryListProps } from '../types';

/**
 * Card view wrapper - delegates to InventoryList (virtualized cards)
 * Kept as a separate component for view mode consistency
 */
export const InventoryCardView = memo((props: VirtualInventoryListProps) => {
  return <InventoryList {...props} />;
});

InventoryCardView.displayName = 'InventoryCardView';
