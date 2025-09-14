import { useState, useEffect } from "react"
import { Search, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

// Mock sets data - in real app this would come from your database
const MOCK_SETS = [
  // MTG Sets
  { id: "ltr", name: "The Lord of the Rings: Tales of Middle-earth", game: "mtg", releaseDate: "2023-06-23", recent: true },
  { id: "mom", name: "March of the Machine", game: "mtg", releaseDate: "2023-04-21", recent: true },
  { id: "one", name: "Phyrexia: All Will Be One", game: "mtg", releaseDate: "2023-02-10", recent: true },
  { id: "bro", name: "The Brothers' War", game: "mtg", releaseDate: "2022-11-18", recent: false },
  { id: "dmu", name: "Dominaria United", game: "mtg", releaseDate: "2022-09-09", recent: false },
  
  // Pokemon Sets
  { id: "pgo", name: "Pokémon GO", game: "pokemon-en", releaseDate: "2022-07-01", recent: true },
  { id: "ast", name: "Astral Radiance", game: "pokemon-en", releaseDate: "2022-05-27", recent: true },
  { id: "brs", name: "Brilliant Stars", game: "pokemon-en", releaseDate: "2022-02-25", recent: false },
  { id: "swsh12", name: "Silver Tempest", game: "pokemon-en", releaseDate: "2022-11-11", recent: false },
  
  // Japanese Pokemon
  { id: "s12a", name: "VMAX Climax", game: "pokemon-jp", releaseDate: "2021-12-03", recent: true },
  { id: "s12", name: "Paradigm Trigger", game: "pokemon-jp", releaseDate: "2022-10-21", recent: true },
]

interface SetSelectorProps {
  selectedSets: string[]
  onSelectionChange: (sets: string[]) => void
  gameFilters?: string[]
}

export function SetSelector({ selectedSets, onSelectionChange, gameFilters = [] }: SetSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [recentSets] = useState<string[]>(["ltr", "mom", "one", "pgo", "ast", "s12a", "s12"])

  // Filter sets based on selected games and search query
  const filteredSets = MOCK_SETS.filter(set => {
    const matchesGame = gameFilters.length === 0 || gameFilters.includes(set.game)
    const matchesSearch = set.name.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesGame && matchesSearch
  })

  // Group sets
  const recentFilteredSets = filteredSets.filter(set => recentSets.includes(set.id))
  const otherSets = filteredSets.filter(set => !recentSets.includes(set.id))

  const handleSetToggle = (setId: string, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedSets, setId])
    } else {
      onSelectionChange(selectedSets.filter(id => id !== setId))
    }
  }

  const selectedCount = selectedSets.length
  const buttonText = selectedCount === 0 
    ? "Select sets..." 
    : selectedCount === 1 
    ? MOCK_SETS.find(s => s.id === selectedSets[0])?.name || "1 set"
    : `${selectedCount} sets selected`

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between">
          <div className="flex items-center gap-2 truncate">
            {buttonText}
            {selectedCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {selectedCount}
              </Badge>
            )}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="start">
        <div className="p-4 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search sets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Recent Sets */}
          {recentFilteredSets.length > 0 && (
            <div>
              <div className="text-sm font-medium mb-2 flex items-center gap-2">
                Recent Sets
                <Badge variant="outline" className="text-xs">
                  {recentFilteredSets.length}
                </Badge>
              </div>
              <ScrollArea className="h-32">
                <div className="space-y-2">
                  {recentFilteredSets.map((set) => (
                    <div key={set.id} className="flex items-center space-x-2 p-2 rounded hover:bg-muted/50">
                      <Checkbox
                        id={`recent-${set.id}`}
                        checked={selectedSets.includes(set.id)}
                        onCheckedChange={(checked) => handleSetToggle(set.id, checked as boolean)}
                      />
                      <div className="flex-1 min-w-0">
                        <label
                          htmlFor={`recent-${set.id}`}
                          className="text-sm font-medium cursor-pointer truncate block"
                        >
                          {set.name}
                        </label>
                        <p className="text-xs text-muted-foreground">
                          {new Date(set.releaseDate).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Separator */}
          {recentFilteredSets.length > 0 && otherSets.length > 0 && (
            <Separator />
          )}

          {/* All Sets */}
          {otherSets.length > 0 && (
            <div>
              <div className="text-sm font-medium mb-2 flex items-center gap-2">
                All Sets
                <Badge variant="outline" className="text-xs">
                  {otherSets.length}
                </Badge>
              </div>
              <ScrollArea className="h-48">
                <div className="space-y-2">
                  {otherSets.map((set) => (
                    <div key={set.id} className="flex items-center space-x-2 p-2 rounded hover:bg-muted/50">
                      <Checkbox
                        id={set.id}
                        checked={selectedSets.includes(set.id)}
                        onCheckedChange={(checked) => handleSetToggle(set.id, checked as boolean)}
                      />
                      <div className="flex-1 min-w-0">
                        <label
                          htmlFor={set.id}
                          className="text-sm font-medium cursor-pointer truncate block"
                        >
                          {set.name}
                        </label>
                        <p className="text-xs text-muted-foreground">
                          {new Date(set.releaseDate).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSelectionChange(filteredSets.map(s => s.id))}
              className="flex-1"
            >
              Select All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSelectionChange([])}
              className="flex-1"
            >
              Clear All
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}