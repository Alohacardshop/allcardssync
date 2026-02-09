import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface EbayCategorySelectProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  filterType?: string; // 'tcg' | 'sports' | 'comics' | 'other'
}

export function EbayCategorySelect({
  value,
  onValueChange,
  placeholder = 'Select eBay category...',
  disabled,
  filterType,
}: EbayCategorySelectProps) {
  const { data: categories, isLoading } = useQuery({
    queryKey: ['ebay-categories', filterType],
    queryFn: async () => {
      let query = supabase
        .from('ebay_categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

      if (filterType) {
        query = query.eq('item_type', filterType);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled || isLoading}>
      <SelectTrigger>
        <SelectValue placeholder={isLoading ? 'Loading...' : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {categories?.map((cat) => (
          <SelectItem key={cat.id} value={cat.id}>
            {cat.name} ({cat.id})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
