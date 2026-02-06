import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CategoryCount {
  category: string;
  count: number;
}

// Define category groupings for organized display
const CATEGORY_GROUPS: Record<string, string[]> = {
  'TCG': ['Pokemon', 'Lorcana', 'One Piece', 'Magic', 'Yu-Gi-Oh', 'TCG Cards', 'Star Wars Unlimited', 'Star Wars'],
  'Sports': ['BASEBALL CARDS', 'BASKETBALL CARDS', 'FOOTBALL CARDS', 'HOCKEY CARDS', 'SOCCER CARDS', 'UFC CARDS', 'WRESTLING CARDS', 'GOLF CARDS', 'RACING CARDS'],
  'Other': [], // Catch-all for uncategorized
};

export interface GroupedCategories {
  group: string;
  categories: CategoryCount[];
}

/**
 * Assigns a category to a display group based on known groupings
 */
function getGroupForCategory(category: string): string {
  const upperCategory = category.toUpperCase();
  
  for (const [group, keywords] of Object.entries(CATEGORY_GROUPS)) {
    if (group === 'Other') continue;
    
    for (const keyword of keywords) {
      if (upperCategory.includes(keyword.toUpperCase())) {
        return group;
      }
    }
  }
  
  return 'Other';
}

/**
 * Groups categories into display groups (TCG, Sports, Other)
 */
export function groupCategories(categories: CategoryCount[]): GroupedCategories[] {
  const groups: Record<string, CategoryCount[]> = {
    'TCG': [],
    'Sports': [],
    'Other': [],
  };

  for (const cat of categories) {
    const group = getGroupForCategory(cat.category);
    groups[group].push(cat);
  }

  // Sort each group by count descending
  for (const group of Object.keys(groups)) {
    groups[group].sort((a, b) => b.count - a.count);
  }

  // Return only non-empty groups in order
  return ['TCG', 'Sports', 'Other']
    .map(group => ({ group, categories: groups[group] }))
    .filter(g => g.categories.length > 0);
}

/**
 * Hook to fetch available categories with counts from intake_items
 */
export function useCategoryFilter(storeKey: string | null) {
  return useQuery({
    queryKey: ['category-filter', storeKey],
    queryFn: async () => {
      if (!storeKey) return [];

      // Query distinct categories with counts
      // Exclude null/empty categories, deleted items, and get active items only
      const { data, error } = await supabase
        .from('intake_items')
        .select('category')
        .eq('store_key', storeKey)
        .is('deleted_at', null)
        .not('category', 'is', null)
        .not('category', 'eq', '');

      if (error) {
        console.error('Error fetching categories:', error);
        throw error;
      }

      // Aggregate counts client-side (more efficient than multiple RPC calls)
      const countMap = new Map<string, number>();
      for (const row of data || []) {
        if (row.category) {
          const cat = row.category.trim();
          countMap.set(cat, (countMap.get(cat) || 0) + 1);
        }
      }

      // Convert to array and sort by count
      const categories: CategoryCount[] = Array.from(countMap.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count);

      return categories;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    enabled: Boolean(storeKey),
  });
}
