import { useState, useEffect } from "react"
import { Bookmark, BookmarkCheck, Trash2, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { SearchFilters } from "./AdvancedSearch"
import { useToast } from "@/hooks/use-toast"

interface SavedSearch {
  id: string
  name: string
  filters: SearchFilters
  createdAt: Date
  lastUsed?: Date
  useCount: number
}

interface SavedSearchesProps {
  currentFilters: SearchFilters
  onLoadSearch: (filters: SearchFilters) => void
}

export function SavedSearches({ currentFilters, onLoadSearch }: SavedSearchesProps) {
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([])
  const [isExpanded, setIsExpanded] = useState(false)
  const [newSearchName, setNewSearchName] = useState("")
  const [isNaming, setIsNaming] = useState(false)
  const { toast } = useToast()

  // Load saved searches from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("saved-searches")
    if (saved) {
      try {
        const parsed = JSON.parse(saved).map((search: any) => ({
          ...search,
          createdAt: new Date(search.createdAt),
          lastUsed: search.lastUsed ? new Date(search.lastUsed) : undefined,
          filters: {
            ...search.filters,
            dateRange: [
              search.filters.dateRange[0] ? new Date(search.filters.dateRange[0]) : null,
              search.filters.dateRange[1] ? new Date(search.filters.dateRange[1]) : null
            ]
          }
        }))
        setSavedSearches(parsed)
      } catch (error) {
        console.error("Error loading saved searches:", error)
      }
    }
  }, [])

  // Save to localStorage whenever savedSearches changes
  useEffect(() => {
    localStorage.setItem("saved-searches", JSON.stringify(savedSearches))
  }, [savedSearches])

  const hasActiveFilters = () => {
    return (
      currentFilters.query ||
      currentFilters.games.length > 0 ||
      currentFilters.sets.length > 0 ||
      currentFilters.conditions.length > 0 ||
      currentFilters.priceRange[0] > 0 ||
      currentFilters.priceRange[1] < 10000 ||
      currentFilters.dateRange[0] ||
      currentFilters.dateRange[1] ||
      currentFilters.rarity.length > 0 ||
      currentFilters.inStock !== null
    )
  }

  const saveCurrentSearch = () => {
    if (!hasActiveFilters()) {
      toast({
        title: "No filters to save",
        description: "Please apply some filters before saving a search.",
        variant: "destructive"
      })
      return
    }

    if (!newSearchName.trim()) {
      toast({
        title: "Please enter a name",
        description: "Enter a name for your saved search.",
        variant: "destructive"
      })
      return
    }

    const newSearch: SavedSearch = {
      id: Date.now().toString(),
      name: newSearchName.trim(),
      filters: currentFilters,
      createdAt: new Date(),
      useCount: 0
    }

    setSavedSearches(prev => [newSearch, ...prev].slice(0, 10)) // Keep max 10 searches
    setNewSearchName("")
    setIsNaming(false)
    
    toast({
      title: "Search saved",
      description: `"${newSearch.name}" has been saved to your searches.`
    })
  }

  const loadSearch = (search: SavedSearch) => {
    // Update usage stats
    setSavedSearches(prev => prev.map(s => 
      s.id === search.id 
        ? { ...s, lastUsed: new Date(), useCount: s.useCount + 1 }
        : s
    ))
    
    onLoadSearch(search.filters)
    
    toast({
      title: "Search loaded",
      description: `"${search.name}" filters have been applied.`
    })
  }

  const deleteSearch = (searchId: string) => {
    setSavedSearches(prev => prev.filter(s => s.id !== searchId))
    toast({
      title: "Search deleted",
      description: "The saved search has been removed."
    })
  }

  const getFilterSummary = (filters: SearchFilters) => {
    const parts: string[] = []
    
    if (filters.query) parts.push(`"${filters.query}"`)
    if (filters.games.length > 0) parts.push(`${filters.games.length} games`)
    if (filters.sets.length > 0) parts.push(`${filters.sets.length} sets`)
    if (filters.conditions.length > 0) parts.push(`${filters.conditions.length} conditions`)
    if (filters.priceRange[0] > 0 || filters.priceRange[1] < 10000) parts.push("price range")
    if (filters.dateRange[0] || filters.dateRange[1]) parts.push("date range")
    if (filters.rarity.length > 0) parts.push(`${filters.rarity.length} rarities`)
    
    return parts.length > 0 ? parts.join(", ") : "All cards"
  }

  const sortedSearches = [...savedSearches].sort((a, b) => {
    // Sort by last used (most recent first), then by use count, then by creation date
    if (a.lastUsed && b.lastUsed) {
      return b.lastUsed.getTime() - a.lastUsed.getTime()
    }
    if (a.lastUsed && !b.lastUsed) return -1
    if (!a.lastUsed && b.lastUsed) return 1
    
    if (a.useCount !== b.useCount) {
      return b.useCount - a.useCount
    }
    
    return b.createdAt.getTime() - a.createdAt.getTime()
  })

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className="flex items-center justify-between">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="flex items-center gap-2 text-sm">
            <Bookmark className="h-4 w-4" />
            Saved Searches ({savedSearches.length})
          </Button>
        </CollapsibleTrigger>
        
        {hasActiveFilters() && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsNaming(!isNaming)}
            className="text-primary"
          >
            <BookmarkCheck className="h-4 w-4 mr-1" />
            Save Current
          </Button>
        )}
      </div>

      <CollapsibleContent className="space-y-4 mt-4">
        {/* Save New Search */}
        {isNaming && (
          <Card>
            <CardContent className="p-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Enter search name..."
                  value={newSearchName}
                  onChange={(e) => setNewSearchName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveCurrentSearch()
                    if (e.key === "Escape") setIsNaming(false)
                  }}
                  className="flex-1"
                />
                <Button onClick={saveCurrentSearch} size="sm">
                  Save
                </Button>
                <Button variant="ghost" onClick={() => setIsNaming(false)} size="sm">
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Saved Searches List */}
        {sortedSearches.length > 0 ? (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {sortedSearches.map((search) => (
              <Card key={search.id} className="hover:bg-muted/50 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => loadSearch(search)}>
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium truncate">{search.name}</h4>
                        {search.useCount > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            Used {search.useCount}x
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {getFilterSummary(search.filters)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Saved {search.createdAt.toLocaleDateString()}
                        {search.lastUsed && ` • Last used ${search.lastUsed.toLocaleDateString()}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => loadSearch(search)}
                        className="h-8 w-8 p-0"
                      >
                        <Search className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteSearch(search.id)}
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center">
              <Bookmark className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h4 className="font-medium mb-2">No saved searches yet</h4>
              <p className="text-sm text-muted-foreground">
                Apply some filters and save them for quick access later.
              </p>
            </CardContent>
          </Card>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}