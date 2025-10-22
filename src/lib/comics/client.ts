import { supabase } from '@/integrations/supabase/client';
import type { GcdSeries, GcdPublisher, GcdIssue, PagedResult } from "./types";

async function callGcdFunction<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const queryParams = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      queryParams.set(key, String(value));
    });
  }

  const { data, error } = await supabase.functions.invoke('gcd-search', {
    body: { path: `${path}?${queryParams.toString()}` }
  });

  if (error) {
    throw new Error(error.message || 'Failed to search GCD');
  }

  if (!data) {
    throw new Error('No response from GCD search');
  }

  if (data.error) {
    throw new Error(data.error);
  }

  return data as T;
}

export const ComicsAPI = {
  async searchSeries(q: string, page = 1): Promise<PagedResult<GcdSeries>> {
    const { data, error } = await supabase.functions.invoke('gcd-search', {
      body: { path: '/series', params: { q, page } }
    });

    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  },

  async searchPublishers(q: string, page = 1): Promise<PagedResult<GcdPublisher>> {
    const { data, error } = await supabase.functions.invoke('gcd-search', {
      body: { path: '/publishers', params: { q, page } }
    });

    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  },

  async getSeriesIssues(seriesId: number, page = 1): Promise<PagedResult<GcdIssue>> {
    const { data, error } = await supabase.functions.invoke('gcd-search', {
      body: { path: `/series/${seriesId}/issues`, params: { page } }
    });

    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  },

};
