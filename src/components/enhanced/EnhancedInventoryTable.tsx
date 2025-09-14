import { useState } from "react"
import { 
  ChevronUp, 
  ChevronDown, 
  MoreHorizontal, 
  Download, 
  Edit, 
  Trash2, 
  Eye,
  Check,
  X
} from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CardPreview } from "@/components/trading-cards/CardPreview"
import { StatusIndicator } from "@/components/trading-cards/StatusIndicator"
import { PriceDisplay } from "@/components/trading-cards/PriceDisplay"

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

interface EnhancedInventoryTableProps {
  data: InventoryItem[]
  onEdit?: (item: InventoryItem) => void
  onDelete?: (item: InventoryItem) => void
  onBulkAction?: (action: string, items: InventoryItem[]) => void
}

type SortField = keyof InventoryItem
type SortDirection = "asc" | "desc"
type TableDensity = "compact" | "comfortable" | "spacious"

const densityClasses = {
  compact: "py-2",
  comfortable: "py-3",
  spacious: "py-4"
}

export function EnhancedInventoryTable({
  data,
  onEdit,
  onDelete,
  onBulkAction
}: EnhancedInventoryTableProps) {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [sortField, setSortField] = useState<SortField>("name")
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc")
  const [density, setDensity] = useState<TableDensity>("comfortable")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<string>("")

  // Sort data
  const sortedData = [...data].sort((a, b) => {
    const aVal = a[sortField]
    const bVal = b[sortField]
    
    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortDirection === "asc" 
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal)
    }
    
    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortDirection === "asc" ? aVal - bVal : bVal - aVal
    }
    
    return 0
  })

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDirection("asc")
    }
  }

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

  const startInlineEdit = (itemId: string, field: string, currentValue: string) => {
    setEditingId(itemId)
    setEditingField(field)
    setEditValue(currentValue)
  }

  const saveInlineEdit = () => {
    // In a real app, this would save to your backend
    console.log("Save inline edit:", editingId, editingField, editValue)
    setEditingId(null)
    setEditingField(null)
    setEditValue("")
  }

  const cancelInlineEdit = () => {
    setEditingId(null)
    setEditingField(null)
    setEditValue("")
  }

  const SortableHeader = ({ field, children }: { field: SortField, children: React.ReactNode }) => (
    <TableHead 
      className="cursor-pointer hover:bg-muted/50 select-none"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortField === field && (
          sortDirection === "asc" ? 
          <ChevronUp className="h-4 w-4" /> : 
          <ChevronDown className="h-4 w-4" />
        )}
      </div>
    </TableHead>
  )

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Inventory ({data.length} items)</CardTitle>
          
          <div className="flex items-center gap-2">
            <Select value={density} onValueChange={(value: TableDensity) => setDensity(value)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="compact">Compact</SelectItem>
                <SelectItem value="comfortable">Comfortable</SelectItem>
                <SelectItem value="spacious">Spacious</SelectItem>
              </SelectContent>
            </Select>
            
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>
        
        {selectedItems.size > 0 && (
          <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-lg border">
            <span className="text-sm font-medium">
              {selectedItems.size} items selected
            </span>
            <div className="flex gap-1">
              <Button size="sm" onClick={() => handleBulkAction("edit")}>
                Edit
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleBulkAction("delete")}>
                Delete
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleBulkAction("export")}>
                Export
              </Button>
            </div>
          </div>
        )}
      </CardHeader>
      
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={selectedItems.size === data.length && data.length > 0}
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <SortableHeader field="name">Card</SortableHeader>
              <SortableHeader field="condition">Condition</SortableHeader>
              <SortableHeader field="quantity">Quantity</SortableHeader>
              <SortableHeader field="price">Price</SortableHeader>
              <SortableHeader field="status">Status</SortableHeader>
              <SortableHeader field="lastUpdated">Updated</SortableHeader>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((item) => (
              <TableRow key={item.id} className={`hover:bg-muted/50 ${densityClasses[density]}`}>
                <TableCell>
                  <Checkbox
                    checked={selectedItems.has(item.id)}
                    onCheckedChange={(checked) => handleSelectItem(item.id, checked as boolean)}
                  />
                </TableCell>
                
                <TableCell className="min-w-0">
                  <CardPreview
                    name={item.name}
                    set={item.set}
                    game={item.game}
                    rarity={item.rarity}
                    imageUrl={item.imageUrl}
                    layout="compact"
                  />
                </TableCell>
                
                <TableCell>
                  <Badge className="bg-near-mint text-near-mint-foreground">
                    {item.condition}
                  </Badge>
                </TableCell>
                
                <TableCell>
                  {editingId === item.id && editingField === "quantity" ? (
                    <div className="flex items-center gap-1">
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-20 h-8"
                        type="number"
                      />
                      <Button size="sm" variant="ghost" onClick={saveInlineEdit}>
                        <Check className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={cancelInlineEdit}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <span 
                      className="cursor-pointer hover:bg-muted/50 px-2 py-1 rounded"
                      onClick={() => startInlineEdit(item.id, "quantity", item.quantity.toString())}
                    >
                      {item.quantity}
                    </span>
                  )}
                </TableCell>
                
                <TableCell>
                  <PriceDisplay value={item.price} trend="neutral" />
                </TableCell>
                
                <TableCell>
                  <StatusIndicator status={item.status} />
                </TableCell>
                
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {item.lastUpdated.toLocaleDateString()}
                  </span>
                </TableCell>
                
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => console.log("View", item.id)}>
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onEdit?.(item)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDelete?.(item)}>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}