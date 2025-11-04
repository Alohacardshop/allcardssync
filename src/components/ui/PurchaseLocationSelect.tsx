import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { usePurchaseLocations } from '@/hooks/usePurchaseLocations';

interface PurchaseLocationSelectProps {
  value?: string;
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
  placeholder?: string;
}

export function PurchaseLocationSelect({
  value,
  onChange,
  label = 'Purchase Location',
  required = false,
  placeholder = 'Select where item was purchased',
}: PurchaseLocationSelectProps) {
  const { data: locations, isLoading } = usePurchaseLocations();

  return (
    <div className="space-y-2">
      <Label>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <Select value={value} onValueChange={onChange} disabled={isLoading}>
        <SelectTrigger>
          <SelectValue placeholder={isLoading ? 'Loading...' : placeholder} />
        </SelectTrigger>
        <SelectContent>
          {locations?.map((location) => (
            <SelectItem key={location.id} value={location.id}>
              {location.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
