import { useState, useEffect } from "react"
import { supabase } from "@/integrations/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Filter } from "lucide-react"
import { LoadingState } from "@/components/ui/LoadingState"
import { PageHeader } from "@/components/layout/PageHeader"
import { toast } from "sonner"
import { MobileSearchFilters } from "@/components/mobile/MobileSearchFilters"
import { logger } from '@/lib/logger';
import { ResponsiveInventoryTable } from "@/components/enhanced/ResponsiveInventoryTable"
import { useStore } from "@/contexts/StoreContext"

interface InventoryItem {
  id: string
  sku?: string
  brand_title?: string
  subject?: string
  set_name?: string
  card_number?: string
  variant?: string
  quantity: number
  price?: number
  category?: string
  created_at: string
  updated_at: string
  catalog_snapshot?: any
  shopify_sync_status?: string
}

const MobileInventory = () => {
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeFilters, setActiveFilters] = useState<Record<string, any>>({})
  const { assignedStore, selectedLocation } = useStore()

  // Sample filter configuration for mobile
  const filterSections = [
    {
      id: 'game',
      title: 'Game',
      type: 'select' as const,
      options: [
        { value: 'pokemon', label: 'Pokémon', count: 1250 },
        { value: 'yugioh', label: 'Yu-Gi-Oh!', count: 850 },
        { value: 'mtg', label: 'Magic: The Gathering', count: 650 },
        { value: 'dragonball', label: 'Dragon Ball Super', count: 320 },
      ]
    },
    {
      id: 'condition',
      title: 'Condition',
      type: 'checkbox' as const,
      options: [
        { value: 'mint', label: 'Mint', count: 45 },
        { value: 'near-mint', label: 'Near Mint', count: 234 },
        { value: 'excellent', label: 'Excellent', count: 156 },
        { value: 'good', label: 'Good', count: 87 },
        { value: 'played', label: 'Played', count: 23 },
      ]
    },
    {
      id: 'rarity',
      title: 'Rarity',
      type: 'checkbox' as const,
      options: [
        { value: 'common', label: 'Common', count: 345 },
        { value: 'uncommon', label: 'Uncommon', count: 234 },
        { value: 'rare', label: 'Rare', count: 123 },
        { value: 'mythic', label: 'Mythic Rare', count: 45 },
        { value: 'special', label: 'Special', count: 12 },
      ]
    },
    {
      id: 'price',
      title: 'Price Range',
      type: 'range' as const,
      min: 0,
      max: 1000
    },
    {
      id: 'status',
      title: 'Status',
      type: 'select' as const,
      options: [
        { value: 'in_stock', label: 'In Stock', count: 456 },
        { value: 'low_stock', label: 'Low Stock', count: 23 },
        { value: 'out_of_stock', label: 'Out of Stock', count: 12 },
      ]
    }
  ]

  const fetchInventoryItems = async () => {
    try {
      setLoading(true)
      
      let query = supabase
        .from('intake_items')
        .select('*')
        .not('removed_from_batch_at', 'is', null) // Only inventory items
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })

      if (assignedStore) {
        query = query.eq('store_key', assignedStore)
      }
      if (selectedLocation) {
        query = query.eq('shopify_location_gid', selectedLocation)
      }

      const { data, error } = await query

      if (error) throw error

      setInventoryItems(data || [])
    } catch (error) {
      logger.error('Error fetching inventory', error instanceof Error ? error : new Error(String(error)), undefined, 'mobile-inventory');
      toast.error('Error loading inventory items')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchInventoryItems()
  }, [assignedStore, selectedLocation])

  const handleFilterChange = (filterId: string, value: any) => {
    setActiveFilters(prev => ({
      ...prev,
      [filterId]: value
    }))
  }

  const handleClearFilters = () => {
    setActiveFilters({})
    setSearchQuery("")
  }

  const handleEdit = (item: any) => {
    toast.success(`Edit ${item.name}`)
  }

  const handleDelete = (item: any) => {
    toast.success(`Delete ${item.name}`)
  }

  const handleBulkAction = (action: string, items: any[]) => {
    toast.success(`${action} ${items.length} items`)
  }

  // Transform inventory items to match expected interface
  const transformedItems = inventoryItems.map(item => ({
    id: item.id,
    name: item.subject || item.brand_title || 'Unknown Card',
    set: item.set_name || item.catalog_snapshot?.set || 'Unknown Set',
    game: item.catalog_snapshot?.game || 'pokemon',
    condition: item.variant || 'near-mint',
    quantity: item.quantity,
    price: item.price || 0,
    lastUpdated: new Date(item.updated_at),
    status: (item.quantity === 0 ? 'out_of_stock' : 
             item.quantity <= 3 ? 'low_stock' : 
             'in_stock') as "in_stock" | "low_stock" | "out_of_stock",
    imageUrl: item.catalog_snapshot?.image_url,
    rarity: 'common'
  }))

  // Apply filters and search
  const filteredItems = transformedItems.filter(item => {
    // Search filter
    if (searchQuery && !item.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !item.set.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false
    }

    // Game filter
    if (activeFilters.game && item.game !== activeFilters.game) {
      return false
    }

    // Condition filter
    if (activeFilters.condition?.length > 0 && !activeFilters.condition.includes(item.condition)) {
      return false
    }

    // Rarity filter
    if (activeFilters.rarity?.length > 0 && !activeFilters.rarity.includes(item.rarity)) {
      return false
    }

    // Price filter
    if (activeFilters.price?.min && item.price < activeFilters.price.min) {
      return false
    }
    if (activeFilters.price?.max && item.price > activeFilters.price.max) {
      return false
    }

    // Status filter
    if (activeFilters.status && item.status !== activeFilters.status) {
      return false
    }

    return true
  })

  if (loading) {
    return <LoadingState message="Loading inventory..." />
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <PageHeader
        title="Inventory"
        description={`${filteredItems.length} of ${transformedItems.length} items`}
        showEcosystem
        actions={
          <Button className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Add Item
          </Button>
        }
      />

        {/* Search and Filters */}
        <MobileSearchFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filters={filterSections}
          activeFilters={activeFilters}
          onFilterChange={handleFilterChange}
          onClearFilters={handleClearFilters}
        />

        {/* Inventory Summary Cards - Mobile Only */}
        <div className="grid grid-cols-3 gap-3 md:hidden">
          <Card className="p-3 text-center">
            <div className="text-lg font-bold text-green-600">
              {transformedItems.filter(i => i.status === 'in_stock').length}
            </div>
            <div className="text-xs text-muted-foreground">In Stock</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-lg font-bold text-yellow-600">
              {transformedItems.filter(i => i.status === 'low_stock').length}
            </div>
            <div className="text-xs text-muted-foreground">Low Stock</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-lg font-bold text-red-600">
              {transformedItems.filter(i => i.status === 'out_of_stock').length}
            </div>
            <div className="text-xs text-muted-foreground">Out of Stock</div>
          </Card>
        </div>

        {/* Inventory Table/Cards */}
        <ResponsiveInventoryTable
          data={filteredItems}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onBulkAction={handleBulkAction}
        />

        {/* Empty State */}
        {filteredItems.length === 0 && transformedItems.length > 0 && (
          <Card className="p-8 text-center">
            <Filter className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No items match your filters</h3>
            <p className="text-muted-foreground mb-4">
              Try adjusting your search or clearing some filters
            </p>
            <Button variant="outline" onClick={handleClearFilters}>
              Clear All Filters
            </Button>
          </Card>
        )}
    </div>
  )
}

export default MobileInventory