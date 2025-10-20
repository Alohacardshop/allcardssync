import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Trash2, Plus, Edit2, GripVertical, Check, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface MainCategory {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
}

interface SubCategory {
  id: string;
  main_category_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
}

export function CategoryManagement() {
  const [selectedMainCategory, setSelectedMainCategory] = useState<string>("tcg");
  const [editingSubCategory, setEditingSubCategory] = useState<SubCategory | null>(null);
  const [newSubCategoryName, setNewSubCategoryName] = useState("");
  const [bulkAddDialog, setBulkAddDialog] = useState(false);
  const [bulkAddText, setBulkAddText] = useState("");
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });

  const queryClient = useQueryClient();

  // Fetch main categories
  const { data: mainCategories } = useQuery({
    queryKey: ["main-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("main_categories")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as MainCategory[];
    },
  });

  // Fetch sub-categories for selected main category
  const { data: subCategories, isLoading: loadingSubCategories } = useQuery({
    queryKey: ["sub-categories", selectedMainCategory],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sub_categories")
        .select("*")
        .eq("main_category_id", selectedMainCategory)
        .order("sort_order");
      if (error) throw error;
      return data as SubCategory[];
    },
    enabled: !!selectedMainCategory,
  });

  // Add sub-category mutation
  const addSubCategoryMutation = useMutation({
    mutationFn: async (name: string) => {
      const maxSortOrder = subCategories?.reduce((max, cat) => Math.max(max, cat.sort_order), 0) || 0;
      const { error } = await supabase.from("sub_categories").insert({
        main_category_id: selectedMainCategory,
        name: name.trim(),
        sort_order: maxSortOrder + 1,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sub-categories", selectedMainCategory] });
      setNewSubCategoryName("");
      toast.success("Sub-category added successfully");
    },
    onError: (error: any) => {
      toast.error(`Failed to add sub-category: ${error.message}`);
    },
  });

  // Update sub-category mutation
  const updateSubCategoryMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<SubCategory> }) => {
      const { error } = await supabase
        .from("sub_categories")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sub-categories", selectedMainCategory] });
      setEditingSubCategory(null);
      toast.success("Sub-category updated successfully");
    },
    onError: (error: any) => {
      toast.error(`Failed to update sub-category: ${error.message}`);
    },
  });

  // Delete sub-category mutation
  const deleteSubCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sub_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sub-categories", selectedMainCategory] });
      setDeleteDialog({ open: false, id: null });
      toast.success("Sub-category deleted successfully");
    },
    onError: (error: any) => {
      toast.error(`Failed to delete sub-category: ${error.message}`);
    },
  });

  // Bulk add mutation
  const bulkAddMutation = useMutation({
    mutationFn: async (names: string[]) => {
      const maxSortOrder = subCategories?.reduce((max, cat) => Math.max(max, cat.sort_order), 0) || 0;
      const newCategories = names.map((name, index) => ({
        main_category_id: selectedMainCategory,
        name: name.trim(),
        sort_order: maxSortOrder + index + 1,
        is_active: true,
      }));
      const { error } = await supabase.from("sub_categories").insert(newCategories);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sub-categories", selectedMainCategory] });
      setBulkAddDialog(false);
      setBulkAddText("");
      toast.success("Sub-categories added successfully");
    },
    onError: (error: any) => {
      toast.error(`Failed to bulk add: ${error.message}`);
    },
  });

  const handleAddSubCategory = () => {
    if (!newSubCategoryName.trim()) {
      toast.error("Please enter a category name");
      return;
    }
    addSubCategoryMutation.mutate(newSubCategoryName);
  };

  const handleBulkAdd = () => {
    const names = bulkAddText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    
    if (names.length === 0) {
      toast.error("Please enter at least one category name");
      return;
    }
    
    bulkAddMutation.mutate(names);
  };

  const handleToggleActive = (id: string, currentActive: boolean) => {
    updateSubCategoryMutation.mutate({
      id,
      updates: { is_active: !currentActive },
    });
  };

  const selectedCategory = mainCategories?.find((c) => c.id === selectedMainCategory);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Category Management</CardTitle>
          <CardDescription>
            Manage inventory categories and sub-categories for TCG, Sports, and Comics.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={selectedMainCategory} onValueChange={setSelectedMainCategory}>
            <TabsList className="grid w-full grid-cols-3">
              {mainCategories?.map((cat) => (
                <TabsTrigger key={cat.id} value={cat.id}>
                  {cat.icon} {cat.name}
                </TabsTrigger>
              ))}
            </TabsList>

            {mainCategories?.map((cat) => (
              <TabsContent key={cat.id} value={cat.id} className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">
                      {cat.icon} {cat.name} Sub-Categories
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {subCategories?.length || 0} sub-categories
                    </p>
                  </div>
                  <Button onClick={() => setBulkAddDialog(true)} variant="outline" size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Bulk Add
                  </Button>
                </div>

                {/* Add new sub-category */}
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      placeholder="Enter new sub-category name..."
                      value={newSubCategoryName}
                      onChange={(e) => setNewSubCategoryName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddSubCategory();
                      }}
                    />
                  </div>
                  <Button
                    onClick={handleAddSubCategory}
                    disabled={!newSubCategoryName.trim() || addSubCategoryMutation.isPending}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add
                  </Button>
                </div>

                {/* Sub-categories list */}
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {loadingSubCategories ? (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  ) : subCategories && subCategories.length > 0 ? (
                    subCategories.map((subCat) => (
                      <Card key={subCat.id}>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-3">
                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                            
                            {editingSubCategory?.id === subCat.id ? (
                              <Input
                                value={editingSubCategory.name}
                                onChange={(e) =>
                                  setEditingSubCategory({ ...editingSubCategory, name: e.target.value })
                                }
                                className="flex-1"
                                autoFocus
                              />
                            ) : (
                              <span className="flex-1 font-medium">{subCat.name}</span>
                            )}

                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={subCat.is_active}
                                  onCheckedChange={() => handleToggleActive(subCat.id, subCat.is_active)}
                                />
                                <span className="text-xs text-muted-foreground">
                                  {subCat.is_active ? "Active" : "Inactive"}
                                </span>
                              </div>

                              {editingSubCategory?.id === subCat.id ? (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      updateSubCategoryMutation.mutate({
                                        id: subCat.id,
                                        updates: { name: editingSubCategory.name },
                                      });
                                    }}
                                  >
                                    <Check className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setEditingSubCategory(null)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setEditingSubCategory(subCat)}
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setDeleteDialog({ open: true, id: subCat.id })}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No sub-categories yet. Add one above!</p>
                  )}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* Bulk Add Dialog */}
      <Dialog open={bulkAddDialog} onOpenChange={setBulkAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Add Sub-Categories</DialogTitle>
            <DialogDescription>
              Enter one sub-category name per line. They will be added to {selectedCategory?.name}.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Category 1&#10;Category 2&#10;Category 3"
            value={bulkAddText}
            onChange={(e) => setBulkAddText(e.target.value)}
            rows={10}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleBulkAdd} disabled={bulkAddMutation.isPending}>
              Add Categories
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ open, id: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Sub-Category</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this sub-category? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog({ open: false, id: null })}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteDialog.id) {
                  deleteSubCategoryMutation.mutate(deleteDialog.id);
                }
              }}
              disabled={deleteSubCategoryMutation.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
