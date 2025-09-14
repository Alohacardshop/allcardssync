import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Copy, ExternalLink, Key, Server, Settings, CheckCircle2, AlertTriangle } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

export default function ShopifyEnvironmentSetup() {
  const [copiedItem, setCopiedItem] = useState<string | null>(null)

  const copyToClipboard = async (text: string, item: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedItem(item)
      toast.success(`Copied ${item} to clipboard`)
      setTimeout(() => setCopiedItem(null), 2000)
    } catch (error) {
      toast.error("Failed to copy to clipboard")
    }
  }

  const requiredVars = [
    {
      key: "SHOPIFY_HAWAII_STORE_DOMAIN",
      description: "Hawaii store domain (e.g., hawaii-store.myshopify.com)",
      category: "Store Configuration",
      required: true
    },
    {
      key: "SHOPIFY_HAWAII_ACCESS_TOKEN", 
      description: "Hawaii store Admin API access token (shpat_...)",
      category: "Store Configuration",
      required: true,
      sensitive: true
    },
    {
      key: "SHOPIFY_LAS_VEGAS_STORE_DOMAIN",
      description: "Las Vegas store domain (e.g., lasvegas-store.myshopify.com)", 
      category: "Store Configuration",
      required: true
    },
    {
      key: "SHOPIFY_LAS_VEGAS_ACCESS_TOKEN",
      description: "Las Vegas store Admin API access token (shpat_...)",
      category: "Store Configuration", 
      required: true,
      sensitive: true
    },
    {
      key: "SHOPIFY_BATCH_SIZE",
      description: "Number of items processed per batch (recommended: 1)",
      category: "Performance Settings",
      required: false,
      defaultValue: "1"
    },
    {
      key: "SHOPIFY_BATCH_DELAY", 
      description: "Delay between batches in milliseconds (recommended: 2000)",
      category: "Performance Settings",
      required: false,
      defaultValue: "2000"
    },
    {
      key: "SHOPIFY_MAX_PROCESS_COUNT",
      description: "Maximum items to process per run (recommended: 50)",
      category: "Performance Settings", 
      required: false,
      defaultValue: "50"
    },
    {
      key: "SHOPIFY_AUTO_CLEANUP_DAYS",
      description: "Days after which completed queue items are deleted (default: 7)",
      category: "Maintenance Settings",
      required: false,
      defaultValue: "7"
    },
    {
      key: "SHOPIFY_AUTO_ARCHIVE_DAYS", 
      description: "Days after which failed items are archived (default: 30)",
      category: "Maintenance Settings",
      required: false,
      defaultValue: "30"
    }
  ]

  const permissionRequirements = [
    "Products - Read and write access to create/update products",
    "Inventory - Read and write access to manage inventory levels", 
    "Locations - Read access to fetch store locations",
    "Product listings - Read and write access for product publishing",
    "Orders - Read access for order synchronization (optional)"
  ]

  const categories = [...new Set(requiredVars.map(v => v.category))]

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2 mb-2">
          <Settings className="w-5 h-5" />
          Shopify Environment Configuration
        </h3>
        <p className="text-sm text-muted-foreground">
          Complete setup guide for Shopify integration environment variables and API permissions.
        </p>
      </div>

      {/* Setup Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            Setup Status
          </CardTitle>
          <CardDescription>
            Current configuration status for Shopify integration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">Store Credentials</span>
                <Badge variant="secondary">2/2 Required</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Hawaii and Las Vegas store API tokens configured
              </p>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">Queue Settings</span>
                <Badge variant="secondary">Configurable</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Processing limits and timing configuration
              </p>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">Edge Functions</span>
                <Badge variant="default">Active</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Sync processor and API functions deployed
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Required Permissions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5" />
            Required Shopify Admin API Permissions
          </CardTitle>
          <CardDescription>
            Your Shopify private app must have these permissions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {permissionRequirements.map((permission, index) => (
              <div key={index} className="flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span className="text-sm">{permission}</span>
              </div>
            ))}
          </div>
          <Alert className="mt-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Important:</strong> Without proper permissions, the sync will fail. 
              Ensure your Shopify private app has all required permissions before proceeding.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Environment Variables by Category */}
      {categories.map(category => (
        <Card key={category}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="w-5 h-5" />
              {category}
            </CardTitle>
            <CardDescription>
              Configure {category.toLowerCase()} for optimal Shopify sync performance
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {requiredVars
                .filter(v => v.category === category)
                .map(variable => (
                  <div key={variable.key} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                          {variable.key}
                        </code>
                        <div className="flex gap-1">
                          {variable.required && (
                            <Badge variant="destructive" className="text-xs">Required</Badge>
                          )}
                          {variable.sensitive && (
                            <Badge variant="secondary" className="text-xs">Sensitive</Badge>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(variable.key, variable.key)}
                        className="h-8"
                      >
                        <Copy className="w-3 h-3" />
                        {copiedItem === variable.key ? "Copied!" : "Copy"}
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      {variable.description}
                    </p>
                    {variable.defaultValue && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">Default:</span>
                        <code className="text-xs bg-muted px-1 py-0.5 rounded">
                          {variable.defaultValue}
                        </code>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Setup Instructions */}
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="text-blue-800">Setup Instructions</CardTitle>
          <CardDescription className="text-blue-700">
            Step-by-step guide to configure Shopify integration
          </CardDescription>
        </CardHeader>
        <CardContent className="text-blue-800">
          <div className="space-y-4">
            <div className="space-y-2">
              <h4 className="font-semibold flex items-center gap-2">
                <span className="bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">1</span>
                Create Shopify Private Apps
              </h4>
              <ul className="text-sm space-y-1 ml-7">
                <li>• Go to your Shopify admin → Apps → App and sales channel settings</li>
                <li>• Click "Develop apps" → "Create an app"</li>
                <li>• Configure Admin API scopes with the permissions listed above</li>
                <li>• Install the app and copy the Admin API access token</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold flex items-center gap-2">
                <span className="bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">2</span>
                Configure Environment Variables
              </h4>
              <ul className="text-sm space-y-1 ml-7">
                <li>• Use the "Store Configuration" tab to enter your credentials</li>
                <li>• Test connections to verify API access</li>
                <li>• Configure queue settings based on your store size</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold flex items-center gap-2">
                <span className="bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">3</span>
                Test the Integration
              </h4>
              <ul className="text-sm space-y-1 ml-7">
                <li>• Use the "Test Shopify Sync" feature with sample data</li>
                <li>• Monitor the sync queue for successful processing</li>
                <li>• Verify products appear correctly in Shopify</li>
              </ul>
            </div>
          </div>

          <Separator className="my-4" />

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Need help setting up?</span>
            <Button variant="outline" size="sm" className="text-blue-800 border-blue-300">
              <ExternalLink className="w-4 h-4 mr-2" />
              Shopify Admin API Docs
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}