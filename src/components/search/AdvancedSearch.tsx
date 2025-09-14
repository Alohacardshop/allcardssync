import { useState } from "react"
import { Search, SlidersHorizontal, X, Bookmark } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { GameSelector } from "./GameSelector"
import { SetSelector } from "./SetSelector"
import { ConditionFilter } from "./ConditionFilter"
import { PriceRangeFilter } from "./PriceRangeFilter"
import { DateRangeFilter } from "./DateRangeFilter"
import { FilterTags } from "./FilterTags"
import { SavedSearches } from "./SavedSearches"

export interface SearchFilters {
  query: string
  games: string[]
  sets: string[]
  conditions: string[]
  priceRange: [number, number]
  dateRange: [Date | null, Date | null]
  rarity: string[]
  inStock: boolean | null
}

interface AdvancedSearchProps {
  filters: SearchFilters
  onFiltersChange: (filters: SearchFilters) => void
  onSearch: () => void
  onReset: () => void
  isLoading?: boolean
}

export function AdvancedSearch({ 
  filters, 
  onFiltersChange, 
  onSearch, 
  onReset,
  isLoading = false 
}: AdvancedSearchProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  const updateFilters = (update: Partial<SearchFilters>) => {
    onFiltersChange({ ...filters, ...update })
  }

  const hasActiveFilters = () => {
    return (
      filters.query ||
      filters.games.length > 0 ||
      filters.sets.length > 0 ||
      filters.conditions.length > 0 ||
      filters.priceRange[0] > 0 ||
      filters.priceRange[1] < 10000 ||
      filters.dateRange[0] ||
      filters.dateRange[1] ||
      filters.rarity.length > 0 ||
      filters.inStock !== null
    )
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          Advanced Search
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Quick Search */}
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              placeholder="Search cards by name, set, or description..."
              value={filters.query}
              onChange={(e) => updateFilters({ query: e.target.value })}
              className="text-base"
            />
          </div>
          <Button onClick={onSearch} disabled={isLoading} className="px-8">
            {isLoading ? "Searching..." : "Search"}
          </Button>
        </div>

        {/* Filter Tags */}
        {hasActiveFilters() && (
          <FilterTags
            filters={filters}
            onRemoveFilter={(key, value) => {
              if (key === "query") {
                updateFilters({ query: "" })
              } else if (key === "games") {
                updateFilters({ games: filters.games.filter(g => g !== value) })
              } else if (key === "sets") {
                updateFilters({ sets: filters.sets.filter(s => s !== value) })
              } else if (key === "conditions") {
                updateFilters({ conditions: filters.conditions.filter(c => c !== value) })
              } else if (key === "rarity") {
                updateFilters({ rarity: filters.rarity.filter(r => r !== value) })
              }
            }}
            onClearAll={onReset}
          />
        )}

        {/* Advanced Filters Toggle */}
        <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              {showAdvanced ? "Hide" : "Show"} Advanced Filters
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-6 mt-6">
            {/* Game Selector */}
            <div>
              <Label className="text-sm font-medium">Games</Label>
              <GameSelector
                selectedGames={filters.games}
                onSelectionChange={(games) => updateFilters({ games })}
              />
            </div>

            {/* Set Selector */}
            <div>
              <Label className="text-sm font-medium">Sets</Label>
              <SetSelector
                selectedSets={filters.sets}
                onSelectionChange={(sets) => updateFilters({ sets })}
                gameFilters={filters.games}
              />
            </div>

            {/* Condition Filter */}
            <div>
              <Label className="text-sm font-medium">Condition</Label>
              <ConditionFilter
                selectedConditions={filters.conditions}
                onSelectionChange={(conditions) => updateFilters({ conditions })}
              />
            </div>

            {/* Price Range */}
            <div>
              <Label className="text-sm font-medium">Price Range</Label>
              <PriceRangeFilter
                value={filters.priceRange}
                onValueChange={(priceRange) => updateFilters({ priceRange })}
              />
            </div>

            {/* Date Range */}
            <div>
              <Label className="text-sm font-medium">Release Date</Label>
              <DateRangeFilter
                value={filters.dateRange}
                onValueChange={(dateRange) => updateFilters({ dateRange })}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-4 border-t">
              <Button onClick={onSearch} disabled={isLoading} className="flex-1">
                {isLoading ? "Searching..." : "Apply Filters"}
              </Button>
              <Button variant="outline" onClick={onReset}>
                <X className="h-4 w-4 mr-2" />
                Clear All
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Saved Searches */}
        <SavedSearches
          currentFilters={filters}
          onLoadSearch={(savedFilters) => onFiltersChange(savedFilters)}
        />
      </CardContent>
    </Card>
  )
}