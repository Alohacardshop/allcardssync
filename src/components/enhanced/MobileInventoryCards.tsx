import { useState } from "react"
import { 
  MoreHorizontal, 
  Edit, 
  Trash2, 
  Eye,
  Check,
  X,
  ChevronRight,
  Package
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu"
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

interface MobileInventoryCardsProps {
  data: InventoryItem[]
  selectedItems: Set<string>
  onSelectItem: (itemId: string, checked: boolean) => void
  onEdit?: (item: InventoryItem) => void
  onDelete?: (item: InventoryItem) => void
}

export function MobileInventoryCards({
  data,
  selectedItems,
  onSelectItem,
  onEdit,
  onDelete
}: MobileInventoryCardsProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<string>("")
  const [swipedItem, setSwipedItem] = useState<string | null>(null)

  const startInlineEdit = (itemId: string, field: string, currentValue: string) => {
    setEditingId(itemId)
    setEditingField(field)
    setEditValue(currentValue)
  }

  const saveInlineEdit = () => {
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

  // Swipe gesture handlers
  const handleTouchStart = (e: React.TouchEvent, itemId: string) => {
    const touch = e.touches[0]
    const card = e.currentTarget as HTMLElement
    card.dataset.startX = touch.clientX.toString()
    card.dataset.startY = touch.clientY.toString()
  }

  const handleTouchMove = (e: React.TouchEvent, itemId: string) => {
    const touch = e.touches[0]
    const card = e.currentTarget as HTMLElement
    const startX = parseInt(card.dataset.startX || "0")
    const startY = parseInt(card.dataset.startY || "0")
    
    const deltaX = touch.clientX - startX
    const deltaY = touch.clientY - startY
    
    // Only handle horizontal swipes
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      if (deltaX > 100) {
        // Swipe right - Edit
        card.style.transform = "translateX(20px)"
        card.style.backgroundColor = "hsl(var(--success) / 0.1)"
      } else if (deltaX < -100) {
        // Swipe left - Delete
        card.style.transform = "translateX(-20px)"
        card.style.backgroundColor = "hsl(var(--destructive) / 0.1)"
      }
    }
  }

  const handleTouchEnd = (e: React.TouchEvent, itemId: string) => {
    const touch = e.changedTouches[0]
    const card = e.currentTarget as HTMLElement
    const startX = parseInt(card.dataset.startX || "0")
    
    const deltaX = touch.clientX - startX
    
    // Reset visual state
    card.style.transform = ""
    card.style.backgroundColor = ""
    
    // Execute action based on swipe direction
    if (deltaX > 150) {
      // Swipe right - Edit
      const item = data.find(i => i.id === itemId)
      if (item) onEdit?.(item)
    } else if (deltaX < -150) {
      // Swipe left - Delete
      const item = data.find(i => i.id === itemId)
      if (item) onDelete?.(item)
    }
  }

  return (
    <div className="space-y-3">
      {data.length === 0 ? (
        <Card className="p-8 text-center">
          <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">No inventory items</h3>
          <p className="text-muted-foreground">Start by adding some cards to your inventory</p>
        </Card>
      ) : (
        data.map((item) => (
          <Card 
            key={item.id} 
            className={`transition-all duration-200 ${
              selectedItems.has(item.id) 
                ? 'ring-2 ring-primary ring-offset-2' 
                : 'hover:shadow-md'
            }`}
            onTouchStart={(e) => handleTouchStart(e, item.id)}
            onTouchMove={(e) => handleTouchMove(e, item.id)}
            onTouchEnd={(e) => handleTouchEnd(e, item.id)}
          >
            <CardContent className="p-4">
              {/* Header Row */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={selectedItems.has(item.id)}
                    onCheckedChange={(checked) => onSelectItem(item.id, checked as boolean)}
                    className="mt-1"
                  />
                      <CardPreview
                        card={{
                          id: item.id,
                          name: item.name,
                          set: item.set,
                          rarity: (item.rarity as "common" | "uncommon" | "rare" | "mythic" | "special") || "common",
                          game: item.game,
                          imageUrl: item.imageUrl
                        }}
                        variant="compact"
                      />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
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
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Condition</div>
                  <Badge className="bg-near-mint text-near-mint-foreground">
                    {item.condition}
                  </Badge>
                </div>
                
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Status</div>
                  <StatusIndicator status={item.status.replace('_', '-') as any} />
                </div>

                <div>
                  <div className="text-xs text-muted-foreground mb-1">Quantity</div>
                  {editingId === item.id && editingField === "quantity" ? (
                    <div className="flex items-center gap-1">
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-16 h-8 text-sm"
                        type="number"
                      />
                      <Button size="sm" variant="ghost" onClick={saveInlineEdit} className="h-6 w-6 p-0">
                        <Check className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={cancelInlineEdit} className="h-6 w-6 p-0">
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <button 
                      className="text-sm font-medium hover:bg-muted px-2 py-1 rounded transition-colors text-left"
                      onClick={() => startInlineEdit(item.id, "quantity", item.quantity.toString())}
                    >
                      {item.quantity}
                    </button>
                  )}
                </div>

                <div>
                  <div className="text-xs text-muted-foreground mb-1">Price</div>
                  <PriceDisplay price={item.price} />
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-3 border-t">
                <div className="text-xs text-muted-foreground">
                  Updated {item.lastUpdated.toLocaleDateString()}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        ))
      )}
      
      {/* Swipe instructions */}
      {data.length > 0 && (
        <div className="text-center py-4">
          <p className="text-xs text-muted-foreground">
            💡 Swipe cards left to delete, right to edit
          </p>
        </div>
      )}
    </div>
  )
}