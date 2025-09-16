/**
 * Store context validation utilities to ensure consistency
 * between intake forms and CurrentBatchPanel
 */

export interface StoreContext {
  assignedStore: string;
  selectedLocation: string;
}

/**
 * Validates that store context is properly set and consistent
 */
export function validateStoreContext(
  itemStoreKey: string,
  userStoreKey: string,
  operation: string
) {
  if (!itemStoreKey || !userStoreKey) {
    const error = `Missing store context in ${operation}: itemStore=${itemStoreKey}, userStore=${userStoreKey}`;
    console.error(error);
    throw new Error(`Cannot ${operation} - missing store context`);
  }

  if (itemStoreKey !== userStoreKey) {
    console.error(`Store mismatch in ${operation}:`, {
      itemStore: itemStoreKey,
      userStore: userStoreKey
    });
    throw new Error(`Cannot ${operation} items for store ${itemStoreKey} while logged into ${userStoreKey}`);
  }
}

/**
 * Validates that both store and location are set before operations
 */
export function validateCompleteStoreContext(
  storeContext: Partial<StoreContext>, 
  operation: string
): StoreContext {
  const { assignedStore, selectedLocation } = storeContext;
  
  if (!assignedStore || !selectedLocation) {
    const error = `Incomplete store context for ${operation}: store=${assignedStore}, location=${selectedLocation}`;
    console.error(error);
    throw new Error(`Cannot ${operation} without complete store/location context`);
  }

  return { assignedStore, selectedLocation };
}

/**
 * Logs store context for debugging
 */
export function logStoreContext(
  context: string, 
  storeContext: Partial<StoreContext>,
  additionalData?: Record<string, any>
) {
  console.log(`[${context}] Store Context:`, {
    assignedStore: storeContext.assignedStore,
    selectedLocation: storeContext.selectedLocation,
    timestamp: new Date().toISOString(),
    ...additionalData
  });
}