import React, { useState, useRef, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Plus, Check, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface TagEditorProps {
  itemId: string;
  currentTags: string[];
  normalizedTags?: string[];
  shopifyProductId?: string | null;
  storeKey?: string | null;
  onTagsUpdated?: () => void;
  className?: string;
}

// Common tags for autocomplete
const SUGGESTED_TAGS = [
  'pokemon', 'sports', 'baseball', 'basketball', 'football',
  'graded', 'psa', 'cgc', 'bgs', 'raw', 'sealed',
  'tcg', 'yugioh', 'mtg', 'one-piece', 'comics'
];

export function TagEditor({ 
  itemId, 
  currentTags = [], 
  normalizedTags = [],
  shopifyProductId,
  storeKey,
  onTagsUpdated,
  className 
}: TagEditorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tags, setTags] = useState<string[]>(currentTags);
  const [newTag, setNewTag] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncingToShopify, setIsSyncingToShopify] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Reset tags when popover opens
  useEffect(() => {
    if (isOpen) {
      setTags(currentTags);
    }
  }, [isOpen, currentTags]);

  const filteredSuggestions = SUGGESTED_TAGS.filter(
    tag => 
      tag.toLowerCase().includes(newTag.toLowerCase()) && 
      !tags.includes(tag)
  ).slice(0, 5);

  const handleAddTag = (tagToAdd?: string) => {
    const tag = (tagToAdd || newTag).trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // 1. Save to local database
      const { error } = await supabase
        .from('intake_items')
        .update({ 
          shopify_tags: tags,
          updated_at: new Date().toISOString()
        })
        .eq('id', itemId);

      if (error) throw error;

      // 2. If synced to Shopify, push tags there too
      if (shopifyProductId && storeKey) {
        setIsSyncingToShopify(true);
        try {
          const { error: shopifyError } = await supabase.functions.invoke('shopify-tag-manager', {
            body: {
              action: 'replace',
              tags: tags,
              productId: shopifyProductId,
              storeKey: storeKey
            }
          });
          if (shopifyError) throw shopifyError;
          toast.success('Tags synced to Shopify');
        } catch (shopifyErr: any) {
          toast.warning('Tags saved locally, but Shopify sync failed');
          console.error('Shopify tag sync failed:', shopifyErr);
        } finally {
          setIsSyncingToShopify(false);
        }
      } else {
        toast.success('Tags updated');
      }
      
      setIsOpen(false);
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['inventory-list'] });
      queryClient.invalidateQueries({ queryKey: ['shopify-tags'] });
      
      onTagsUpdated?.();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update tags');
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = JSON.stringify(tags.sort()) !== JSON.stringify(currentTags.sort());

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className={cn("h-auto py-1 px-2 text-xs", className)}
        >
          <Plus className="h-3 w-3 mr-1" />
          Edit Tags
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <div className="space-y-3">
          <div className="font-medium text-sm">Edit Tags</div>
          
          {/* Current tags */}
          <div className="flex flex-wrap gap-1 min-h-[32px] p-2 border rounded-md bg-muted/30">
            {tags.length === 0 ? (
              <span className="text-xs text-muted-foreground">No tags yet</span>
            ) : (
              tags.map((tag) => (
                <Badge 
                  key={tag} 
                  variant="secondary" 
                  className="text-xs gap-1 pr-1"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="ml-1 hover:bg-muted rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))
            )}
          </div>

          {/* Add new tag */}
          <div className="relative">
            <div className="flex gap-1">
              <Input
                ref={inputRef}
                value={newTag}
                onChange={(e) => {
                  setNewTag(e.target.value);
                  setShowSuggestions(e.target.value.length > 0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                onFocus={() => setShowSuggestions(newTag.length > 0)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="Add a tag..."
                className="h-8 text-xs"
              />
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => handleAddTag()}
                disabled={!newTag.trim()}
                className="h-8 px-2"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Suggestions dropdown */}
            {showSuggestions && filteredSuggestions.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-popover border rounded-md shadow-md">
                {filteredSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => handleAddTag(suggestion)}
                    className="w-full px-3 py-1.5 text-left text-xs hover:bg-accent"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick add common tags */}
          <div className="flex flex-wrap gap-1">
            <span className="text-xs text-muted-foreground mr-1">Quick add:</span>
            {SUGGESTED_TAGS.slice(0, 6).filter(t => !tags.includes(t)).map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => handleAddTag(tag)}
                className="text-xs text-primary hover:underline"
              >
                +{tag}
              </button>
            ))}
          </div>

          {/* Normalized tags display */}
          {normalizedTags.length > 0 && (
            <div className="border-t pt-2">
              <div className="text-xs text-muted-foreground mb-1">Normalized tags:</div>
              <div className="flex flex-wrap gap-1">
                {normalizedTags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-[10px]">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="h-7 text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!hasChanges || isSaving || isSyncingToShopify}
              className="h-7 text-xs"
            >
              {isSaving || isSyncingToShopify ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  {isSyncingToShopify ? 'Syncing to Shopify...' : 'Saving...'}
                </>
              ) : (
                <>
                  <Check className="h-3 w-3 mr-1" />
                  {shopifyProductId ? 'Save & Sync' : 'Save Tags'}
                </>
              )}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
