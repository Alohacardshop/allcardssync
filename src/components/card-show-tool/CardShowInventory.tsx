import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Send, Package, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function CardShowInventory() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [gradingServiceFilter, setGradingServiceFilter] = useState<string>("");
  const [gradeFilter, setGradeFilter] = useState<string>("");

  // Fetch show inventory items (status = 'in_show_inventory')
  const { data: items = [], isLoading, refetch } = useQuery({
    queryKey: ['alt_items', 'show_inventory'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('alt_items')
        .select('*')
        .eq('status', 'in_show_inventory')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
  });

  // Send to main inventory mutation
  const sendToMainInventoryMutation = useMutation({
    mutationFn: async (itemIds: string[]) => {
      // For each item, insert into intake_items and update status
      const promises = itemIds.map(async (itemId) => {
        const item = items.find((i: any) => i.id === itemId);
        if (!item) return;

        // Insert into intake_items
        const { error: insertError } = await supabase
          .from('intake_items')
          .insert({
            type: 'Graded',
            grading_company: item.grading_service || 'PSA',
            psa_cert: item.grading_service === 'PSA' ? item.alt_uuid : null,
            grade: item.grade,
            year: item.year,
            brand_title: item.title,
            category: 'Sports Cards',
            image_urls: item.image_url ? [item.image_url] : null,
            price: item.alt_value ? Number(item.alt_value) : null,
          });

        if (insertError) throw insertError;

        // Update status in alt_items
        const { error: updateError } = await supabase
          .from('alt_items')
          .update({ status: 'sold' })
          .eq('id', itemId);

        if (updateError) throw updateError;
      });

      await Promise.all(promises);
    },
    onSuccess: () => {
      toast.success('Items sent to main inventory');
      queryClient.invalidateQueries({ queryKey: ['alt_items', 'show_inventory'] });
    },
    onError: (error) => {
      console.error('Error sending to main inventory:', error);
      toast.error('Failed to send items to main inventory');
    },
  });

  // Return to available mutation
  const returnToAvailableMutation = useMutation({
    mutationFn: async (itemIds: string[]) => {
      const { error } = await supabase
        .from('alt_items')
        .update({ status: 'available' })
        .in('id', itemIds);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Items returned to available');
      queryClient.invalidateQueries({ queryKey: ['alt_items', 'show_inventory'] });
    },
    onError: (error) => {
      console.error('Error returning to available:', error);
      toast.error('Failed to return items');
    },
  });

  const filteredItems = items.filter((item: any) => {
    const matchesSearch = !searchTerm || 
      item.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.grade?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.alt_uuid?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesGradingService = !gradingServiceFilter || item.grading_service === gradingServiceFilter;
    const matchesGrade = !gradeFilter || item.grade === gradeFilter;

    return matchesSearch && matchesGradingService && matchesGrade;
  });

  const uniqueGradingServices = [...new Set(items.map((item: any) => item.grading_service).filter(Boolean))];
  const uniqueGrades = [...new Set(items.map((item: any) => item.grade).filter(Boolean))];

  const clearFilters = () => {
    setSearchTerm("");
    setGradingServiceFilter("");
    setGradeFilter("");
  };

  const hasActiveFilters = searchTerm || gradingServiceFilter || gradeFilter;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading show inventory...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Show Inventory</h2>
          <Badge variant="secondary">{filteredItems.length} items</Badge>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by title, grade, or cert..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        {uniqueGradingServices.length > 0 && (
          <Select value={gradingServiceFilter} onValueChange={setGradingServiceFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Grading Service" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value=" ">All Services</SelectItem>
              {uniqueGradingServices.map((service) => (
                <SelectItem key={service} value={service}>{service}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {uniqueGrades.length > 0 && (
          <Select value={gradeFilter} onValueChange={setGradeFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Grade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value=" ">All Grades</SelectItem>
              {uniqueGrades.map((grade) => (
                <SelectItem key={grade} value={grade}>{grade}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {hasActiveFilters && (
          <Button onClick={clearFilters} variant="ghost" size="sm">
            <X className="h-4 w-4 mr-1" />
            Clear Filters
          </Button>
        )}
      </div>

      {/* Items Grid */}
      {filteredItems.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-12">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              {hasActiveFilters ? 'No items match your filters' : 'No items in show inventory'}
            </p>
            {hasActiveFilters && (
              <Button onClick={clearFilters} variant="link" className="mt-2">
                Clear filters
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((item: any) => (
            <Card key={item.id} className="overflow-hidden">
              <CardContent className="p-4">
                {item.image_url && (
                  <img 
                    src={item.image_url} 
                    alt={item.title || 'Card'} 
                    className="w-full h-48 object-contain mb-3 rounded"
                  />
                )}
                
                <div className="space-y-2">
                  <h3 className="font-semibold line-clamp-2">{item.title || 'Untitled'}</h3>
                  
                  <div className="flex items-center gap-2 flex-wrap">
                    {item.grading_service && (
                      <Badge variant="outline">{item.grading_service}</Badge>
                    )}
                    {item.grade && (
                      <Badge>{item.grade}</Badge>
                    )}
                  </div>

                  {item.alt_value && (
                    <p className="text-lg font-bold text-primary">
                      ${Number(item.alt_value).toFixed(2)}
                    </p>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button
                      onClick={() => sendToMainInventoryMutation.mutate([item.id])}
                      disabled={sendToMainInventoryMutation.isPending}
                      size="sm"
                      className="flex-1"
                    >
                      <Send className="h-4 w-4 mr-1" />
                      To Main Inventory
                    </Button>
                    <Button
                      onClick={() => returnToAvailableMutation.mutate([item.id])}
                      disabled={returnToAvailableMutation.isPending}
                      variant="outline"
                      size="sm"
                    >
                      Return
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
