import { supabase } from "@/integrations/supabase/client";

import { APIError } from "@/types/errors"

export const handleApiError = (error: APIError | Error | unknown, operation: string) => {
  if (error) {
    // Log error for debugging but avoid exposing sensitive information
    if (process.env.NODE_ENV === 'development') {
      console.error(`API Error - ${operation}:`, error);
    }
    
    // Type guard for objects with message property
    if (error && typeof error === 'object' && 'message' in error) {
      const errorWithMessage = error as { message: string }
      throw new Error(errorWithMessage.message);
    }
    
    // If it's already an Error instance
    if (error instanceof Error) {
      throw error;
    }
    
    // Fallback for other types
    throw new Error(String(error));
  }
};

// Enhanced inventory analytics with sales data - optimized with pagination
export async function getInventoryAnalytics(storeKey?: string, locationGid?: string) {
  try {
    let query = supabase
      .from('intake_items')
      .select(`
        id, 
        created_at, 
        removed_from_batch_at,
        price, 
        cost, 
        printed_at, 
        pushed_at, 
        deleted_at,
        sold_at,
        sold_price,
        category,
        grade,
        type
      `)
      .is('deleted_at', null)
      .limit(5000); // Add limit to prevent massive queries

    // Apply store and location filters
    if (storeKey) {
      query = query.eq('store_key', storeKey);
    }
    if (locationGid) {
      query = query.eq('shopify_location_gid', locationGid);
    }

    const { data, error } = await query;

    if (error) throw error;

    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Filter active inventory items (those that have been added to inventory)
    const inventoryItems = data.filter(item => item.removed_from_batch_at);
    const soldItems = data.filter(item => item.sold_at);

    const analytics = {
      totalItems: inventoryItems.length,
      recentItems: inventoryItems.filter(item => new Date(item.removed_from_batch_at || item.created_at) > thirtyDaysAgo).length,
      printedItems: inventoryItems.filter(item => item.printed_at).length,
      pushedItems: inventoryItems.filter(item => item.pushed_at).length,
      soldItems: soldItems.length,
      soldThisWeek: soldItems.filter(item => new Date(item.sold_at) > sevenDaysAgo).length,
      soldThisMonth: soldItems.filter(item => new Date(item.sold_at) > thirtyDaysAgo).length,
      totalValue: inventoryItems.reduce((sum, item) => sum + (parseFloat(item.price?.toString() || '0') || 0), 0),
      totalCost: inventoryItems.reduce((sum, item) => sum + (parseFloat(item.cost?.toString() || '0') || 0), 0),
      totalSalesRevenue: soldItems.reduce((sum, item) => sum + (parseFloat(item.sold_price?.toString() || '0') || 0), 0),
      totalSalesCost: soldItems.reduce((sum, item) => sum + (parseFloat(item.cost?.toString() || '0') || 0), 0),
      categoryBreakdown: inventoryItems.reduce((acc: Record<string, number>, item) => {
        const category = item.category || 'Unknown';
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {}),
      gradeBreakdown: inventoryItems.reduce((acc: Record<string, number>, item) => {
        const grade = item.grade || 'Raw';
        acc[grade] = (acc[grade] || 0) + 1;
        return acc;
      }, {}),
      typeBreakdown: inventoryItems.reduce((acc: Record<string, number>, item) => {
        const type = item.type || 'Raw';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {}),
      // Calculate inventory aging
      inventoryAging: inventoryItems.reduce((acc: Record<string, number>, item) => {
        const addedDate = new Date(item.removed_from_batch_at || item.created_at);
        const daysInInventory = Math.floor((today.getTime() - addedDate.getTime()) / (1000 * 60 * 60 * 24));
        
        let ageGroup = '0-7 days';
        if (daysInInventory > 90) ageGroup = '90+ days';
        else if (daysInInventory > 30) ageGroup = '30-90 days';
        else if (daysInInventory > 7) ageGroup = '7-30 days';
        
        acc[ageGroup] = (acc[ageGroup] || 0) + 1;
        return acc;
      }, {}),
      averageDaysToSell: soldItems.length > 0 
        ? soldItems.reduce((sum, item) => {
            const addedDate = new Date(item.removed_from_batch_at || item.created_at);
            const soldDate = new Date(item.sold_at);
            const daysToSell = Math.floor((soldDate.getTime() - addedDate.getTime()) / (1000 * 60 * 60 * 24));
            return sum + daysToSell;
          }, 0) / soldItems.length
        : 0
    };

    return analytics;
  } catch (error) {
    handleApiError(error, 'getInventoryAnalytics');
    return {
      totalItems: 0,
      recentItems: 0,
      printedItems: 0,
      pushedItems: 0,
      soldItems: 0,
      soldThisWeek: 0,
      soldThisMonth: 0,
      totalValue: 0,
      totalCost: 0,
      totalSalesRevenue: 0,
      totalSalesCost: 0,
      categoryBreakdown: {},
      gradeBreakdown: {},
      typeBreakdown: {},
      inventoryAging: {},
      averageDaysToSell: 0
    };
  }
}

// System health check
export async function checkSystemHealth() {
  try {
    const { data, error } = await supabase.from('intake_items').select('count').limit(1);
    if (error) throw error;
    
    return {
      database: true,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('System health check failed:', error);
    }
    return {
      database: false,
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Get print job stats
export async function getPrintJobStats() {
  try {
    const { data, error } = await supabase
      .from('print_jobs')
      .select('status, created_at')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    return {
      total: data.length,
      queued: data.filter(job => job.status === 'queued').length,
      printing: data.filter(job => job.status === 'printing').length,
      completed: data.filter(job => job.status === 'completed').length,
      failed: data.filter(job => job.status === 'error').length,
      recentJobs: data.filter(job => new Date(job.created_at) > yesterday).length
    };
  } catch (error) {
    handleApiError(error, 'getPrintJobStats');
    return {
      total: 0,
      queued: 0,
      printing: 0,
      completed: 0,
      failed: 0,
      recentJobs: 0
    };
  }
}

// Utility functions for time formatting
export function formatTimeAgo(timestamp: string | null): string {
  if (!timestamp) return "—";
  
  const now = Date.now();
  const time = new Date(timestamp).getTime();
  const secondsAgo = Math.floor((now - time) / 1000);
  
  if (secondsAgo < 60) return `${secondsAgo}s ago`;
  
  const minutesAgo = Math.floor(secondsAgo / 60);
  if (minutesAgo < 60) return `${minutesAgo}m ago`;
  
  const hoursAgo = Math.floor(minutesAgo / 60);
  if (hoursAgo < 24) return `${hoursAgo}h ago`;
  
  const daysAgo = Math.floor(hoursAgo / 24);
  return `${daysAgo}d ago`;
}