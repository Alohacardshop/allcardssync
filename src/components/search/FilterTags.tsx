import { X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SearchFilters } from "./AdvancedSearch"

interface FilterTagsProps {
  filters: SearchFilters
  onRemoveFilter: (key: string, value?: string) => void
  onClearAll: () => void
}

export function FilterTags({ filters, onRemoveFilter, onClearAll }: FilterTagsProps) {
  const tags: Array<{ key: string; label: string; value?: string }> = []

  // Query tag
  if (filters.query) {
    tags.push({ key: "query", label: `"${filters.query}"` })
  }

  // Game tags
  filters.games.forEach(game => {
    tags.push({ key: "games", label: `Game: ${game}`, value: game })
  })

  // Set tags
  filters.sets.forEach(set => {
    tags.push({ key: "sets", label: `Set: ${set}`, value: set })
  })

  // Condition tags
  filters.conditions.forEach(condition => {
    tags.push({ key: "conditions", label: `Condition: ${condition}`, value: condition })
  })

  // Rarity tags
  filters.rarity.forEach(rarity => {
    tags.push({ key: "rarity", label: `Rarity: ${rarity}`, value: rarity })
  })

  // Price range tag
  if (filters.priceRange[0] > 0 || filters.priceRange[1] < 10000) {
    const minPrice = filters.priceRange[0] > 0 ? `$${filters.priceRange[0]}` : "$0"
    const maxPrice = filters.priceRange[1] < 10000 ? `$${filters.priceRange[1]}` : "∞"
    tags.push({ key: "priceRange", label: `Price: ${minPrice} - ${maxPrice}` })
  }

  // Date range tag
  if (filters.dateRange[0] || filters.dateRange[1]) {
    const startDate = filters.dateRange[0] ? filters.dateRange[0].toLocaleDateString() : "Any"
    const endDate = filters.dateRange[1] ? filters.dateRange[1].toLocaleDateString() : "Any"
    tags.push({ key: "dateRange", label: `Released: ${startDate} - ${endDate}` })
  }

  // In stock tag
  if (filters.inStock !== null) {
    tags.push({ key: "inStock", label: filters.inStock ? "In Stock" : "Out of Stock" })
  }

  if (tags.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2 p-4 bg-muted/50 rounded-lg border">
      <span className="text-sm font-medium text-muted-foreground">Active Filters:</span>
      
      {tags.map((tag, index) => (
        <Badge key={`${tag.key}-${index}`} variant="secondary" className="flex items-center gap-1">
          {tag.label}
          <Button
            variant="ghost"
            size="icon"
            className="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground"
            onClick={() => onRemoveFilter(tag.key, tag.value)}
          >
            <X className="h-3 w-3" />
          </Button>
        </Badge>
      ))}

      <Button
        variant="ghost"
        size="sm"
        onClick={onClearAll}
        className="ml-2 h-8 px-2 text-xs"
      >
        Clear All
      </Button>
    </div>
  )
}