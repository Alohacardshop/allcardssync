import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Settings, Upload, Zap } from "lucide-react"
import { BatchConfig } from "@/hooks/useBatchSendToShopify"
import { supabase } from "@/integrations/supabase/client"
import { useToast } from "@/hooks/use-toast"

interface BatchConfigDialogProps {
  itemCount: number
  onStartBatch: (config: BatchConfig) => void
  disabled?: boolean
  children?: React.ReactNode
  autoProcessAvailable?: boolean
  onAutoProcess?: () => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  storeKey?: string
  locationGid?: string
}

export function BatchConfigDialog({ 
  itemCount, 
  onStartBatch, 
  disabled, 
  children, 
  autoProcessAvailable = false,
  onAutoProcess,
  open: externalOpen,
  onOpenChange: externalOnOpenChange,
  storeKey,
  locationGid
}: BatchConfigDialogProps) {
  const { toast } = useToast()
  const [internalOpen, setInternalOpen] = useState(false)
  const [config, setConfig] = useState<BatchConfig>({
    batchSize: 5,
    delayBetweenChunks: 1000,
    failFast: false,
    vendor: undefined
  })
  const [vendors, setVendors] = useState<Array<{ vendor_name: string; is_default: boolean }>>([])
  const [loadingVendors, setLoadingVendors] = useState(false)

  // Use external open state if provided, otherwise use internal
  const open = externalOpen !== undefined ? externalOpen : internalOpen
  const setOpen = externalOnOpenChange !== undefined ? externalOnOpenChange : setInternalOpen

  // Load vendors when store/location changes or dialog opens
  useEffect(() => {
    if (open && storeKey && locationGid) {
      loadVendors()
    }
  }, [open, storeKey, locationGid])

  const loadVendors = async () => {
    if (!storeKey || !locationGid) return
    
    setLoadingVendors(true)
    try {
      const { data, error } = await supabase
        .from('shopify_location_vendors')
        .select('vendor_name, is_default')
        .eq('store_key', storeKey)
        .eq('location_gid', locationGid)
        .order('is_default', { ascending: false })
        .order('vendor_name', { ascending: true })

      if (error) throw error

      setVendors(data || [])
      
      // Auto-select default vendor
      const defaultVendor = data?.find(v => v.is_default)
      if (defaultVendor) {
        setConfig(prev => ({ ...prev, vendor: defaultVendor.vendor_name }))
      }
    } catch (error) {
      console.error('Error loading vendors:', error)
      toast({
        title: "Error Loading Vendors",
        description: "Could not load vendor options. Please try again.",
        variant: "destructive"
      })
    } finally {
      setLoadingVendors(false)
    }
  }

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
              <Label htmlFor="vendor">Vendor</Label>
              <Select 
                value={config.vendor || ''} 
                onValueChange={(value) => setConfig({ ...config, vendor: value })}
                disabled={loadingVendors || vendors.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingVendors ? "Loading vendors..." : "Select vendor"} />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((vendor) => (
                    <SelectItem key={vendor.vendor_name} value={vendor.vendor_name}>
                      {vendor.vendor_name} {vendor.is_default && "(default)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Products will be tagged with this vendor in Shopify
              </p>
            </div>
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