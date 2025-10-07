import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface TransferItem {
  id: string;
  sku: string;
  brand_title: string;
  subject: string;
  card_number: string;
  quantity: number;
  shopify_location_gid: string;
}

interface TransferItemsListProps {
  items: TransferItem[];
  onRemove: (id: string) => void;
}

export function TransferItemsList({ items, onRemove }: TransferItemsListProps) {
  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <div className="font-medium">
                  {item.brand_title} {item.subject}
                </div>
                <div className="text-sm text-muted-foreground">
                  {item.card_number}
                </div>
              </TableCell>
              <TableCell className="font-mono text-sm">{item.sku}</TableCell>
              <TableCell className="text-right">{item.quantity}</TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemove(item.id)}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
