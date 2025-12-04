import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { Json } from '@/integrations/supabase/types';
import { Plus, Save, Trash2, GripVertical, ChevronDown, Link2, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { usePrinter } from '@/hooks/usePrinter';
import { applyFieldMappings, type FieldMappings as ApplyFieldMappings } from '@/lib/labels/applyFieldMappings';
import { zplFromElements } from '@/lib/labels/zpl';
import type { LabelLayout } from '@/lib/labels/types';

// Label fields that can be mapped
const LABEL_FIELDS = ['title', 'sku', 'price', 'condition', 'barcode', 'set', 'cardNumber', 'year', 'vendor'] as const;
type LabelField = typeof LABEL_FIELDS[number];

// Shopify/intake_items source fields available for mapping
const SOURCE_FIELDS = [
  { value: 'brand_title', label: 'Brand Title (Full: "2022 POKEMON SWORD & SHIELD...")' },
  { value: 'subject', label: 'Subject (Short: "FA/GIRATINA V")' },
  { value: 'sku', label: 'SKU' },
  { value: 'price', label: 'Price' },
  { value: 'grade', label: 'Grade/Condition' },
  { value: 'card_number', label: 'Card Number' },
  { value: 'year', label: 'Year' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'category', label: 'Category' },
  { value: 'type', label: 'Type' },
  { value: 'variant', label: 'Variant' },
  { value: 'lot_number', label: 'Lot Number' },
];

// Example Pokemon raw product for live preview
const EXAMPLE_PRODUCT: Record<string, string> = {
  brand_title: '2022 POKEMON SWORD & SHIELD LOST ORIGIN FA/GIRATINA V #186 PSA 10',
  subject: 'FA/GIRATINA V',
  sku: '97678908',
  price: '2200.00',
  grade: '10',
  card_number: '186',
  year: '2022',
  vendor: 'Josh',
  category: 'graded',
  type: 'Graded',
  variant: '',
  lot_number: 'LOT-001',
};

// Default condition abbreviations
const DEFAULT_CONDITION_ABBREVS: Record<string, string> = {
  'Near Mint': 'NM',
  'Lightly Played': 'LP',
  'Moderately Played': 'MP',
  'Heavily Played': 'HP',
  'Damaged': 'DMG',
  'Near Mint Foil': 'NM-F',
  'Lightly Played Foil': 'LP-F',
};

interface FieldMapping {
  source: string;
  source2?: string; // Secondary source for title field (combines with separator)
  separator?: string; // Separator between source and source2 (default: " - ")
  format?: 'currency' | 'uppercase' | 'lowercase';
  abbreviate?: boolean;
  abbreviations?: Record<string, string>;
}

interface FieldMappings {
  [key: string]: FieldMapping;
}

interface PrintProfile {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
  priority: number;
  match_type?: string;
  match_category?: string;
  match_tags?: string[];
  template_id?: string;
  copies?: number;
  speed?: number;
  darkness?: number;
  add_tags?: string[];
  remove_tags?: string[];
  field_mappings?: FieldMappings;
  created_at: string;
  updated_at: string;
}

export default function PrintProfileManager() {
  const [profiles, setProfiles] = useState<PrintProfile[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [editingProfile, setEditingProfile] = useState<Partial<PrintProfile> | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPrinting, setIsPrinting] = useState(false);
  
  const { printer, print } = usePrinter();

  useEffect(() => {
    fetchProfiles();
    fetchTemplates();
  }, []);

  const fetchProfiles = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('print_profiles')
        .select('*')
        .order('priority', { ascending: true });

      if (error) throw error;
      // Cast field_mappings from Json to FieldMappings
      const typedProfiles = (data || []).map(p => ({
        ...p,
        field_mappings: p.field_mappings as unknown as FieldMappings | undefined,
      }));
      setProfiles(typedProfiles);
    } catch (error) {
      console.error('Failed to fetch profiles:', error);
      toast.error('Failed to load print profiles');
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('label_templates')
        .select('id, name')
        .order('name');

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Failed to fetch templates:', error);
    }
  };

  const handleSaveProfile = async () => {
    if (!editingProfile?.name) {
      toast.error('Profile name is required');
      return;
    }

    // Prepare payload with proper type casting for Supabase
    const payload = {
      ...editingProfile,
      field_mappings: editingProfile.field_mappings as unknown as Json,
    };

    try {
      if (editingProfile.id) {
        const { error } = await supabase
          .from('print_profiles')
          .update({
            ...payload,
            updated_at: new Date().toISOString(),
          } as any)
          .eq('id', editingProfile.id);

        if (error) throw error;
        toast.success('Profile updated');
      } else {
        const { error } = await supabase
          .from('print_profiles')
          .insert([{
            ...payload,
            name: editingProfile.name!,
            priority: profiles.length,
          } as any]);

        if (error) throw error;
        toast.success('Profile created');
      }

      setEditingProfile(null);
      fetchProfiles();
    } catch (error) {
      console.error('Failed to save profile:', error);
      toast.error('Failed to save profile');
    }
  };

  const handleDeleteProfile = async (id: string) => {
    if (!confirm('Delete this print profile?')) return;

    try {
      const { error } = await supabase
        .from('print_profiles')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Profile deleted');
      fetchProfiles();
    } catch (error) {
      console.error('Failed to delete profile:', error);
      toast.error('Failed to delete profile');
    }
  };

  const handleUpdatePriority = async (id: string, newPriority: number) => {
    try {
      const { error } = await supabase
        .from('print_profiles')
        .update({ priority: newPriority })
        .eq('id', id);

      if (error) throw error;
      fetchProfiles();
    } catch (error) {
      console.error('Failed to update priority:', error);
      toast.error('Failed to update priority');
    }
  };

  const handlePrintTest = async () => {
    if (!editingProfile?.template_id) {
      toast.error('Select a template first');
      return;
    }
    if (!printer) {
      toast.error('No printer configured. Go to Printer Settings tab.');
      return;
    }

    setIsPrinting(true);
    try {
      // Get the template
      const template = templates.find(t => t.id === editingProfile.template_id);
      if (!template) {
        toast.error('Template not found');
        return;
      }

      // Fetch full template with canvas data
      const { data: fullTemplate, error } = await supabase
        .from('label_templates')
        .select('*')
        .eq('id', editingProfile.template_id)
        .single();

      if (error || !fullTemplate?.canvas) {
        toast.error('Failed to load template');
        return;
      }

      // Apply field mappings to example product
      const mappings = editingProfile.field_mappings as ApplyFieldMappings | undefined;
      const labelData = applyFieldMappings(EXAMPLE_PRODUCT, mappings);

      // Get ZPL from template - handle both raw ZPL and element-based templates
      const canvas = fullTemplate.canvas as Record<string, unknown>;
      let zpl: string;
      
      if (canvas?.zplLabel && typeof canvas.zplLabel === 'string') {
        // Template uses raw ZPL with {{FIELD}} placeholders
        zpl = canvas.zplLabel
          .replace(/\{\{CONDITION\}\}/g, labelData.condition || '')
          .replace(/\{\{PRICE\}\}/g, labelData.price || '')
          .replace(/\{\{BARCODE\}\}/g, labelData.barcode || '')
          .replace(/\{\{SKU\}\}/g, labelData.sku || '')
          .replace(/\{\{SETNAME\}\}/g, labelData.set || '')
          .replace(/\{\{CARDNAME\}\}/g, labelData.title || '')
          .replace(/\{\{CARDNUMBER\}\}/g, labelData.cardNumber || '')
          .replace(/\{\{YEAR\}\}/g, labelData.year || '')
          .replace(/\{\{VENDOR\}\}/g, labelData.vendor || '');
      } else if (canvas?.elements && Array.isArray(canvas.elements)) {
        // Element-based template - use zplFromElements
        const layout = canvas as unknown as LabelLayout;
        zpl = zplFromElements(layout);
      } else {
        toast.error('Unsupported template format');
        return;
      }
      
      // Print
      const result = await print(zpl, 1);
      if (result.success) {
        toast.success('Test label printed!');
      } else {
        toast.error(result.error || 'Print failed');
      }
    } catch (err) {
      console.error('Print test failed:', err);
      toast.error('Failed to print test label');
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Print Profiles</h3>
        <Button onClick={() => setEditingProfile({ is_active: true, priority: profiles.length })}>
          <Plus className="h-4 w-4 mr-2" />
          New Profile
        </Button>
      </div>

      {editingProfile && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle>{editingProfile.id ? 'Edit Profile' : 'New Profile'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Profile Name *</Label>
                <Input
                  value={editingProfile.name || ''}
                  onChange={(e) => setEditingProfile({ ...editingProfile, name: e.target.value })}
                  placeholder="e.g., Graded Cards - High Priority"
                />
              </div>
              <div className="space-y-2">
                <Label>Template</Label>
                <Select
                  value={editingProfile.template_id || ''}
                  onValueChange={(value) => setEditingProfile({ ...editingProfile, template_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={editingProfile.description || ''}
                onChange={(e) => setEditingProfile({ ...editingProfile, description: e.target.value })}
                placeholder="Describe when this profile should be used"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Match Type</Label>
                <Input
                  value={editingProfile.match_type || ''}
                  onChange={(e) => setEditingProfile({ ...editingProfile, match_type: e.target.value })}
                  placeholder="e.g., Graded"
                />
              </div>
              <div className="space-y-2">
                <Label>Match Category</Label>
                <Input
                  value={editingProfile.match_category || ''}
                  onChange={(e) => setEditingProfile({ ...editingProfile, match_category: e.target.value })}
                  placeholder="e.g., Sports Cards"
                />
              </div>
              <div className="space-y-2">
                <Label>Match Tags (comma separated)</Label>
                <Input
                  value={editingProfile.match_tags?.join(', ') || ''}
                  onChange={(e) => setEditingProfile({ 
                    ...editingProfile, 
                    match_tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean)
                  })}
                  placeholder="e.g., psa, high-value"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Copies</Label>
                <Input
                  type="number"
                  min="1"
                  value={editingProfile.copies || 1}
                  onChange={(e) => setEditingProfile({ ...editingProfile, copies: parseInt(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Speed (2-6 IPS)</Label>
                <Input
                  type="number"
                  min="2"
                  max="6"
                  value={editingProfile.speed || 4}
                  onChange={(e) => setEditingProfile({ ...editingProfile, speed: parseInt(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Darkness (0-30)</Label>
                <Input
                  type="number"
                  min="0"
                  max="30"
                  value={editingProfile.darkness || 10}
                  onChange={(e) => setEditingProfile({ ...editingProfile, darkness: parseInt(e.target.value) })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Add Tags After Print (comma separated)</Label>
                <Input
                  value={editingProfile.add_tags?.join(', ') || 'printed'}
                  onChange={(e) => setEditingProfile({ 
                    ...editingProfile, 
                    add_tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean)
                  })}
                  placeholder="e.g., printed, ready-to-ship"
                />
              </div>
              <div className="space-y-2">
                <Label>Remove Tags After Print (comma separated)</Label>
                <Input
                  value={editingProfile.remove_tags?.join(', ') || ''}
                  onChange={(e) => setEditingProfile({ 
                    ...editingProfile, 
                    remove_tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean)
                  })}
                  placeholder="e.g., needs-label"
                />
              </div>
            </div>

            {/* Field Mappings Section */}
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  <span className="flex items-center gap-2">
                    <Link2 className="h-4 w-4" />
                    Field Mappings (Shopify → Label)
                  </span>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Map Shopify product fields to label fields. Condition can be abbreviated (Near Mint → NM).
                </p>
                {LABEL_FIELDS.map((labelField) => {
                  const mapping = editingProfile.field_mappings?.[labelField] || { source: '' };
                  return (
                    <div key={labelField} className="flex items-center gap-3 p-2 rounded border bg-muted/30 flex-wrap">
                      <span className="w-24 text-sm font-medium capitalize">{labelField}</span>
                      <span className="text-muted-foreground">←</span>
                      <Select
                        value={mapping.source || ''}
                        onValueChange={(value) => {
                          const newMappings = {
                            ...editingProfile.field_mappings,
                            [labelField]: { ...mapping, source: value },
                          };
                          setEditingProfile({ ...editingProfile, field_mappings: newMappings });
                        }}
                      >
                        <SelectTrigger className="w-[200px]">
                          <SelectValue placeholder="Select source field" />
                        </SelectTrigger>
                        <SelectContent>
                          {SOURCE_FIELDS.map((sf) => (
                            <SelectItem key={sf.value} value={sf.value}>
                              {sf.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      
                      {/* Title field gets a second source dropdown */}
                      {labelField === 'title' && (
                        <>
                          <Input
                            className="w-16 text-center"
                            value={mapping.separator ?? ' - '}
                            onChange={(e) => {
                              const newMappings = {
                                ...editingProfile.field_mappings,
                                [labelField]: { ...mapping, separator: e.target.value },
                              };
                              setEditingProfile({ ...editingProfile, field_mappings: newMappings });
                            }}
                            placeholder="sep"
                            title="Separator between fields"
                          />
                          <Select
                            value={mapping.source2 || '_none'}
                            onValueChange={(value) => {
                              const newMappings = {
                                ...editingProfile.field_mappings,
                                [labelField]: { ...mapping, source2: value === '_none' ? undefined : value },
                              };
                              setEditingProfile({ ...editingProfile, field_mappings: newMappings });
                            }}
                          >
                            <SelectTrigger className="w-[200px]">
                              <SelectValue placeholder="+ Second field (optional)" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none">None</SelectItem>
                              {SOURCE_FIELDS.map((sf) => (
                                <SelectItem key={sf.value} value={sf.value}>
                                  {sf.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </>
                      )}
                      
                      {labelField === 'condition' && (
                        <div className="flex items-center gap-2 ml-2">
                          <Switch
                            checked={mapping.abbreviate ?? true}
                            onCheckedChange={(checked) => {
                              const newMappings = {
                                ...editingProfile.field_mappings,
                                [labelField]: { 
                                  ...mapping, 
                                  abbreviate: checked,
                                  abbreviations: checked ? DEFAULT_CONDITION_ABBREVS : undefined,
                                },
                              };
                              setEditingProfile({ ...editingProfile, field_mappings: newMappings });
                            }}
                          />
                          <span className="text-xs text-muted-foreground">Abbreviate</span>
                        </div>
                      )}
                      
                      {labelField === 'price' && (
                        <span className="text-xs text-muted-foreground ml-2">Format: $X.XX</span>
                      )}
                    </div>
                  );
                })}
                
                <div className="pt-2 text-xs text-muted-foreground">
                  <strong>Condition abbreviations:</strong> Near Mint→NM, Lightly Played→LP, Moderately Played→MP, Heavily Played→HP, Damaged→DMG
                  <br /><strong>PSA Grades:</strong> 10→PSA 10, 9→PSA 9, etc.
                </div>
                
                {/* Live Preview */}
                <div className="mt-4 p-3 bg-muted/50 rounded-lg border">
                  <p className="text-xs font-semibold mb-2">Live Preview (Pokemon PSA 10 Example):</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {LABEL_FIELDS.map(labelField => {
                      const mapping = editingProfile.field_mappings?.[labelField];
                      if (!mapping?.source) return null;
                      let value = EXAMPLE_PRODUCT[mapping.source] || '';
                      
                      // Combine with second source for title
                      if (labelField === 'title' && mapping.source2) {
                        const value2 = EXAMPLE_PRODUCT[mapping.source2] || '';
                        if (value2) {
                          value = value + (mapping.separator ?? ' - ') + value2;
                        }
                      }
                      
                      // Apply formatting
                      if (mapping.format === 'currency' && value) {
                        value = `$${parseFloat(value).toFixed(2)}`;
                      }
                      if (mapping.abbreviate && value) {
                        const gradeAbbrevs: Record<string, string> = { '10': 'PSA 10', '9': 'PSA 9', '8': 'PSA 8', '7': 'PSA 7' };
                        value = gradeAbbrevs[value] || DEFAULT_CONDITION_ABBREVS[value] || value;
                      }
                      
                      return (
                        <div key={labelField} className="flex justify-between py-0.5">
                          <span className="text-muted-foreground capitalize">{labelField}:</span>
                          <span className="font-mono text-foreground truncate max-w-[180px]" title={value}>{value || '—'}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            <div className="flex items-center space-x-2">
              <Switch
                checked={editingProfile.is_active}
                onCheckedChange={(checked) => setEditingProfile({ ...editingProfile, is_active: checked })}
              />
              <Label>Active</Label>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSaveProfile}>
                <Save className="h-4 w-4 mr-2" />
                Save Profile
              </Button>
              <Button 
                variant="secondary" 
                onClick={handlePrintTest}
                disabled={isPrinting || !editingProfile.template_id}
              >
                <Printer className="h-4 w-4 mr-2" />
                {isPrinting ? 'Printing...' : 'Print Test Label'}
              </Button>
              <Button variant="outline" onClick={() => setEditingProfile(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {loading ? (
          <Card>
            <CardContent className="py-8">
              <div className="text-center text-muted-foreground">Loading profiles...</div>
            </CardContent>
          </Card>
        ) : profiles.length === 0 ? (
          <Card>
            <CardContent className="py-8">
              <div className="text-center text-muted-foreground">
                No print profiles yet. Create one to automate your printing workflow!
              </div>
            </CardContent>
          </Card>
        ) : (
          profiles.map((profile, index) => (
            <Card key={profile.id} className={!profile.is_active ? 'opacity-50' : ''}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="flex flex-col gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={index === 0}
                      onClick={() => handleUpdatePriority(profile.id, profile.priority - 1)}
                    >
                      ↑
                    </Button>
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={index === profiles.length - 1}
                      onClick={() => handleUpdatePriority(profile.id, profile.priority + 1)}
                    >
                      ↓
                    </Button>
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{profile.name}</span>
                      {!profile.is_active && (
                        <span className="text-xs text-muted-foreground">(Inactive)</span>
                      )}
                    </div>
                    {profile.description && (
                      <div className="text-sm text-muted-foreground">{profile.description}</div>
                    )}
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {profile.match_type && <span>Type: {profile.match_type}</span>}
                      {profile.match_category && <span>Category: {profile.match_category}</span>}
                      {profile.match_tags && profile.match_tags.length > 0 && (
                        <span>Tags: {profile.match_tags.join(', ')}</span>
                      )}
                      {profile.copies && <span>Copies: {profile.copies}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingProfile(profile)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeleteProfile(profile.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
