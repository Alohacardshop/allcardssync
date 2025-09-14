import { useState } from "react"
import { DollarSign } from "lucide-react"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

const PRESET_RANGES = [
  { label: "Under $1", value: [0, 1] },
  { label: "$1 - $5", value: [1, 5] },
  { label: "$5 - $10", value: [5, 10] },
  { label: "$10 - $25", value: [10, 25] },
  { label: "$25 - $50", value: [25, 50] },
  { label: "$50 - $100", value: [50, 100] },
  { label: "$100 - $500", value: [100, 500] },
  { label: "$500+", value: [500, 10000] }
]

interface PriceRangeFilterProps {
  value: [number, number]
  onValueChange: (value: [number, number]) => void
  min?: number
  max?: number
}

export function PriceRangeFilter({ 
  value, 
  onValueChange, 
  min = 0, 
  max = 10000 
}: PriceRangeFilterProps) {
  const [localMin, setLocalMin] = useState(value[0].toString())
  const [localMax, setLocalMax] = useState(value[1].toString())

  const handleSliderChange = (newValue: number[]) => {
    const range: [number, number] = [newValue[0], newValue[1]]
    onValueChange(range)
    setLocalMin(range[0].toString())
    setLocalMax(range[1].toString())
  }

  const handleInputChange = () => {
    const minVal = Math.max(min, parseFloat(localMin) || min)
    const maxVal = Math.min(max, parseFloat(localMax) || max)
    
    if (minVal <= maxVal) {
      onValueChange([minVal, maxVal])
    }
  }

  const handlePresetClick = (preset: [number, number]) => {
    onValueChange(preset)
    setLocalMin(preset[0].toString())
    setLocalMax(preset[1].toString())
  }

  const formatPrice = (price: number) => {
    if (price >= max) return "∞"
    return `$${price}`
  }

  return (
    <div className="space-y-6">
      {/* Current Range Display */}
      <div className="text-center py-4 bg-muted/50 rounded-lg border">
        <div className="text-2xl font-bold text-primary">
          {formatPrice(value[0])} - {formatPrice(value[1])}
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {value[0] === min && value[1] === max ? "All prices" : "Selected price range"}
        </p>
      </div>

      {/* Slider */}
      <div className="px-3">
        <Slider
          value={[value[0], value[1]]}
          onValueChange={handleSliderChange}
          max={max}
          min={min}
          step={1}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>${min}</span>
          <span>{max >= 10000 ? "$10,000+" : `$${max}`}</span>
        </div>
      </div>

      {/* Manual Input */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="min-price" className="text-sm">Min Price</Label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="min-price"
              type="number"
              value={localMin}
              onChange={(e) => setLocalMin(e.target.value)}
              onBlur={handleInputChange}
              className="pl-10"
              min={min}
              max={max}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="max-price" className="text-sm">Max Price</Label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="max-price"
              type="number"
              value={localMax}
              onChange={(e) => setLocalMax(e.target.value)}
              onBlur={handleInputChange}
              className="pl-10"
              min={min}
              max={max}
            />
          </div>
        </div>
      </div>

      {/* Preset Ranges */}
      <div>
        <Label className="text-sm mb-3 block">Quick Select</Label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PRESET_RANGES.map((preset, index) => (
            <Button
              key={index}
              variant={value[0] === preset.value[0] && value[1] === preset.value[1] ? "default" : "outline"}
              size="sm"
              onClick={() => handlePresetClick(preset.value as [number, number])}
              className="text-xs h-8"
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Reset Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => handlePresetClick([min, max])}
        className="w-full"
      >
        Reset to All Prices
      </Button>
    </div>
  )
}