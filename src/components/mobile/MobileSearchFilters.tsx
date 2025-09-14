import { useState } from "react"
import { Search, Filter, X, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { 
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { 
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"

interface FilterSection {
  id: string
  title: string
  type: 'select' | 'checkbox' | 'range'
  options?: Array<{ value: string; label: string; count?: number }>
  min?: number
  max?: number
}

interface MobileSearchFiltersProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  filters: FilterSection[]
  activeFilters: Record<string, any>
  onFilterChange: (filterId: string, value: any) => void
  onClearFilters: () => void
}

export function MobileSearchFilters({
  searchQuery,
  onSearchChange,
  filters,
  activeFilters,
  onFilterChange,
  onClearFilters
}: MobileSearchFiltersProps) {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set())

  const activeFilterCount = Object.keys(activeFilters).filter(
    key => activeFilters[key] && 
    (Array.isArray(activeFilters[key]) ? activeFilters[key].length > 0 : true)
  ).length

  const toggleSection = (sectionId: string) => {
    const newOpen = new Set(openSections)
    if (newOpen.has(sectionId)) {
      newOpen.delete(sectionId)
    } else {
      newOpen.add(sectionId)
    }
    setOpenSections(newOpen)
  }

  const renderFilter = (filter: FilterSection) => {
    switch (filter.type) {
      case 'select':
        return (
          <Select
            value={activeFilters[filter.id] || ""}
            onValueChange={(value) => onFilterChange(filter.id, value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={`Select ${filter.title.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {filter.options?.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <div className="flex items-center justify-between w-full">
                    <span>{option.label}</span>
                    {option.count && (
                      <span className="text-xs text-muted-foreground ml-2">
                        ({option.count})
                      </span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )

      case 'checkbox':
        const checkedValues = activeFilters[filter.id] || []
        return (
          <div className="space-y-3 max-h-48 overflow-y-auto">
            {filter.options?.map((option) => (
              <div key={option.value} className="flex items-center space-x-2">
                <Checkbox
                  id={`${filter.id}-${option.value}`}
                  checked={checkedValues.includes(option.value)}
                  onCheckedChange={(checked) => {
                    const newValues = checked
                      ? [...checkedValues, option.value]
                      : checkedValues.filter((v: string) => v !== option.value)
                    onFilterChange(filter.id, newValues)
                  }}
                />
                <label
                  htmlFor={`${filter.id}-${option.value}`}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex-1 flex items-center justify-between cursor-pointer"
                >
                  <span>{option.label}</span>
                  {option.count && (
                    <span className="text-xs text-muted-foreground">
                      ({option.count})
                    </span>
                  )}
                </label>
              </div>
            ))}
          </div>
        )

      case 'range':
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Min</label>
                <Input
                  type="number"
                  placeholder="0"
                  min={filter.min}
                  max={filter.max}
                  value={activeFilters[filter.id]?.min || ""}
                  onChange={(e) => onFilterChange(filter.id, {
                    ...activeFilters[filter.id],
                    min: e.target.value
                  })}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Max</label>
                <Input
                  type="number"
                  placeholder="999"
                  min={filter.min}
                  max={filter.max}
                  value={activeFilters[filter.id]?.max || ""}
                  onChange={(e) => onFilterChange(filter.id, {
                    ...activeFilters[filter.id],
                    max: e.target.value
                  })}
                />
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search inventory..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10 pr-10"
        />
        {searchQuery && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSearchChange("")}
            className="absolute right-1 top-1 h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Filter Button & Active Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filters
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-2">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[80vh]">
            <SheetHeader className="mb-6">
              <SheetTitle>Filter Results</SheetTitle>
              <SheetDescription>
                Narrow down your search with these filters
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-6 overflow-y-auto max-h-[calc(80vh-120px)] pb-6">
              {filters.map((filter) => (
                <Collapsible
                  key={filter.id}
                  open={openSections.has(filter.id)}
                  onOpenChange={() => toggleSection(filter.id)}
                >
                  <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{filter.title}</span>
                      {activeFilters[filter.id] && (
                        <Badge variant="secondary" className="h-5 px-2 text-xs">
                          Active
                        </Badge>
                      )}
                    </div>
                    <ChevronDown className={`h-4 w-4 transition-transform ${
                      openSections.has(filter.id) ? 'rotate-180' : ''
                    }`} />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="px-3 pt-3">
                    {renderFilter(filter)}
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>

            {/* Clear Filters */}
            {activeFilterCount > 0 && (
              <div className="absolute bottom-6 left-6 right-6">
                <Button
                  variant="outline"
                  onClick={onClearFilters}
                  className="w-full"
                >
                  Clear All Filters
                </Button>
              </div>
            )}
          </SheetContent>
        </Sheet>

        {/* Active Filter Pills */}
        {Object.entries(activeFilters).map(([filterId, value]) => {
          if (!value || (Array.isArray(value) && value.length === 0)) return null
          
          const filter = filters.find(f => f.id === filterId)
          if (!filter) return null

          const getDisplayValue = () => {
            if (Array.isArray(value)) {
              return value.length === 1 ? value[0] : `${value.length} selected`
            }
            if (typeof value === 'object' && value.min !== undefined && value.max !== undefined) {
              return `$${value.min || 0} - $${value.max || '∞'}`
            }
            return value
          }

          return (
            <Badge
              key={filterId}
              variant="secondary"
              className="flex items-center gap-1 pr-1"
            >
              <span className="text-xs">
                {filter.title}: {getDisplayValue()}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onFilterChange(filterId, null)}
                className="h-4 w-4 p-0 hover:bg-transparent"
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          )
        })}
      </div>
    </div>
  )
}