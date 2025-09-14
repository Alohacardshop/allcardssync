import { memo, useState } from "react"
import { CardPreview, CardData, CardPreviewSkeleton } from "./CardPreview"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckSquare, Square, MoreHorizontal, Grid3X3, List, Filter } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

interface CardGridProps {
  cards: CardData[]
  loading?: boolean
  variant?: 'default' | 'compact'
  selectable?: boolean
  selectedCards?: string[]
  onSelectionChange?: (selectedIds: string[]) => void
  onCardView?: (card: CardData) => void
  onCardEdit?: (card: CardData) => void
  onCardPrint?: (card: CardData) => void
  onBulkAction?: (action: string, cardIds: string[]) => void
  className?: string
  emptyMessage?: string
  loadingCount?: number
}

export const CardGrid = memo<CardGridProps>(({
  cards,
  loading = false,
  variant = 'default',
  selectable = false,
  selectedCards = [],
  onSelectionChange,
  onCardView,
  onCardEdit,
  onCardPrint,
  onBulkAction,
  className,
  emptyMessage = "No cards found",
  loadingCount = 12
}) => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  const handleSelectAll = () => {
    if (selectedCards.length === cards.length) {
      onSelectionChange?.([])
    } else {
      onSelectionChange?.(cards.map(card => card.id))
    }
  }

  const handleCardSelect = (cardId: string, selected: boolean) => {
    if (selected) {
      onSelectionChange?.([...selectedCards, cardId])
    } else {
      onSelectionChange?.(selectedCards.filter(id => id !== cardId))
    }
  }

  const getBulkActions = () => [
    { label: 'Print Labels', action: 'print' },
    { label: 'Export to CSV', action: 'export' },
    { label: 'Send to Shopify', action: 'shopify' },
    { label: 'Add to Batch', action: 'batch' },
    { label: 'Delete Selected', action: 'delete', destructive: true },
  ]

  if (loading) {
    return (
      <div className={className}>
        {/* Loading Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <div className="h-6 w-24 bg-muted animate-pulse rounded" />
            <div className="h-5 w-16 bg-muted animate-pulse rounded" />
          </div>
          <div className="flex items-center space-x-2">
            <div className="h-9 w-20 bg-muted animate-pulse rounded" />
            <div className="h-9 w-9 bg-muted animate-pulse rounded" />
          </div>
        </div>

        {/* Loading Grid */}
        <div className={cn(
          variant === 'compact' ? 'card-grid-compact' : 'card-grid'
        )}>
          {Array.from({ length: loadingCount }).map((_, i) => (
            <CardPreviewSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  }

  if (cards.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-16", className)}>
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto bg-muted rounded-full flex items-center justify-center">
            <Grid3X3 className="w-8 h-8 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-lg font-medium">{emptyMessage}</h3>
            <p className="text-muted-foreground">Try adjusting your filters or search terms</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={className}>
      {/* Header with selection and view controls */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <h2 className="text-lg font-semibold">
            {cards.length} Card{cards.length !== 1 ? 's' : ''}
          </h2>
          
          {selectable && selectedCards.length > 0 && (
            <Badge variant="secondary" className="font-medium">
              {selectedCards.length} selected
            </Badge>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {/* Bulk Actions */}
          {selectable && selectedCards.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  Actions ({selectedCards.length})
                  <MoreHorizontal className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Bulk Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {getBulkActions().map((action) => (
                  <DropdownMenuItem
                    key={action.action}
                    onClick={() => onBulkAction?.(action.action, selectedCards)}
                    className={cn(action.destructive && "text-destructive")}
                  >
                    {action.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Select All */}
          {selectable && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelectAll}
              className="flex items-center space-x-2"
            >
              {selectedCards.length === cards.length ? (
                <CheckSquare className="h-4 w-4" />
              ) : (
                <Square className="h-4 w-4" />
              )}
              <span>All</span>
            </Button>
          )}

          {/* View Mode Toggle */}
          <div className="flex border rounded-md">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
              className="rounded-r-none"
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className="rounded-l-none"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Cards Grid/List */}
      <div className={cn(
        viewMode === 'grid' 
          ? (variant === 'compact' ? 'card-grid-compact' : 'card-grid')
          : 'space-y-2'
      )}>
        {cards.map((card) => (
          <CardPreview
            key={card.id}
            card={card}
            variant={viewMode === 'list' ? 'compact' : variant}
            selectable={selectable}
            selected={selectedCards.includes(card.id)}
            onSelect={(selected) => handleCardSelect(card.id, selected)}
            onView={() => onCardView?.(card)}
            onEdit={() => onCardEdit?.(card)}
            onPrint={() => onCardPrint?.(card)}
          />
        ))}
      </div>

      {/* Load More (if needed) */}
      {cards.length > 50 && (
        <div className="flex justify-center mt-8">
          <Button variant="outline">
            Load More Cards
          </Button>
        </div>
      )}
    </div>
  )
})

CardGrid.displayName = "CardGrid"