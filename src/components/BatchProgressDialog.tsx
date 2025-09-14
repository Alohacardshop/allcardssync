import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { CheckCircle, XCircle, Clock, Pause, Play } from "lucide-react"
import { BatchProgress } from "@/hooks/useBatchSendToShopify"

interface BatchProgressDialogProps {
  open: boolean
  progress: BatchProgress | null
  onCancel?: () => void
  onPause?: () => void
  onResume?: () => void
  canPause?: boolean
  isPaused?: boolean
}

export function BatchProgressDialog({ 
  open, 
  progress, 
  onCancel, 
  onPause, 
  onResume,
  canPause = false,
  isPaused = false
}: BatchProgressDialogProps) {
  if (!progress) return null

  const overallProgress = (progress.processedItems / progress.totalItems) * 100
  const chunkProgress = ((progress.currentChunk - 1) / progress.totalChunks) * 100

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {progress.isProcessing ? (
              <Clock className="w-5 h-5 animate-pulse text-blue-500" />
            ) : (
              <CheckCircle className="w-5 h-5 text-green-500" />
            )}
            {progress.isProcessing ? "Processing Batch..." : "Batch Complete"}
          </DialogTitle>
          <DialogDescription>
            Sending items to Shopify in chunks to manage API rate limits
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Overall Progress */}
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Overall Progress</span>
                  <span>{progress.processedItems} of {progress.totalItems} items</span>
                </div>
                <Progress value={overallProgress} className="h-2" />
                <div className="text-xs text-muted-foreground text-center">
                  {Math.round(overallProgress)}% complete
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Chunk Progress */}
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Current Chunk</span>
                  <span>{progress.currentChunk} of {progress.totalChunks}</span>
                </div>
                <Progress value={chunkProgress + (progress.isProcessing ? 10 : 0)} className="h-2" />
                <div className="text-xs text-muted-foreground text-center">
                  {progress.isProcessing ? "Processing..." : "Chunk completed"}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Status Badges */}
          <div className="flex flex-wrap gap-2 justify-center">
            <Badge variant={progress.isProcessing ? "default" : "secondary"}>
              {progress.isProcessing ? "In Progress" : "Completed"}
            </Badge>
            {isPaused && (
              <Badge variant="outline" className="text-orange-600 border-orange-200">
                Paused
              </Badge>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-center space-x-2">
            {progress.isProcessing && (
              <>
                {canPause && (
                  <>
                    {isPaused ? (
                      <Button variant="outline" onClick={onResume} size="sm">
                        <Play className="w-4 h-4 mr-2" />
                        Resume
                      </Button>
                    ) : (
                      <Button variant="outline" onClick={onPause} size="sm">
                        <Pause className="w-4 h-4 mr-2" />
                        Pause
                      </Button>
                    )}
                  </>
                )}
                <Button variant="destructive" onClick={onCancel} size="sm">
                  Cancel
                </Button>
              </>
            )}
            {!progress.isProcessing && (
              <Button onClick={onCancel} size="sm">
                Close
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}