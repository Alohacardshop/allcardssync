import { memo } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AspectRatio } from "@/components/ui/aspect-ratio"
import { Skeleton } from "@/components/ui/skeleton"
import { Eye, Package, DollarSign, Calendar, ExternalLink, MoreHorizontal } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export interface CardData {
  id: string
  name: string
  set?: string
  game?: string
  number?: string
  rarity?: 'common' | 'uncommon' | 'rare' | 'mythic' | 'special'
  condition?: 'mint' | 'near-mint' | 'excellent' | 'good' | 'played' | 'poor'
  price?: number
  cost?: number
  quantity?: number
  imageUrl?: string
  createdAt?: string
  status?: 'in-stock' | 'low-stock' | 'out-of-stock'
  grade?: string
  gradingCompany?: string
  certNumber?: string
}

interface CardPreviewProps {
  card: CardData
  variant?: 'default' | 'compact' | 'detailed'
  selectable?: boolean
  selected?: boolean
  onSelect?: (selected: boolean) => void
  onView?: () => void
  onEdit?: () => void
  onPrint?: () => void
  className?: string
}

export const CardPreview = memo<CardPreviewProps>(({
  card,
  variant = 'default',
  selectable = false,
  selected = false,
  onSelect,
  onView,
  onEdit,
  onPrint,
  className
}) => {
  const getConditionColor = (condition?: string) => {
    switch (condition?.toLowerCase()) {
      case 'mint': return 'condition-mint'
      case 'near-mint': return 'condition-near-mint'
      case 'excellent': return 'condition-excellent'
      case 'good': return 'condition-good'
      case 'played': return 'condition-played'
      case 'poor': return 'condition-poor'
      default: return 'text-muted-foreground'
    }
  }

  const getRarityColor = (rarity?: string) => {
    switch (rarity?.toLowerCase()) {
      case 'common': return 'rarity-common'
      case 'uncommon': return 'rarity-uncommon'
      case 'rare': return 'rarity-rare'
      case 'mythic': return 'rarity-mythic'
      case 'special': return 'rarity-special'
      default: return 'text-muted-foreground'
    }
  }

  const getStatusColor = (status?: string, quantity?: number) => {
    if (quantity === 0 || status === 'out-of-stock') return 'status-error'
    if (quantity && quantity <= 3 || status === 'low-stock') return 'status-warning'
    return 'status-success'
  }

  if (variant === 'compact') {
    return (
      <Card className={cn(
        "transition-smooth interactive-hover border-2",
        selected && "border-primary shadow-focus",
        className
      )}>
        <CardContent className="p-4">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <AspectRatio ratio={3/4} className="w-12">
                {card.imageUrl ? (
                  <img
                    src={card.imageUrl}
                    alt={card.name}
                    className="rounded object-cover w-full h-full"
                  />
                ) : (
                  <div className="rounded bg-muted flex items-center justify-center w-full h-full">
                    <Package className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
              </AspectRatio>
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm truncate">{card.name}</h4>
                  {card.set && (
                    <p className="text-xs text-muted-foreground truncate">{card.set}</p>
                  )}
                  <div className="flex items-center space-x-2 mt-1">
                    {card.condition && (
                      <Badge variant="outline" className={cn("text-2xs", getConditionColor(card.condition))}>
                        {card.condition}
                      </Badge>
                    )}
                    {card.rarity && (
                      <Badge variant="outline" className={cn("text-2xs", getRarityColor(card.rarity))}>
                        {card.rarity}
                      </Badge>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center space-x-1 ml-2">
                  {card.quantity !== undefined && (
                    <Badge variant="outline" className={cn("text-2xs", getStatusColor(card.status, card.quantity))}>
                      Qty: {card.quantity}
                    </Badge>
                  )}
                  {card.price && (
                    <span className="text-sm font-medium">${card.price.toFixed(2)}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn(
      "transition-smooth interactive-hover border-2 group",
      selected && "border-primary shadow-focus",
      className
    )}>
      <CardContent className="p-0">
        {/* Card Image */}
        <div className="relative">
          <AspectRatio ratio={3/4}>
            {card.imageUrl ? (
              <img
                src={card.imageUrl}
                alt={card.name}
                className="rounded-t-lg object-cover w-full h-full"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                  e.currentTarget.nextElementSibling?.classList.remove('hidden')
                }}
              />
            ) : null}
            <div className={cn(
              "rounded-t-lg bg-muted flex items-center justify-center w-full h-full",
              card.imageUrl && "hidden"
            )}>
              <Package className="h-12 w-12 text-muted-foreground" />
            </div>
          </AspectRatio>

          {/* Selection checkbox */}
          {selectable && (
            <div className="absolute top-2 left-2">
              <input
                type="checkbox"
                checked={selected}
                onChange={(e) => onSelect?.(e.target.checked)}
                className="h-4 w-4 rounded border-border focus:ring-2 focus:ring-primary"
              />
            </div>
          )}

          {/* Status indicator */}
          {card.quantity !== undefined && (
            <div className="absolute top-2 right-2">
              <Badge className={cn("text-2xs", getStatusColor(card.status, card.quantity))}>
                {card.quantity === 0 ? 'Out' : card.quantity <= 3 ? 'Low' : 'In Stock'}
              </Badge>
            </div>
          )}

          {/* Grade badge */}
          {card.grade && card.gradingCompany && (
            <div className="absolute bottom-2 left-2">
              <Badge variant="secondary" className="text-2xs font-bold">
                {card.gradingCompany} {card.grade}
              </Badge>
            </div>
          )}
        </div>

        {/* Card Details */}
        <div className="p-4 space-y-3">
          <div>
            <h3 className="font-semibold text-sm leading-tight line-clamp-2">{card.name}</h3>
            {card.set && (
              <p className="text-xs text-muted-foreground mt-1">{card.set}</p>
            )}
            {card.number && (
              <p className="text-xs text-muted-foreground">#{card.number}</p>
            )}
          </div>

          {/* Condition and Rarity */}
          <div className="flex items-center space-x-2">
            {card.condition && (
              <Badge variant="outline" className={cn("text-2xs", getConditionColor(card.condition))}>
                {card.condition}
              </Badge>
            )}
            {card.rarity && (
              <Badge variant="outline" className={cn("text-2xs", getRarityColor(card.rarity))}>
                {card.rarity}
              </Badge>
            )}
          </div>

          {/* Price and Actions */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              {card.price && (
                <div className="flex items-center space-x-1">
                  <DollarSign className="h-3 w-3 text-muted-foreground" />
                  <span className="text-sm font-semibold">${card.price.toFixed(2)}</span>
                </div>
              )}
              {card.quantity !== undefined && (
                <div className="flex items-center space-x-1">
                  <Package className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Qty: {card.quantity}</span>
                </div>
              )}
            </div>

            <div className="flex items-center space-x-1">
              {onView && (
                <Button variant="ghost" size="sm" onClick={onView}>
                  <Eye className="h-4 w-4" />
                </Button>
              )}
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onView && (
                    <DropdownMenuItem onClick={onView}>
                      <Eye className="h-4 w-4 mr-2" />
                      View Details
                    </DropdownMenuItem>
                  )}
                  {onEdit && (
                    <DropdownMenuItem onClick={onEdit}>
                      <Package className="h-4 w-4 mr-2" />
                      Edit Item
                    </DropdownMenuItem>
                  )}
                  {onPrint && (
                    <DropdownMenuItem onClick={onPrint}>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Print Label
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {card.createdAt && (
            <div className="flex items-center space-x-1 pt-2 border-t">
              <Calendar className="h-3 w-3 text-muted-foreground" />
              <span className="text-2xs text-muted-foreground">
                Added {new Date(card.createdAt).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
})

CardPreview.displayName = "CardPreview"

export const CardPreviewSkeleton = () => (
  <Card>
    <CardContent className="p-0">
      <AspectRatio ratio={3/4}>
        <Skeleton className="w-full h-full rounded-t-lg" />
      </AspectRatio>
      <div className="p-4 space-y-3">
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <div className="flex space-x-2">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-12" />
        </div>
        <div className="flex justify-between items-center">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-8 w-8 rounded" />
        </div>
      </div>
    </CardContent>
  </Card>
)