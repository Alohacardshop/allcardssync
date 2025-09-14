import { useState } from "react"
import { Check, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"

const GAMES = [
  {
    id: "mtg",
    name: "Magic: The Gathering",
    shortName: "MTG",
    icon: "⚡",
    description: "The original trading card game"
  },
  {
    id: "pokemon-en",
    name: "Pokémon (English)",
    shortName: "Pokemon EN",
    icon: "⚾",
    description: "English Pokémon cards"
  },
  {
    id: "pokemon-jp",
    name: "Pokémon (Japanese)",
    shortName: "Pokemon JP",
    icon: "🎌",
    description: "Japanese Pokémon cards"
  },
  {
    id: "yugioh",
    name: "Yu-Gi-Oh!",
    shortName: "YuGiOh",
    icon: "🃏",
    description: "Duel Monsters trading cards"
  },
  {
    id: "dragonball",
    name: "Dragon Ball Super",
    shortName: "DBS",
    icon: "🐉",
    description: "Dragon Ball trading cards"
  }
]

interface GameSelectorProps {
  selectedGames: string[]
  onSelectionChange: (games: string[]) => void
}

export function GameSelector({ selectedGames, onSelectionChange }: GameSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)

  const handleGameToggle = (gameId: string, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedGames, gameId])
    } else {
      onSelectionChange(selectedGames.filter(id => id !== gameId))
    }
  }

  const selectedCount = selectedGames.length
  const buttonText = selectedCount === 0 
    ? "Select games..." 
    : selectedCount === 1 
    ? GAMES.find(g => g.id === selectedGames[0])?.shortName || "1 game"
    : `${selectedCount} games selected`

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between">
          <div className="flex items-center gap-2">
            {buttonText}
            {selectedCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {selectedCount}
              </Badge>
            )}
          </div>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4" align="start">
        <div className="space-y-3">
          <div className="text-sm font-medium">Select Games</div>
          
          {GAMES.map((game) => (
            <div key={game.id} className="flex items-start space-x-3 p-2 rounded-lg hover:bg-muted/50">
              <Checkbox
                id={game.id}
                checked={selectedGames.includes(game.id)}
                onCheckedChange={(checked) => handleGameToggle(game.id, checked as boolean)}
                className="mt-1"
              />
              <div className="flex-1 space-y-1">
                <label
                  htmlFor={game.id}
                  className="flex items-center gap-2 text-sm font-medium leading-none cursor-pointer"
                >
                  <span className="text-lg">{game.icon}</span>
                  {game.name}
                </label>
                <p className="text-xs text-muted-foreground">{game.description}</p>
              </div>
            </div>
          ))}
          
          <div className="flex gap-2 pt-3 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSelectionChange(GAMES.map(g => g.id))}
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