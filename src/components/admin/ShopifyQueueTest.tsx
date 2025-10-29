import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { supabase } from "@/integrations/supabase/client"
import { toast } from "sonner"
import { Loader2, TestTube, CheckCircle, XCircle } from "lucide-react"

interface TestResult {
  step: string
  status: 'pending' | 'success' | 'error'
  message: string
  data?: any
}

export default function ShopifyQueueTest() {
  const [testing, setTesting] = useState(false)
  const [testResults, setTestResults] = useState<TestResult[]>([])
  const [testItemId, setTestItemId] = useState('')

  const addResult = (result: TestResult) => {
    setTestResults(prev => [...prev, result])
  }

  const runFullWorkflowTest = async () => {
    setTesting(true)
    setTestResults([])

    try {
      // Step 1: Create test items in batch
      addResult({ step: 'Creating test batch items', status: 'pending', message: 'Creating 3 test items...' })
      
      const testItems = []
      for (let i = 1; i <= 3; i++) {
        const { data: item, error } = await supabase.rpc('create_raw_intake_item', {
          store_key_in: 'hawaii',
          shopify_location_gid_in: 'gid://shopify/Location/67818668215',
          quantity_in: 1,
          brand_title_in: 'Test Pokemon',
          subject_in: `Test Card ${i}`,
          category_in: 'Pokemon',
          variant_in: 'Normal',
          card_number_in: `TEST-${i}`,
          price_in: 19.99 + i,
          sku_in: `TEST-QUEUE-${Date.now()}-${i}`
        })

        if (error) {
          addResult({ step: 'Creating test items', status: 'error', message: `Failed to create item ${i}: ${error.message}` })
          return
        }
        
        testItems.push(item[0])
      }
      
      addResult({ 
        step: 'Creating test batch items', 
        status: 'success', 
        message: `✅ Created ${testItems.length} test items`,
        data: { itemIds: testItems.map(item => item.id) }
      })

      // Step 2: Send to inventory (with retry logic)
      addResult({ step: 'Sending to inventory', status: 'pending', message: 'Moving items from batch to inventory...' })
      
      let inventoryResult: any = null
      let inventoryError: any = null
      const maxAttempts = 2
      
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const { data, error } = await supabase.rpc('send_intake_items_to_inventory', {
          item_ids: testItems.map(item => item.id)
        })
        
        inventoryResult = data
        inventoryError = error
        
        if (!error) break // Success
        
        // Check if this is a retryable error
        const isCacheError = error.message?.includes('has no field') || 
                            error.message?.includes('column') ||
                            error.message?.includes('does not exist')
        
        if (isCacheError && attempt < maxAttempts) {
          console.warn(`Schema cache error on attempt ${attempt}, retrying...`, error)
          await new Promise(resolve => setTimeout(resolve, attempt * 500))
          continue
        }
        
        break // Not retryable or out of attempts
      }

      if (inventoryError) {
        const errorMsg = inventoryError.message || 'Unknown error'
        let detailedMsg = `Failed: ${errorMsg}`
        
        if (errorMsg.includes('has no field') || errorMsg.includes('column') || errorMsg.includes('does not exist')) {
          detailedMsg += ' (Database schema issue - may need recompilation)'
        }
        
        addResult({ step: 'Sending to inventory', status: 'error', message: detailedMsg })
        return
      }

      const processed = (inventoryResult as any)?.processed_ids?.length || 0
      addResult({ 
        step: 'Sending to inventory', 
        status: 'success', 
        message: `✅ ${processed} items moved to inventory`,
        data: inventoryResult
      })

      // Step 3: Queue items for Shopify sync
      addResult({ step: 'Queueing for Shopify', status: 'pending', message: 'Adding items to Shopify sync queue...' })
      
      let queuedCount = 0
      for (const itemId of (inventoryResult as any)?.processed_ids || []) {
        const { error: queueError } = await supabase.rpc('queue_shopify_sync', {
          item_id: itemId,
          sync_action: 'create'
        })

        if (queueError) {
          addResult({ step: 'Queueing for Shopify', status: 'error', message: `Failed to queue ${itemId}: ${queueError.message}` })
        } else {
          queuedCount++
        }
      }

      addResult({ 
        step: 'Queueing for Shopify', 
        status: queuedCount > 0 ? 'success' : 'error', 
        message: `✅ ${queuedCount} items queued for Shopify sync`
      })

      // Step 4: Check queue status
      addResult({ step: 'Checking queue status', status: 'pending', message: 'Verifying items are in queue...' })
      
      const { data: queueItems, error: queueError } = await supabase
        .from('shopify_sync_queue')
        .select('*')
        .in('inventory_item_id', (inventoryResult as any)?.processed_ids || [])

      if (queueError) {
        addResult({ step: 'Checking queue status', status: 'error', message: `Failed: ${queueError.message}` })
        return
      }

      addResult({ 
        step: 'Checking queue status', 
        status: 'success', 
        message: `✅ Found ${queueItems?.length || 0} items in queue`,
        data: queueItems
      })

      // Step 5: Trigger processor
      addResult({ step: 'Triggering processor', status: 'pending', message: 'Starting Shopify sync processor...' })
      
      const { error: processorError } = await supabase.functions.invoke('shopify-sync', { body: {} })

      if (processorError) {
        addResult({ step: 'Triggering processor', status: 'error', message: `Failed: ${processorError.message}` })
      } else {
        addResult({ 
          step: 'Triggering processor', 
          status: 'success', 
          message: '✅ Shopify sync processor started'
        })
      }

      toast.success('Test workflow completed successfully!')

    } catch (error: any) {
      addResult({ step: 'Test execution', status: 'error', message: `Unexpected error: ${error.message}` })
      toast.error('Test workflow failed')
    } finally {
      setTesting(false)
    }
  }

  const testSingleItemUpdate = async () => {
    if (!testItemId) {
      toast.error('Please enter an item ID')
      return
    }

    setTesting(true)
    addResult({ step: 'Testing item update', status: 'pending', message: `Testing update for item ${testItemId}...` })

    try {
      // Update the item (should trigger queue)
      const { error } = await supabase
        .from('intake_items')
        .update({ 
          price: Math.round((Math.random() * 50 + 10) * 100) / 100,
          updated_at: new Date().toISOString()
        })
        .eq('id', testItemId)

      if (error) {
        addResult({ step: 'Testing item update', status: 'error', message: `Failed: ${error.message}` })
        return
      }

      // Check if it was queued
      await new Promise(resolve => setTimeout(resolve, 1000)) // Wait for trigger
      
      const { data: queueItem, error: queueError } = await supabase
        .from('shopify_sync_queue')
        .select('*')
        .eq('inventory_item_id', testItemId)
        .eq('action', 'update')
        .order('created_at', { ascending: false })
        .limit(1)

      if (queueError) {
        addResult({ step: 'Testing item update', status: 'error', message: `Queue check failed: ${queueError.message}` })
        return
      }

      if (queueItem && queueItem.length > 0) {
        addResult({ 
          step: 'Testing item update', 
          status: 'success', 
          message: '✅ Item update queued for Shopify sync',
          data: queueItem[0]
        })
      } else {
        addResult({ 
          step: 'Testing item update', 
          status: 'error', 
          message: '❌ Item update was not queued (may not be in inventory yet)'
        })
      }

      toast.success('Update test completed')
    } catch (error: any) {
      addResult({ step: 'Testing item update', status: 'error', message: `Error: ${error.message}` })
      toast.error('Update test failed')
    } finally {
      setTesting(false)
    }
  }

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'pending':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TestTube className="h-5 w-5" />
          Shopify Queue Integration Test
        </CardTitle>
        <CardDescription>
          Test the complete batch-to-inventory-to-shopify-queue workflow
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Full Workflow Test */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold">Full Workflow Test</h4>
              <p className="text-sm text-muted-foreground">
                Creates test items → moves to inventory → queues for Shopify → triggers processor
              </p>
            </div>
            <Button 
              onClick={runFullWorkflowTest} 
              disabled={testing}
              className="gap-2"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
              Run Full Test
            </Button>
          </div>

          {/* Single Item Update Test */}
          <div className="flex items-center gap-2 pt-4 border-t">
            <Label htmlFor="testItemId">Test Item Update:</Label>
            <Input
              id="testItemId"
              placeholder="Enter item ID"
              value={testItemId}
              onChange={(e) => setTestItemId(e.target.value)}
              className="flex-1"
            />
            <Button 
              onClick={testSingleItemUpdate} 
              disabled={testing || !testItemId}
              variant="outline"
              size="sm"
            >
              Test Update
            </Button>
          </div>
        </div>

        {/* Test Results */}
        {testResults.length > 0 && (
          <div className="space-y-3 border-t pt-4">
            <h4 className="font-semibold">Test Results</h4>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {testResults.map((result, index) => (
                <div key={index} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                  {getStatusIcon(result.status)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{result.step}</span>
                      <Badge variant="outline" className="text-xs">
                        Step {index + 1}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{result.message}</p>
                    {result.data && (
                      <details className="mt-2">
                        <summary className="text-xs text-blue-600 cursor-pointer">View Data</summary>
                        <pre className="text-xs bg-background p-2 rounded mt-1 overflow-auto">
                          {JSON.stringify(result.data, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}