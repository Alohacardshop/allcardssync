import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Settings, Upload, Zap } from "lucide-react"
import { BatchConfig } from "@/hooks/useBatchSendToShopify"

interface BatchConfigDialogProps {
  itemCount: number
  onStartBatch: (config: BatchConfig) => void
  disabled?: boolean
  children?: React.ReactNode
  autoProcessAvailable?: boolean
  onAutoProcess?: () => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function BatchConfigDialog({ 
  itemCount, 
  onStartBatch, 
  disabled, 
  children, 
  autoProcessAvailable = false,
  onAutoProcess,
  open: externalOpen,
  onOpenChange: externalOnOpenChange
}: BatchConfigDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [config, setConfig] = useState<BatchConfig>({
    batchSize: 5,
    delayBetweenChunks: 1000,
    failFast: false
  })

  // Use external open state if provided, otherwise use internal
  const open = externalOpen !== undefined ? externalOpen : internalOpen
  const setOpen = externalOnOpenChange !== undefined ? externalOnOpenChange : setInternalOpen

  const handleStart = () => {
    onStartBatch(config)
    setOpen(false)
  }

  const estimateTime = () => {
    const chunks = Math.ceil(itemCount / config.batchSize)
    const delayTime = (chunks - 1) * config.delayBetweenChunks
    const processingTime = chunks * 3000 // Estimate 3 seconds per chunk
    const totalSeconds = Math.ceil((delayTime + processingTime) / 1000)
    
    if (totalSeconds < 60) return `~${totalSeconds}s`
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `~${minutes}m ${seconds}s`
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button disabled={disabled} variant="default">
            <Upload className="w-4 h-4 mr-2" />
            Batch Send to Shopify ({itemCount})
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Batch Send Configuration
          </DialogTitle>
          <DialogDescription>
            Configure batch processing settings to optimize Shopify API usage and reliability.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Processing Summary</CardTitle>
              <CardDescription>
                {itemCount} items • {Math.ceil(itemCount / config.batchSize)} chunks • Estimated time: {estimateTime()}
              </CardDescription>
            </CardHeader>
          </Card>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="batch-size">Batch Size</Label>
              <Select 
                value={config.batchSize.toString()} 
                onValueChange={(value) => setConfig({ ...config, batchSize: parseInt(value) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 item per chunk</SelectItem>
                  <SelectItem value="5">5 items per chunk (recommended)</SelectItem>
                  <SelectItem value="10">10 items per chunk</SelectItem>
                  <SelectItem value="20">20 items per chunk</SelectItem>
                  <SelectItem value="50">50 items per chunk</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Smaller batches are more reliable but take longer. Start with 5 items.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="delay">Delay Between Chunks</Label>
              <Select 
                value={config.delayBetweenChunks.toString()} 
                onValueChange={(value) => setConfig({ ...config, delayBetweenChunks: parseInt(value) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="500">0.5 seconds</SelectItem>
                  <SelectItem value="1000">1 second (recommended)</SelectItem>
                  <SelectItem value="2000">2 seconds</SelectItem>
                  <SelectItem value="5000">5 seconds</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Longer delays reduce API rate limit issues but increase total time.
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="fail-fast">Fail Fast Mode</Label>
                <p className="text-xs text-muted-foreground">
                  Stop processing if a chunk fails, or continue with remaining items
                </p>
              </div>
              <Switch
                id="fail-fast"
                checked={config.failFast}
                onCheckedChange={(checked) => setConfig({ ...config, failFast: checked })}
              />
            </div>
          </div>

          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            {autoProcessAvailable && onAutoProcess && (
              <Button 
                variant="secondary" 
                onClick={() => {
                  onAutoProcess();
                  setOpen(false);
                }}
              >
                <Zap className="w-4 h-4 mr-2" />
                Auto Process
              </Button>
            )}
            <Button onClick={handleStart}>
              Manual Configure
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}