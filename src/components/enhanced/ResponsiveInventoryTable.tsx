import { useState } from "react"
import { Download, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EnhancedInventoryTable } from "@/components/enhanced/EnhancedInventoryTable"
import { MobileInventoryCards } from "@/components/enhanced/MobileInventoryCards"
import { useIsMobile } from "@/hooks/use-mobile"

interface InventoryItem {
  id: string
  name: string
  set: string
  game: string
  condition: string
  quantity: number
  price: number
  lastUpdated: Date
  status: "in_stock" | "low_stock" | "out_of_stock"
  imageUrl?: string
  rarity: string
}

interface ResponsiveInventoryTableProps {
  data: InventoryItem[]
  onEdit?: (item: InventoryItem) => void
  onDelete?: (item: InventoryItem) => void
  onBulkAction?: (action: string, items: InventoryItem[]) => void
}

type TableDensity = "compact" | "comfortable" | "spacious"

export function ResponsiveInventoryTable({
  data,
  onEdit,
  onDelete,
  onBulkAction
}: ResponsiveInventoryTableProps) {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [density, setDensity] = useState<TableDensity>("comfortable")
  const isMobile = useIsMobile()

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedItems(new Set(data.map(item => item.id)))
    } else {
      setSelectedItems(new Set())
    }
  }

  const handleSelectItem = (itemId: string, checked: boolean) => {
    const newSelected = new Set(selectedItems)
    if (checked) {
      newSelected.add(itemId)
    } else {
      newSelected.delete(itemId)
    }
    setSelectedItems(newSelected)
  }

  const handleBulkAction = (action: string) => {
    const selectedItemsArray = data.filter(item => selectedItems.has(item.id))
    onBulkAction?.(action, selectedItemsArray)
    setSelectedItems(new Set())
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            Inventory 
            <span className="text-sm font-normal text-muted-foreground">
              ({data.length} items)
            </span>
          </CardTitle>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {!isMobile && (
              <Select value={density} onValueChange={(value: TableDensity) => setDensity(value)}>
                <SelectTrigger className="w-full sm:w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="compact">Compact</SelectItem>
                  <SelectItem value="comfortable">Comfortable</SelectItem>
                  <SelectItem value="spacious">Spacious</SelectItem>
                </SelectContent>
              </Select>
            )}
            
            <Button variant="outline" size="sm" className="w-full sm:w-auto">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            
            <Button size="sm" className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Add Item
            </Button>
          </div>
        </div>
        
        {selectedItems.size > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-primary/10 rounded-lg border">
            <span className="text-sm font-medium">
              {selectedItems.size} item{selectedItems.size === 1 ? '' : 's'} selected
            </span>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => handleBulkAction("edit")}>
                Edit Selected
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleBulkAction("delete")}>
                Delete Selected
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleBulkAction("export")}>
                Export Selected
              </Button>
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={() => setSelectedItems(new Set())}
                className="text-muted-foreground hover:text-foreground"
              >
                Clear Selection
              </Button>
            </div>
          </div>
        )}
      </CardHeader>
      
      <CardContent className="p-0">
        {isMobile ? (
          <div className="p-4">
            <MobileInventoryCards
              data={data}
              selectedItems={selectedItems}
              onSelectItem={handleSelectItem}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          </div>
        ) : (
          <EnhancedInventoryTable
            data={data}
            onEdit={onEdit}
            onDelete={onDelete}
            onBulkAction={onBulkAction}
          />
        )}
      </CardContent>
    </Card>
  )
}