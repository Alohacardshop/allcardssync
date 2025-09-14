import { useState } from "react"
import { 
  Package, 
  MoreHorizontal, 
  Check, 
  X, 
  Edit,
  Trash2,
  Send,
  Printer
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu"
import { CardPreview } from "@/components/trading-cards/CardPreview"
import { PriceDisplay } from "@/components/trading-cards/PriceDisplay"

interface BatchItem {
  id: string
  card_name?: string
  subject?: string
  brand_title?: string
  sku?: string
  set_name?: string
  card_number?: string
  quantity: number
  price: number
  lot_number: string
  processing_notes?: string
  printed_at?: string
  pushed_at?: string
  game?: string
  created_at: string
  category?: string
  catalog_snapshot?: any
}

interface MobileBatchPanelProps {
  items: BatchItem[]
  selectedItems: Set<string>
  onSelectItem: (itemId: string, checked: boolean) => void
  onSelectAll: (checked: boolean) => void
  onBulkAction: (action: string, itemIds: string[]) => void
  loading?: boolean
}

export function MobileBatchPanel({
  items,
  selectedItems,
  onSelectItem,
  onSelectAll,
  onBulkAction,
  loading = false
}: MobileBatchPanelProps) {
  const [swipedItem, setSwipedItem] = useState<string | null>(null)

  const handleSwipeStart = (e: React.TouchEvent, itemId: string) => {
    const touch = e.touches[0]
    const card = e.currentTarget as HTMLElement
    card.dataset.startX = touch.clientX.toString()
    card.dataset.startY = touch.clientY.toString()
  }

  const handleSwipeMove = (e: React.TouchEvent, itemId: string) => {
    const touch = e.touches[0]
    const card = e.currentTarget as HTMLElement
    const startX = parseInt(card.dataset.startX || "0")
    
    const deltaX = touch.clientX - startX
    
    if (Math.abs(deltaX) > 50) {
      card.style.transform = `translateX(${deltaX * 0.3}px)`
      
      if (deltaX > 100) {
        card.style.backgroundColor = "hsl(var(--success) / 0.1)"
      } else if (deltaX < -100) {
        card.style.backgroundColor = "hsl(var(--destructive) / 0.1)"
      }
    }
  }

  const handleSwipeEnd = (e: React.TouchEvent, itemId: string) => {
    const touch = e.changedTouches[0]
    const card = e.currentTarget as HTMLElement
    const startX = parseInt(card.dataset.startX || "0")
    
    const deltaX = touch.clientX - startX
    
    // Reset visual state
    card.style.transform = ""
    card.style.backgroundColor = ""
    
    // Execute action based on swipe
    if (deltaX > 150) {
      // Swipe right - Send to inventory
      onBulkAction('inventory', [itemId])
    } else if (deltaX < -150) {
      // Swipe left - Delete
      onBulkAction('delete', [itemId])
    }
  }

  const getCardName = (item: BatchItem) => {
    return item.card_name || item.subject || item.brand_title || 'Unknown Card'
  }

  const getCardSet = (item: BatchItem) => {
    return item.set_name || item.catalog_snapshot?.set || 'Unknown Set'
  }

  const getBadgeStatus = (item: BatchItem) => {
    if (item.pushed_at) return { label: 'Pushed', variant: 'default' as const }
    if (item.printed_at) return { label: 'Printed', variant: 'secondary' as const }
    return { label: 'Pending', variant: 'outline' as const }
  }

  const allSelected = items.length > 0 && selectedItems.size === items.length

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Current Batch
            <span className="text-sm font-normal text-muted-foreground">
              ({items.length})
            </span>
          </CardTitle>
        </div>

        {/* Bulk Actions */}
        {selectedItems.size > 0 && (
          <div className="flex flex-col gap-3 p-3 bg-primary/10 rounded-lg border">
            <div className="text-sm font-medium">
              {selectedItems.size} item{selectedItems.size === 1 ? '' : 's'} selected
            </div>
            <div className="flex flex-wrap gap-2">
              <Button 
                size="sm" 
                onClick={() => onBulkAction('inventory', Array.from(selectedItems))}
                className="flex items-center gap-1"
              >
                <Send className="h-3 w-3" />
                Send to Inventory
              </Button>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => onBulkAction('print', Array.from(selectedItems))}
                className="flex items-center gap-1"
              >
                <Printer className="h-3 w-3" />
                Print Labels
              </Button>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => onBulkAction('delete', Array.from(selectedItems))}
                className="flex items-center gap-1"
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </Button>
            </div>
          </div>
        )}

        {/* Select All */}
        {items.length > 0 && (
          <div className="flex items-center gap-2">
            <Checkbox
              checked={allSelected}
              onCheckedChange={onSelectAll}
            />
            <span className="text-sm text-muted-foreground">
              Select all items
            </span>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-4 space-y-3">
        {items.length === 0 ? (
          <div className="text-center py-8">
            <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No items in batch</h3>
            <p className="text-muted-foreground">
              Add some cards using the tabs above
            </p>
          </div>
        ) : (
          items.map((item) => {
            const cardName = getCardName(item)
            const cardSet = getCardSet(item)
            const status = getBadgeStatus(item)

            return (
              <Card 
                key={item.id}
                className={`transition-all duration-200 ${
                  selectedItems.has(item.id) 
                    ? 'ring-2 ring-primary ring-offset-2' 
                    : 'hover:shadow-md'
                }`}
                onTouchStart={(e) => handleSwipeStart(e, item.id)}
                onTouchMove={(e) => handleSwipeMove(e, item.id)}
                onTouchEnd={(e) => handleSwipeEnd(e, item.id)}
              >
                <CardContent className="p-4">
                  {/* Header */}
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
                          name: cardName,
                          set: cardSet,
                          rarity: "common",
                          game: item.game || item.catalog_snapshot?.game || "pokemon"
                        }}
                        variant="compact"
                      />
                    </div>
                    <Badge variant={status.variant}>
                      {status.label}
                    </Badge>
                  </div>

                  {/* Details Grid */}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Quantity</div>
                      <div className="font-medium">{item.quantity}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Price</div>
                      <PriceDisplay price={item.price} />
                    </div>
                    {item.sku && (
                      <>
                        <div className="col-span-2">
                          <div className="text-xs text-muted-foreground mb-1">SKU</div>
                          <div className="font-mono text-sm">{item.sku}</div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-3 border-t text-xs text-muted-foreground">
                    <div>Lot: {item.lot_number}</div>
                    <div>{new Date(item.created_at).toLocaleDateString()}</div>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}

        {/* Swipe Instructions */}
        {items.length > 0 && (
          <div className="text-center py-4">
            <p className="text-xs text-muted-foreground">
              💡 Swipe right to send to inventory, left to delete
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}