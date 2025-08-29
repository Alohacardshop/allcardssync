import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Database, Search, RefreshCw, Copy, ExternalLink, ChevronLeft, ChevronRight, AlertCircle, Loader2, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  getCatalogSets,
  getCatalogCards,
  getCatalogVariants,
  runAudit,
  formatTimeAgo,
  getCatalogStats,
  GAME_MODES,
  type GameMode,
  type CatalogSet,
  type CatalogCard,
  type CatalogVariant,
  type DataFilters,
  type PaginatedResponse,
  type CatalogStats
} from '@/lib/api';

interface DataTabProps {
  selectedMode: GameMode;
}

const ITEMS_PER_PAGE = 50;

const DataTab: React.FC<DataTabProps> = ({ selectedMode }) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('sets');
  const [filters, setFilters] = useState<DataFilters>({
    search: '',
    page: 1,
    limit: ITEMS_PER_PAGE,
    sortBy: 'set_id',
    sortOrder: 'asc'
  });
  
  // Data states
  const [setsData, setSetsData] = useState<PaginatedResponse<CatalogSet> | null>(null);
  const [cardsData, setCardsData] = useState<PaginatedResponse<CatalogCard> | null>(null);
  const [variantsData, setVariantsData] = useState<PaginatedResponse<CatalogVariant> | null>(null);
  
  // Card count states
  const [cardCounts, setCardCounts] = useState<Record<string, CatalogStats>>({});
  const [countsLoading, setCountsLoading] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [longRunning, setLongRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());
  
  // Search state for debouncing
  const [searchInput, setSearchInput] = useState(filters.search || '');
  const searchTimeoutRef = useRef<NodeJS.Timeout>();
  const abortControllerRef = useRef<AbortController>();
  const longRunningTimeoutRef = useRef<NodeJS.Timeout>();

  // Debounced search effect
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      handleFilterChange('search', searchInput);
    }, 500);
    
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchInput]);

  // Reset page when switching tabs or filters
  useEffect(() => {
    setFilters(prev => ({ ...prev, page: 1 }));
    setError(null);
  }, [activeTab, selectedMode]);

  // Load data when filters change
  useEffect(() => {
    loadData();
  }, [activeTab, selectedMode, filters]);

  // Load card counts on component mount
  useEffect(() => {
    loadCardCounts();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (longRunningTimeoutRef.current) {
        clearTimeout(longRunningTimeoutRef.current);
      }
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const loadData = async () => {
    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Clear long running timeout
    if (longRunningTimeoutRef.current) {
      clearTimeout(longRunningTimeoutRef.current);
    }
    
    // Create new abort controller
    abortControllerRef.current = new AbortController();
    
    setLoading(true);
    setLongRunning(false);
    setError(null);
    
    // Set long running timeout
    longRunningTimeoutRef.current = setTimeout(() => {
      setLongRunning(true);
    }, 3000);
    
    try {
      let result;
      switch (activeTab) {
        case 'sets':
          result = await getCatalogSets(selectedMode, filters);
          setSetsData(result);
          break;
        case 'cards':
          result = await getCatalogCards(selectedMode, filters);
          setCardsData(result);
          break;
        case 'variants':
          result = await getCatalogVariants(selectedMode, filters);
          setVariantsData(result);
          break;
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return; // Request was cancelled, don't show error
      }
      
      console.error('Failed to load data:', error);
      setError(error.message || 'Failed to load data');
      toast({
        title: "Error",
        description: error.message || 'Failed to load data',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setLongRunning(false);
      if (longRunningTimeoutRef.current) {
        clearTimeout(longRunningTimeoutRef.current);
      }
    }
  };

  const loadCardCounts = async () => {
    setCountsLoading(true);
    try {
      const counts: Record<string, CatalogStats> = {};
      
      // Load stats for all game modes
      for (const mode of GAME_MODES) {
        try {
          const stats = await getCatalogStats(mode);
          counts[mode.value] = stats;
        } catch (error) {
          console.error(`Failed to load stats for ${mode.value}:`, error);
          // Continue loading other modes even if one fails
        }
      }
      
      setCardCounts(counts);
    } catch (error: any) {
      console.error('Failed to load card counts:', error);
    } finally {
      setCountsLoading(false);
    }
  };

  const handleFilterChange = (key: keyof DataFilters, value: any) => {
    setFilters(prev => ({ 
      ...prev, 
      [key]: value,
      page: key === 'page' ? value : 1 // Reset to page 1 unless changing page
    }));
  };


  const handleAuditSet = async (setId: string) => {
    setActionLoading(prev => new Set(prev).add(`audit-${setId}`));
    try {
      await runAudit(selectedMode, { setId });
      toast({
        title: "Success",
        description: `Set ${setId} audit completed`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(prev => {
        const newSet = new Set(prev);
        newSet.delete(`audit-${setId}`);
        return newSet;
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Success",
      description: "Copied to clipboard",
    });
  };

  const currentData = activeTab === 'sets' ? setsData : 
                     activeTab === 'cards' ? cardsData : variantsData;

  return (
    <div className="space-y-6">

      {/* Card Count Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {GAME_MODES.map((mode) => {
              const stats = cardCounts[mode.value];
              return (
                <div key={mode.value} className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium">{mode.label}</h3>
                    {mode.value === 'pokemon-japan' && (
                      <Badge variant="secondary" className="text-xs">JP</Badge>
                    )}
                  </div>
                  {countsLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Loading...</span>
                    </div>
                  ) : stats ? (
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>Sets:</span>
                        <span className="font-mono">{stats.sets_count.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Cards:</span>
                        <span className="font-mono">{stats.cards_count.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Pending:</span>
                        <span className="font-mono">{stats.pending_count.toLocaleString()}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">No data</div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Data Browser - {selectedMode.label}
            {selectedMode.value === 'pokemon-japan' && (
              <Badge variant="secondary" className="text-xs">JP</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="sets">Sets</TabsTrigger>
              <TabsTrigger value="cards">Cards</TabsTrigger>
              <TabsTrigger value="variants">Variants</TabsTrigger>
            </TabsList>

            {/* Common Filters */}
            <div className="mt-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <div>
                  <Label htmlFor="search">Search</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="search"
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      placeholder="Name, ID or code..."
                      className="pl-8"
                    />
                    {searchInput !== filters.search && (
                      <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                </div>

                {activeTab !== 'sets' && (
                  <div>
                    <Label htmlFor="setId">Set</Label>
                    <Input
                      id="setId"
                      value={filters.setId || ''}
                      onChange={(e) => handleFilterChange('setId', e.target.value)}
                      placeholder="Set ID"
                    />
                  </div>
                )}

                {activeTab === 'cards' && (
                  <div>
                    <Label htmlFor="rarity">Rarity</Label>
                    <Select value={filters.rarity || 'all'} onValueChange={(value) => handleFilterChange('rarity', value === 'all' ? undefined : value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="All rarities" />
                      </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All rarities</SelectItem>
                        <SelectItem value="Common">Common</SelectItem>
                        <SelectItem value="Uncommon">Uncommon</SelectItem>
                        <SelectItem value="Rare">Rare</SelectItem>
                        <SelectItem value="Mythic Rare">Mythic Rare</SelectItem>
                        <SelectItem value="Special">Special</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {activeTab === 'variants' && (
                  <>
                    <div>
                      <Label htmlFor="language">Language</Label>
                      <Select value={filters.language || 'all'} onValueChange={(value) => handleFilterChange('language', value === 'all' ? undefined : value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="All languages" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All languages</SelectItem>
                          <SelectItem value="English">English</SelectItem>
                          <SelectItem value="Japanese">Japanese</SelectItem>
                          <SelectItem value="French">French</SelectItem>
                          <SelectItem value="German">German</SelectItem>
                          <SelectItem value="Spanish">Spanish</SelectItem>
                          <SelectItem value="Italian">Italian</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="condition">Condition</Label>
                      <Select value={filters.condition || 'all'} onValueChange={(value) => handleFilterChange('condition', value === 'all' ? undefined : value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="All conditions" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All conditions</SelectItem>
                          <SelectItem value="Near Mint">Near Mint</SelectItem>
                          <SelectItem value="Lightly Played">Lightly Played</SelectItem>
                          <SelectItem value="Moderately Played">Moderately Played</SelectItem>
                          <SelectItem value="Heavily Played">Heavily Played</SelectItem>
                          <SelectItem value="Damaged">Damaged</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                <div>
                  <Label htmlFor="sortBy">Sort By</Label>
                  <Select value={filters.sortBy || ''} onValueChange={(value) => handleFilterChange('sortBy', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {activeTab === 'sets' && (
                        <>
                          <SelectItem value="set_id">Set ID</SelectItem>
                          <SelectItem value="name">Name</SelectItem>
                          <SelectItem value="release_date">Release Date</SelectItem>
                          <SelectItem value="last_seen_at">Last Seen</SelectItem>
                        </>
                      )}
                      {activeTab === 'cards' && (
                        <>
                          <SelectItem value="card_id">Card ID</SelectItem>
                          <SelectItem value="name">Name</SelectItem>
                          <SelectItem value="set_id">Set ID</SelectItem>
                          <SelectItem value="rarity">Rarity</SelectItem>
                          <SelectItem value="last_seen_at">Last Seen</SelectItem>
                        </>
                      )}
                      {activeTab === 'variants' && (
                        <>
                          <SelectItem value="variant_key">Variant Key</SelectItem>
                          <SelectItem value="card_id">Card ID</SelectItem>
                          <SelectItem value="price">Price</SelectItem>
                          <SelectItem value="language">Language</SelectItem>
                          <SelectItem value="last_seen_at">Last Seen</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Price range for variants */}
              {activeTab === 'variants' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="priceMin">Min Price ($)</Label>
                    <Input
                      id="priceMin"
                      type="number"
                      value={filters.priceMin || ''}
                      onChange={(e) => handleFilterChange('priceMin', e.target.value ? parseFloat(e.target.value) : undefined)}
                      placeholder="0.00"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <Label htmlFor="priceMax">Max Price ($)</Label>
                    <Input
                      id="priceMax"
                      type="number"
                      value={filters.priceMax || ''}
                      onChange={(e) => handleFilterChange('priceMax', e.target.value ? parseFloat(e.target.value) : undefined)}
                      placeholder="999.99"
                      step="0.01"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Loading States and Error Handling */}
            {loading && longRunning && (
              <div className="p-4 bg-muted rounded-lg border border-dashed">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <div>
                      <p className="font-medium">Query is taking longer than expected</p>
                      <p className="text-sm text-muted-foreground">
                        Large datasets may take some time to process. You can wait or try simplifying your search.
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (abortControllerRef.current) {
                        abortControllerRef.current.abort();
                      }
                    }}
                  >
                    Cancel Query
                  </Button>
                </div>
              </div>
            )}

            {error && (
              <div className="p-4 bg-destructive/10 rounded-lg border border-destructive/20">
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  <div className="flex-1">
                    <p className="font-medium text-destructive">Failed to load data</p>
                    <p className="text-sm text-muted-foreground">{error}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadData()}
                    disabled={loading}
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Retry
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Sets Tab */}
            <TabsContent value="sets" className="mt-6">
              <div className="space-y-4">
                {currentData && (
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-muted-foreground">
                      Showing {((currentData.page - 1) * currentData.limit) + 1} to {Math.min(currentData.page * currentData.limit, currentData.total)} of {currentData.total} sets
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleFilterChange('page', Math.max(1, currentData.page - 1))}
                        disabled={currentData.page <= 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm">
                        Page {currentData.page} of {currentData.totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleFilterChange('page', Math.min(currentData.totalPages, currentData.page + 1))}
                        disabled={currentData.page >= currentData.totalPages}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Set ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Release Date</TableHead>
                        <TableHead>Total Cards</TableHead>
                        <TableHead>Last Seen</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={6} className="h-24 text-center">
                            <RefreshCw className="h-4 w-4 animate-spin mx-auto" />
                          </TableCell>
                        </TableRow>
                      ) : setsData?.data.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                            No sets found
                          </TableCell>
                        </TableRow>
                      ) : (
                        setsData?.data.map((set) => (
                          <TableRow key={set.set_id}>
                            <TableCell className="font-mono text-sm">{set.set_id}</TableCell>
                            <TableCell className="font-medium">{set.name}</TableCell>
                            <TableCell>{set.release_date ? new Date(set.release_date).toLocaleDateString() : '—'}</TableCell>
                            <TableCell>{set.total || set.cards_count || '—'}</TableCell>
                            <TableCell>{formatTimeAgo(set.last_seen_at)}</TableCell>
                             <TableCell>
                               <div className="flex items-center gap-2">
                                 <Button
                                   size="sm"
                                   variant="outline"
                                   onClick={() => handleAuditSet(set.set_id)}
                                   disabled={actionLoading.has(`audit-${set.set_id}`)}
                                 >
                                   Audit
                                 </Button>
                                 <Button
                                   size="sm"
                                   variant="ghost"
                                   onClick={() => copyToClipboard(set.set_id)}
                                 >
                                   <Copy className="h-3 w-3" />
                                 </Button>
                               </div>
                             </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </TabsContent>

            {/* Cards Tab */}
            <TabsContent value="cards" className="mt-6">
              <div className="space-y-4">
                {currentData && (
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-muted-foreground">
                      Showing {((currentData.page - 1) * currentData.limit) + 1} to {Math.min(currentData.page * currentData.limit, currentData.total)} of {currentData.total} cards
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleFilterChange('page', Math.max(1, currentData.page - 1))}
                        disabled={currentData.page <= 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm">
                        Page {currentData.page} of {currentData.totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleFilterChange('page', Math.min(currentData.totalPages, currentData.page + 1))}
                        disabled={currentData.page >= currentData.totalPages}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Card ID</TableHead>
                        <TableHead>Set ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Number</TableHead>
                        <TableHead>Rarity</TableHead>
                        <TableHead>Last Seen</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={7} className="h-24 text-center">
                            <RefreshCw className="h-4 w-4 animate-spin mx-auto" />
                          </TableCell>
                        </TableRow>
                      ) : cardsData?.data.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                            No cards found
                          </TableCell>
                        </TableRow>
                      ) : (
                        cardsData?.data.map((card) => (
                          <TableRow key={card.card_id}>
                            <TableCell className="font-mono text-sm">{card.card_id}</TableCell>
                            <TableCell className="font-mono text-sm">{card.set_id}</TableCell>
                            <TableCell className="font-medium">{card.name}</TableCell>
                            <TableCell>{card.number || '—'}</TableCell>
                            <TableCell>
                              {card.rarity && (
                                <Badge variant="outline">{card.rarity}</Badge>
                              )}
                            </TableCell>
                            <TableCell>{formatTimeAgo(card.last_seen_at)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleFilterChange('setId', card.set_id)}
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => copyToClipboard(card.card_id)}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </TabsContent>

            {/* Variants Tab */}
            <TabsContent value="variants" className="mt-6">
              <div className="space-y-4">
                {currentData && (
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-muted-foreground">
                      Showing {((currentData.page - 1) * currentData.limit) + 1} to {Math.min(currentData.page * currentData.limit, currentData.total)} of {currentData.total} variants
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleFilterChange('page', Math.max(1, currentData.page - 1))}
                        disabled={currentData.page <= 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm">
                        Page {currentData.page} of {currentData.totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleFilterChange('page', Math.min(currentData.totalPages, currentData.page + 1))}
                        disabled={currentData.page >= currentData.totalPages}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Variant Key</TableHead>
                        <TableHead>Card ID</TableHead>
                        <TableHead>Language</TableHead>
                        <TableHead>Printing</TableHead>
                        <TableHead>Condition</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Last Seen</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={9} className="h-24 text-center">
                            <RefreshCw className="h-4 w-4 animate-spin mx-auto" />
                          </TableCell>
                        </TableRow>
                      ) : variantsData?.data.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                            No variants found
                          </TableCell>
                        </TableRow>
                      ) : (
                        variantsData?.data.map((variant) => (
                          <TableRow key={variant.variant_key}>
                            <TableCell className="font-mono text-xs">{variant.variant_key}</TableCell>
                            <TableCell className="font-mono text-sm">{variant.card_id}</TableCell>
                            <TableCell>
                              {variant.language && (
                                <Badge variant={variant.language === 'Japanese' ? 'default' : 'outline'}>
                                  {variant.language}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>{variant.printing || '—'}</TableCell>
                            <TableCell>{variant.condition || '—'}</TableCell>
                            <TableCell className="font-mono text-xs">{variant.sku || '—'}</TableCell>
                            <TableCell>
                              {variant.price ? `$${variant.price.toFixed(2)}` : '—'}
                            </TableCell>
                            <TableCell>{formatTimeAgo(variant.last_seen_at)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => copyToClipboard(variant.variant_key)}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default DataTab;