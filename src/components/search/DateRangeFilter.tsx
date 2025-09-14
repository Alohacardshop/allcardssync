import { useState } from "react"
import { CalendarDays, X } from "lucide-react"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

interface DateRangeFilterProps {
  value: [Date | null, Date | null]
  onValueChange: (value: [Date | null, Date | null]) => void
}

export function DateRangeFilter({ value, onValueChange }: DateRangeFilterProps) {
  const [startDate, endDate] = value
  const [isStartOpen, setIsStartOpen] = useState(false)
  const [isEndOpen, setIsEndOpen] = useState(false)

  const handleStartDateSelect = (date: Date | undefined) => {
    if (date) {
      onValueChange([date, endDate])
      setIsStartOpen(false)
    }
  }

  const handleEndDateSelect = (date: Date | undefined) => {
    if (date) {
      onValueChange([startDate, date])
      setIsEndOpen(false)
    }
  }

  const clearStartDate = () => {
    onValueChange([null, endDate])
  }

  const clearEndDate = () => {
    onValueChange([startDate, null])
  }

  const clearBothDates = () => {
    onValueChange([null, null])
  }

  // Preset date ranges
  const presetRanges = [
    {
      label: "Last Month",
      getValue: () => {
        const end = new Date()
        const start = new Date()
        start.setMonth(start.getMonth() - 1)
        return [start, end] as [Date, Date]
      }
    },
    {
      label: "Last 3 Months",
      getValue: () => {
        const end = new Date()
        const start = new Date()
        start.setMonth(start.getMonth() - 3)
        return [start, end] as [Date, Date]
      }
    },
    {
      label: "Last 6 Months",
      getValue: () => {
        const end = new Date()
        const start = new Date()
        start.setMonth(start.getMonth() - 6)
        return [start, end] as [Date, Date]
      }
    },
    {
      label: "This Year",
      getValue: () => {
        const end = new Date()
        const start = new Date(end.getFullYear(), 0, 1)
        return [start, end] as [Date, Date]
      }
    },
    {
      label: "Last Year",
      getValue: () => {
        const currentYear = new Date().getFullYear()
        const start = new Date(currentYear - 1, 0, 1)
        const end = new Date(currentYear - 1, 11, 31)
        return [start, end] as [Date, Date]
      }
    }
  ]

  return (
    <div className="space-y-4">
      {/* Current Selection Display */}
      {(startDate || endDate) && (
        <div className="p-3 bg-muted/50 rounded-lg border flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <CalendarDays className="h-4 w-4" />
            <span>
              {startDate ? format(startDate, "MMM dd, yyyy") : "Any date"} -{" "}
              {endDate ? format(endDate, "MMM dd, yyyy") : "Any date"}
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={clearBothDates}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Date Pickers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Start Date */}
        <div>
          <Label className="text-sm mb-2 block">From Date</Label>
          <Popover open={isStartOpen} onOpenChange={setIsStartOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !startDate && "text-muted-foreground"
                )}
              >
                <CalendarDays className="mr-2 h-4 w-4" />
                {startDate ? format(startDate, "MMM dd, yyyy") : "Select start date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={startDate || undefined}
                onSelect={handleStartDateSelect}
                initialFocus
                className="pointer-events-auto"
              />
              {startDate && (
                <div className="p-3 border-t">
                  <Button variant="outline" size="sm" onClick={clearStartDate} className="w-full">
                    Clear Start Date
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>

        {/* End Date */}
        <div>
          <Label className="text-sm mb-2 block">To Date</Label>
          <Popover open={isEndOpen} onOpenChange={setIsEndOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !endDate && "text-muted-foreground"
                )}
              >
                <CalendarDays className="mr-2 h-4 w-4" />
                {endDate ? format(endDate, "MMM dd, yyyy") : "Select end date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={endDate || undefined}
                onSelect={handleEndDateSelect}
                initialFocus
                disabled={(date) => startDate ? date < startDate : false}
                className="pointer-events-auto"
              />
              {endDate && (
                <div className="p-3 border-t">
                  <Button variant="outline" size="sm" onClick={clearEndDate} className="w-full">
                    Clear End Date
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Preset Ranges */}
      <div>
        <Label className="text-sm mb-3 block">Quick Select</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {presetRanges.map((preset, index) => (
            <Button
              key={index}
              variant="outline"
              size="sm"
              onClick={() => onValueChange(preset.getValue())}
              className="text-xs h-8"
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}