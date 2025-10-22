import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Book, Search } from "lucide-react";
import { useStore } from "@/contexts/StoreContext";
import { validateCompleteStoreContext, logStoreContext } from "@/utils/storeValidation";
import { SubCategoryCombobox } from "@/components/ui/sub-category-combobox";
import { ComicsAPI, GcdSeries, GcdIssue, MarvelComic } from "@/lib/comics";

interface IssueSearchResult {
  series: GcdSeries;
  issue: GcdIssue;
}

interface MarvelSearchResult {
  comic: MarvelComic;
}

type SearchResult = IssueSearchResult | MarvelSearchResult;

interface RawComicIntakeProps {
  onBatchAdd?: () => void;
}

export const RawComicIntake = ({ onBatchAdd }: RawComicIntakeProps = {}) => {
  const { assignedStore, selectedLocation } = useStore();
  const [submitting, setSubmitting] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDialog, setShowSearchDialog] = useState(false);
  const [useMarvelAPI, setUseMarvelAPI] = useState(false);
  const [marvelAttribution, setMarvelAttribution] = useState("");

  const [formData, setFormData] = useState({
    title: "",
    issueNumber: "",
    publisher: "",
    year: "",
    condition: "Near Mint",
    price: "",
    cost: "",
    quantity: 1,
    mainCategory: "comics",
    subCategory: "",
    processingNotes: "",
  });

  const handleSearch = async () => {
    if (!formData.title) {
      toast.error("Enter a title to search");
      return;
    }

    setIsSearching(true);
    setShowSearchDialog(true);
    setSearchResults([]);
    setMarvelAttribution("");

    try {
      if (useMarvelAPI) {
        // Use Marvel Comics API
        const marvelResult = await ComicsAPI.searchMarvelComics(formData.title, 20, 0);
        
        if (marvelResult.comics.length === 0) {
          toast.error("No Marvel comics found matching that title");
          return;
        }

        const marvelSearchResults: MarvelSearchResult[] = marvelResult.comics.map((comic: MarvelComic) => ({
          comic
        }));

        setSearchResults(marvelSearchResults);
        setMarvelAttribution(marvelResult.attribution);
        toast.success(`Found ${marvelResult.count} Marvel comics`);
      } else {
        // Use GCD for other publishers
        const seriesResult = await ComicsAPI.searchSeries(formData.title, 1);
        
        if (seriesResult.items.length === 0) {
          toast.error("No series found matching that title");
          return;
        }

        const fakeIssueResults: IssueSearchResult[] = seriesResult.items.slice(0, 10).map(series => ({
          series,
          issue: {
            id: 0,
            number: formData.issueNumber || '',
            title: '',
            url: ''
          }
        }));

        setSearchResults(fakeIssueResults);
        toast.success(`Found ${seriesResult.items.length} matching series`);
      }
    } catch (error: any) {
      console.error('Comics search error:', error);
      toast.error('Failed to search comics database: ' + error.message);
    } finally {
      setIsSearching(false);
    }
  };

  // Auto-calculate cost from price
  useEffect(() => {
    if (formData.price && !isNaN(parseFloat(formData.price))) {
      const price = parseFloat(formData.price);
      const calculatedCost = (price * 0.7).toFixed(2);
      setFormData(prev => ({ ...prev, cost: calculatedCost }));
    }
  }, [formData.price]);

  const updateFormField = (field: string, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSelectIssue = (result: SearchResult) => {
    if ('comic' in result) {
      // Marvel comic
      const comic = result.comic;
      const onSaleDate = comic.dates.find(d => d.type === 'onsaleDate');
      const year = onSaleDate ? new Date(onSaleDate.date).getFullYear().toString() : "";
      
      setFormData(prev => ({
        ...prev,
        title: comic.series.name,
        issueNumber: comic.issueNumber.toString(),
        publisher: "Marvel Comics",
        year: year,
        processingNotes: comic.description || prev.processingNotes,
      }));
      toast.success(`Selected: ${comic.title}`);
    } else {
      // GCD series
      setFormData(prev => ({
        ...prev,
        title: result.series.name,
        issueNumber: result.issue.number,
        publisher: result.series.publisher || "",
        year: result.series.year_began ? String(result.series.year_began) : "",
      }));
      toast.success(`Selected: ${result.series.name} #${result.issue.number}`);
    }
    setShowSearchDialog(false);
    setSearchResults([]);
  };

  const handleSubmit = async () => {
    try {
      validateCompleteStoreContext(
        { assignedStore, selectedLocation }, 
        'submit raw comic intake'
      );
      
      logStoreContext('RawComicIntake', { assignedStore, selectedLocation }, { 
        title: formData.title,
        price: formData.price 
      });
    } catch (error: any) {
      toast.error(error.message);
      return;
    }

    if (!formData.title || !formData.issueNumber || !formData.price || !formData.cost || !formData.subCategory) {
      toast.error("Please fill in all required fields (Title, Issue Number, Price, Cost, Sub-Category)");
      return;
    }

    try {
      setSubmitting(true);

      const { data, error } = await supabase.rpc("create_raw_intake_item", {
        store_key_in: assignedStore,
        shopify_location_gid_in: selectedLocation,
        quantity_in: formData.quantity,
        grade_in: null,
        brand_title_in: formData.publisher,
        subject_in: formData.title,
        category_in: "Comics",
        variant_in: formData.condition,
        card_number_in: formData.issueNumber,
        price_in: parseFloat(formData.price),
        cost_in: parseFloat(formData.cost),
        sku_in: "",
        main_category_in: formData.mainCategory,
        sub_category_in: formData.subCategory,
        processing_notes_in: formData.processingNotes,
        catalog_snapshot_in: {
          title: formData.title,
          issueNumber: formData.issueNumber,
          publisher: formData.publisher,
          year: formData.year,
          condition: formData.condition,
          type: 'raw_comic',
          source: 'manual_entry'
        }
      });

      if (error) throw error;

      setFormData({
        title: "",
        issueNumber: "",
        publisher: "",
        year: "",
        condition: "Near Mint",
        price: "",
        cost: "",
        quantity: 1,
        mainCategory: "comics",
        subCategory: "",
        processingNotes: "",
      });

      toast.success("Comic added to batch successfully!");
      
      if (onBatchAdd) {
        onBatchAdd();
      }

      const item = Array.isArray(data) ? data[0] : data;
      window.dispatchEvent(new CustomEvent('batchItemAdded', {
        detail: { 
          itemId: item.id,
          lot: item.lot_number,
          store: assignedStore,
          location: selectedLocation
        }
      }));

    } catch (error: any) {
      console.error("Submit error:", error);
      toast.error(`Failed to add to batch: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="w-full max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Book className="h-5 w-5" />
            Raw Comics Intake (Manual Entry)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Search Results Dialog */}
          <Dialog open={showSearchDialog} onOpenChange={setShowSearchDialog}>
            <DialogContent className="max-w-3xl max-h-[80vh]">
              <DialogHeader>
                <DialogTitle>Search Results</DialogTitle>
                <p className="text-sm text-muted-foreground">
                  Found {searchResults.length} matching {useMarvelAPI ? 'Marvel comics' : 'series'} for "{formData.title}". Select one to auto-fill details.
                </p>
              </DialogHeader>
              <div className="space-y-4">
                {isSearching && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-muted-foreground">Searching comics database...</span>
                  </div>
                )}
                {!isSearching && searchResults.length > 0 && (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {searchResults.map((result, idx) => {
                      if ('comic' in result) {
                        // Marvel comic result
                        const comic = result.comic;
                        const thumbnailUrl = `${comic.thumbnail.path}/portrait_medium.${comic.thumbnail.extension}`;
                        const writers = comic.creators.items.filter(c => c.role === 'writer').map(c => c.name).join(', ');
                        const onSaleDate = comic.dates.find(d => d.type === 'onsaleDate');
                        
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleSelectIssue(result)}
                            className="w-full p-4 text-left rounded-lg border hover:bg-accent transition-colors"
                          >
                            <div className="flex gap-3">
                              {comic.thumbnail.path !== 'http://i.annihil.us/u/prod/marvel/i/mg/b/40/image_not_available' && (
                                <img 
                                  src={thumbnailUrl} 
                                  alt={comic.title}
                                  className="w-16 h-24 object-cover rounded"
                                />
                              )}
                              <div className="flex-1">
                                <div className="font-medium text-lg">
                                  {comic.title}
                                </div>
                                <div className="text-sm text-muted-foreground mt-1">
                                  Issue #{comic.issueNumber}
                                  {onSaleDate && ` • ${new Date(onSaleDate.date).getFullYear()}`}
                                  {comic.format && ` • ${comic.format}`}
                                </div>
                                {writers && (
                                  <div className="text-xs text-muted-foreground mt-1">
                                    Writer(s): {writers}
                                  </div>
                                )}
                                {comic.description && (
                                  <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                    {comic.description}
                                  </div>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      } else {
                        // GCD series result
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleSelectIssue(result)}
                            className="w-full p-4 text-left rounded-lg border hover:bg-accent transition-colors"
                          >
                            <div className="flex gap-3">
                              <div className="flex-1">
                                <div className="font-medium text-lg">
                                  {result.series.name}
                                </div>
                                <div className="text-sm text-muted-foreground mt-1">
                                  {result.series.publisher || 'Unknown Publisher'}
                                  {result.series.year_began && ` • ${result.series.year_began}`}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      }
                    })}
                  </div>
                )}
                {!isSearching && searchResults.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No matching issues found. Try adjusting your search terms.
                  </div>
                )}
                <div className="text-xs text-muted-foreground text-center pt-2 border-t">
                  {marvelAttribution || "Data: Grand Comics Database (CC BY-SA 4.0)"}
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="publisher">Publisher</Label>
              <div className="space-y-2">
                <Input
                  id="publisher"
                  placeholder="e.g., Marvel Comics"
                  value={formData.publisher}
                  onChange={(e) => {
                    const value = e.target.value;
                    updateFormField('publisher', value);
                    // Auto-switch to Marvel API if publisher contains "Marvel"
                    setUseMarvelAPI(value.toLowerCase().includes('marvel'));
                  }}
                />
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    id="useMarvelAPI"
                    checked={useMarvelAPI}
                    onChange={(e) => setUseMarvelAPI(e.target.checked)}
                    className="rounded"
                  />
                  <label htmlFor="useMarvelAPI">Use Marvel Comics API (for Marvel comics only)</label>
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="subCategory">Sub-Category <span className="text-destructive">*</span></Label>
              <SubCategoryCombobox
                mainCategory="comics"
                value={formData.subCategory}
                onChange={(value) => updateFormField('subCategory', value)}
              />
            </div>

            <div>
              <Label htmlFor="issueNumber">Issue Number <span className="text-destructive">*</span></Label>
              <Input
                id="issueNumber"
                placeholder="e.g., 13"
                value={formData.issueNumber}
                onChange={(e) => updateFormField('issueNumber', e.target.value)}
              />
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="title">Series/Title <span className="text-destructive">*</span></Label>
              <div className="flex gap-2">
                <Input
                  id="title"
                  placeholder="e.g., X-Men"
                  value={formData.title}
                  onChange={(e) => updateFormField('title', e.target.value)}
                  className="flex-1"
                />
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleSearch}
                  disabled={!formData.title}
                  className="shrink-0"
                >
                  <Search className="h-4 w-4 mr-2" />
                  Search
                </Button>
              </div>
            </div>

            <div>
              <Label htmlFor="year">Year</Label>
              <Input
                id="year"
                placeholder="e.g., 1964"
                maxLength={4}
                value={formData.year}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '');
                  updateFormField('year', value);
                }}
              />
            </div>

            <div>
              <Label htmlFor="condition">Condition</Label>
              <Select value={formData.condition} onValueChange={(value) => updateFormField('condition', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Near Mint">Near Mint</SelectItem>
                  <SelectItem value="Very Fine">Very Fine</SelectItem>
                  <SelectItem value="Fine">Fine</SelectItem>
                  <SelectItem value="Very Good">Very Good</SelectItem>
                  <SelectItem value="Good">Good</SelectItem>
                  <SelectItem value="Fair">Fair</SelectItem>
                  <SelectItem value="Poor">Poor</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="price">Price <span className="text-destructive">*</span></Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                placeholder="Selling price"
                value={formData.price}
                onChange={(e) => updateFormField('price', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="cost">Cost (70% auto) <span className="text-destructive">*</span></Label>
              <Input
                id="cost"
                type="number"
                step="0.01"
                placeholder="Cost"
                value={formData.cost}
                onChange={(e) => updateFormField('cost', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                value={formData.quantity}
                onChange={(e) => updateFormField('quantity', parseInt(e.target.value) || 1)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="processingNotes">Processing Notes (Optional)</Label>
            <Textarea
              id="processingNotes"
              placeholder="Add any notes about this comic..."
              value={formData.processingNotes}
              onChange={(e) => updateFormField('processingNotes', e.target.value)}
              rows={3}
            />
          </div>

          <Button 
            onClick={handleSubmit} 
            disabled={submitting}
            className="w-full"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Adding to Batch...
              </>
            ) : (
              'Add to Batch'
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
