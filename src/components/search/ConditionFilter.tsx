import { useState } from "react"
import { Info } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"

const CONDITIONS = [
  {
    id: "mint",
    name: "Mint (M)",
    description: "Perfect condition, looks like it just came out of a pack",
    color: "bg-mint"
  },
  {
    id: "near-mint",
    name: "Near Mint (NM)",
    description: "Excellent condition with minimal wear",
    color: "bg-near-mint"
  },
  {
    id: "lightly-played",
    name: "Lightly Played (LP)",
    description: "Light wear visible but still in good condition",
    color: "bg-lightly-played"
  },
  {
    id: "moderately-played",
    name: "Moderately Played (MP)",
    description: "Moderate wear but still playable",
    color: "bg-moderately-played"
  },
  {
    id: "heavily-played",
    name: "Heavily Played (HP)",
    description: "Significant wear but card is intact",
    color: "bg-heavily-played"
  },
  {
    id: "damaged",
    name: "Damaged (DMG)",
    description: "Major damage, bends, creases, or other issues",
    color: "bg-damaged"
  }
]

interface ConditionFilterProps {
  selectedConditions: string[]
  onSelectionChange: (conditions: string[]) => void
}

export function ConditionFilter({ selectedConditions, onSelectionChange }: ConditionFilterProps) {
  const [showGuide, setShowGuide] = useState(false)

  const handleConditionToggle = (conditionId: string, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedConditions, conditionId])
    } else {
      onSelectionChange(selectedConditions.filter(id => id !== conditionId))
    }
  }

  const selectedCount = selectedConditions.length

  return (
    <div className="space-y-3">
      {/* Selected Conditions Display */}
      <div className="flex flex-wrap gap-2">
        {selectedCount === 0 && (
          <Badge variant="outline" className="text-muted-foreground">
            All Conditions
          </Badge>
        )}
        {CONDITIONS.filter(c => selectedConditions.includes(c.id)).map(condition => (
          <Badge key={condition.id} className={condition.color}>
            {condition.name}
          </Badge>
        ))}
      </div>

      {/* Condition Checkboxes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {CONDITIONS.map((condition) => (
          <div key={condition.id} className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-muted/50">
            <Checkbox
              id={condition.id}
              checked={selectedConditions.includes(condition.id)}
              onCheckedChange={(checked) => handleConditionToggle(condition.id, checked as boolean)}
            />
            <div className="flex-1">
              <label
                htmlFor={condition.id}
                className="text-sm font-medium cursor-pointer flex items-center gap-2"
              >
                <div className={`w-3 h-3 rounded-full ${condition.color}`} />
                {condition.name}
              </label>
              <p className="text-xs text-muted-foreground mt-1">
                {condition.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Condition Guide */}
      <div className="flex justify-between items-center pt-2">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSelectionChange(CONDITIONS.map(c => c.id))}
          >
            Select All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSelectionChange([])}
          >
            Clear All
          </Button>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              <Info className="h-4 w-4 mr-1" />
              Condition Guide
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-4">
            <div className="space-y-3">
              <h4 className="font-semibold">Card Condition Guide</h4>
              <div className="space-y-2 text-sm">
                <p><strong>Mint (M):</strong> Perfect condition, no visible wear</p>
                <p><strong>Near Mint (NM):</strong> Minimal wear, pack fresh appearance</p>
                <p><strong>Lightly Played (LP):</strong> Light surface wear or minor edge wear</p>
                <p><strong>Moderately Played (MP):</strong> Moderate surface wear, small creases</p>
                <p><strong>Heavily Played (HP):</strong> Major surface wear, creases, or scuffs</p>
                <p><strong>Damaged (DMG):</strong> Severe damage, major bends or tears</p>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}