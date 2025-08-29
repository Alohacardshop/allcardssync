import { supabase } from "@/integrations/supabase/client";

export const handleApiError = (error: any, operation: string) => {
  if (error) {
    // Log error for debugging but avoid exposing sensitive information
    if (process.env.NODE_ENV === 'development') {
      console.error(`API Error - ${operation}:`, error);
    }
    
    if (error.message) {
      throw new Error(error.message);
    }
    throw error;
  }
};

// Enhanced inventory analytics
export async function getInventoryAnalytics() {
  try {
    const { data, error } = await supabase
      .from('intake_items')
      .select(`
        id, 
        created_at, 
        price, 
        cost, 
        printed_at, 
        pushed_at, 
        deleted_at,
        category,
        grade
      `)
      .is('deleted_at', null);

    if (error) throw error;

    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const analytics = {
      totalItems: data.length,
      recentItems: data.filter(item => new Date(item.created_at) > thirtyDaysAgo).length,
      printedItems: data.filter(item => item.printed_at).length,
      pushedItems: data.filter(item => item.pushed_at).length,
      totalValue: data.reduce((sum, item) => sum + (parseFloat(item.price?.toString() || '0') || 0), 0),
      totalCost: data.reduce((sum, item) => sum + (parseFloat(item.cost?.toString() || '0') || 0), 0),
      categoryBreakdown: data.reduce((acc: Record<string, number>, item) => {
        const category = item.category || 'Unknown';
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {}),
      gradeBreakdown: data.reduce((acc: Record<string, number>, item) => {
        const grade = item.grade || 'Raw';
        acc[grade] = (acc[grade] || 0) + 1;
        return acc;
      }, {})
    };

    return analytics;
  } catch (error) {
    handleApiError(error, 'getInventoryAnalytics');
    return {
      totalItems: 0,
      recentItems: 0,
      printedItems: 0,
      pushedItems: 0,
      totalValue: 0,
      totalCost: 0,
      categoryBreakdown: {},
      gradeBreakdown: {}
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