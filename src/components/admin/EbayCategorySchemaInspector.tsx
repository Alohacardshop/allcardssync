import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Search, CheckCircle, AlertCircle, Info, FolderTree, Leaf, ArrowRight } from 'lucide-react';
import { EbayCategorySelect } from './EbayCategorySelect';

interface ConditionInfo {
  conditionId: string;
  conditionDescription: string;
}

interface AspectInfo {
  name: string;
  mode: string;
  allowedValues: string[];
  maxValues: number;
}

interface SchemaResult {
  categoryId: string;
  marketplaceId: string;
  fetchedAt: string;
  conditions: ConditionInfo[];
  requiredAspects: AspectInfo[];
  optionalAspects: AspectInfo[];
  summary: {
    totalConditions: number;
    totalAspects: number;
    requiredAspectCount: number;
    optionalAspectCount: number;
  };
}

interface SubtreeCategory {
  categoryId: string;
  categoryName: string;
  isLeaf: boolean;
  childCount: number;
  parentId: string | null;
}

interface SubtreeResult {
  treeId: string;
  marketplace: string;
  rootCategoryId: string;
  categories: SubtreeCategory[];
  totalCategories: number;
  leafCategories: number;
}

interface Props {
  storeKey?: string;
}

export function EbayCategorySchemaInspector({ storeKey }: Props) {
  const [categoryId, setCategoryId] = useState('');
  const [loading, setLoading] = useState(false);
  const [subtreeLoading, setSubtreeLoading] = useState(false);
  const [schema, setSchema] = useState<SchemaResult | null>(null);
  const [subtree, setSubtree] = useState<SubtreeResult | null>(null);
  const [subtreeError, setSubtreeError] = useState<string | null>(null);
  const [aspectFilter, setAspectFilter] = useState('');
  const [subtreeFilter, setSubtreeFilter] = useState('');

  const fetchSchema = async () => {
    if (!categoryId.trim()) {
      toast.error('Enter a category ID');
      return;
    }

    setLoading(true);
    setSchema(null);

    try {
      const { data, error } = await supabase.functions.invoke('ebay-category-schema', {
        body: { category_id: categoryId.trim(), store_key: storeKey },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Unknown error');

      setSchema(data.schema);
      toast.success(`Loaded schema: ${data.schema.summary.totalConditions} conditions, ${data.schema.summary.totalAspects} aspects`);
    } catch (err: any) {
      toast.error('Failed to fetch schema: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchSubtree = async () => {
    if (!categoryId.trim()) {
      toast.error('Enter a category ID');
      return;
    }

    setSubtreeLoading(true);
    setSubtree(null);
    setSubtreeError(null);

    try {
      const { data, error } = await supabase.functions.invoke('ebay-category-schema', {
        body: { category_id: categoryId.trim(), store_key: storeKey, action: 'subtree' },
      });

      if (error) throw error;
      if (!data?.success) {
        if (data?.isInvalidCategory) {
          setSubtreeError(`Category ${categoryId} does NOT exist in eBay's live category tree (error 62005). This ID is invalid.`);
        } else {
          setSubtreeError(data?.error || 'Unknown error');
        }
        return;
      }

      setSubtree(data);
      toast.success(`Found ${data.totalCategories} categories (${data.leafCategories} leaves)`);
    } catch (err: any) {
      setSubtreeError(err.message);
      toast.error('Failed to fetch subtree: ' + err.message);
    } finally {
      setSubtreeLoading(false);
    }
  };

  const handleCategorySelect = (id: string) => {
    setCategoryId(id);
  };

  const handleLeafClick = (cat: SubtreeCategory) => {
    setCategoryId(cat.categoryId);
    toast.info(`Selected category ${cat.categoryId} — "${cat.categoryName}". Click Inspect to view schema.`);
  };

  const filteredRequired = schema?.requiredAspects.filter(a =>
    !aspectFilter || a.name.toLowerCase().includes(aspectFilter.toLowerCase())
  ) || [];

  const filteredOptional = schema?.optionalAspects.filter(a =>
    !aspectFilter || a.name.toLowerCase().includes(aspectFilter.toLowerCase())
  ) || [];

  const filteredSubtree = subtree?.categories.filter(c =>
    !subtreeFilter ||
    c.categoryName.toLowerCase().includes(subtreeFilter.toLowerCase()) ||
    c.categoryId.includes(subtreeFilter)
  ) || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Category Schema Inspector
          </CardTitle>
          <CardDescription>
            Look up valid conditions and aspects for any eBay category, or browse the category tree to discover leaf IDs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-2">
              <Label>eBay Category</Label>
              <EbayCategorySelect
                value={categoryId}
                onValueChange={handleCategorySelect}
                placeholder="Search or enter category ID..."
              />
            </div>
            <div className="w-36 space-y-2">
              <Label>Or enter ID directly</Label>
              <Input
                placeholder="e.g. 183454"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchSchema()}
              />
            </div>
            <Button onClick={fetchSchema} disabled={loading || !categoryId.trim()}>
              {loading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Fetching...</>
              ) : (
                <><Search className="h-4 w-4 mr-2" />Inspect</>
              )}
            </Button>
            <Button variant="outline" onClick={fetchSubtree} disabled={subtreeLoading || !categoryId.trim()}>
              {subtreeLoading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Loading...</>
              ) : (
                <><FolderTree className="h-4 w-4 mr-2" />Browse Subtree</>
              )}
            </Button>
          </div>

          {storeKey && (
            <p className="text-xs text-muted-foreground">
              Using store: <span className="font-mono">{storeKey}</span>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Subtree Error (invalid category) */}
      {subtreeError && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-destructive">Invalid Category</p>
                <p className="text-sm text-muted-foreground mt-1">{subtreeError}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Subtree Browser */}
      {subtree && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <FolderTree className="h-5 w-5 text-primary" />
                Subtree: Category {subtree.rootCategoryId}
                <Badge variant="outline" className="font-mono text-xs">{subtree.marketplace}</Badge>
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{subtree.totalCategories} total</Badge>
                <Badge className="bg-primary/10 text-primary">{subtree.leafCategories} leaves</Badge>
              </div>
            </div>
            <Input
              className="mt-2 w-80"
              placeholder="Filter by name or ID..."
              value={subtreeFilter}
              onChange={(e) => setSubtreeFilter(e.target.value)}
            />
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-24">Type</TableHead>
                    <TableHead className="w-28">Children</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSubtree.map((cat) => (
                    <TableRow key={cat.categoryId} className={cat.isLeaf ? 'bg-primary/5' : ''}>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono">{cat.categoryId}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">{cat.categoryName}</TableCell>
                      <TableCell>
                        {cat.isLeaf ? (
                          <Badge className="bg-primary/10 text-primary text-xs">
                            <Leaf className="h-3 w-3 mr-1" />Leaf
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">Parent</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">{cat.childCount}</TableCell>
                      <TableCell>
                        {cat.isLeaf && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleLeafClick(cat)}
                            className="h-7 text-xs"
                          >
                            <ArrowRight className="h-3 w-3 mr-1" />Use
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredSubtree.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-4">
                        {subtreeFilter ? 'No matching categories' : 'No categories found'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {schema && (
        <>
          {/* Summary */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">
                Category {schema.categoryId}
                <Badge variant="outline" className="ml-2 font-mono text-xs">
                  {schema.marketplaceId}
                </Badge>
              </CardTitle>
              <CardDescription>
                Fetched {new Date(schema.fetchedAt).toLocaleString()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <div className="text-2xl font-bold">{schema.summary.totalConditions}</div>
                  <div className="text-xs text-muted-foreground">Conditions</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <div className="text-2xl font-bold">{schema.summary.totalAspects}</div>
                  <div className="text-xs text-muted-foreground">Total Aspects</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-destructive/10">
                  <div className="text-2xl font-bold text-destructive">{schema.summary.requiredAspectCount}</div>
                  <div className="text-xs text-muted-foreground">Required</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <div className="text-2xl font-bold">{schema.summary.optionalAspectCount}</div>
                  <div className="text-xs text-muted-foreground">Optional</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Conditions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-primary" />
                Allowed Conditions ({schema.conditions.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">Condition ID</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schema.conditions.map((c) => (
                    <TableRow key={c.conditionId}>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono">{c.conditionId}</Badge>
                      </TableCell>
                      <TableCell>{c.conditionDescription}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Aspects */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Info className="h-5 w-5 text-primary" />
                  Item Aspects ({schema.summary.totalAspects})
                </CardTitle>
                <Input
                  className="w-64"
                  placeholder="Filter aspects..."
                  value={aspectFilter}
                  onChange={(e) => setAspectFilter(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent>
              <Accordion type="multiple" defaultValue={['required']}>
                <AccordionItem value="required">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-destructive" />
                      Required Aspects ({filteredRequired.length})
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ScrollArea className="max-h-[500px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Aspect Name</TableHead>
                            <TableHead className="w-32">Mode</TableHead>
                            <TableHead className="w-20">Max</TableHead>
                            <TableHead>Allowed Values</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredRequired.map((a) => (
                            <TableRow key={a.name}>
                              <TableCell className="font-medium">{a.name}</TableCell>
                              <TableCell>
                                <Badge variant={a.mode === 'SELECTION_ONLY' ? 'default' : 'outline'} className="text-xs">
                                  {a.mode === 'SELECTION_ONLY' ? 'Selection' : 'Free Text'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">{a.maxValues}</TableCell>
                              <TableCell>
                                {a.allowedValues.length > 0 ? (
                                  <div className="flex flex-wrap gap-1 max-w-md">
                                    {a.allowedValues.slice(0, 8).map((v) => (
                                      <Badge key={v} variant="secondary" className="text-xs">{v}</Badge>
                                    ))}
                                    {a.allowedValues.length > 8 && (
                                      <Badge variant="outline" className="text-xs">+{a.allowedValues.length - 8} more</Badge>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Any value</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                          {filteredRequired.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                                {aspectFilter ? 'No matching required aspects' : 'No required aspects'}
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="optional">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2">
                      <Info className="h-4 w-4 text-muted-foreground" />
                      Optional Aspects ({filteredOptional.length})
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ScrollArea className="max-h-[500px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Aspect Name</TableHead>
                            <TableHead className="w-32">Mode</TableHead>
                            <TableHead className="w-20">Max</TableHead>
                            <TableHead>Allowed Values</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredOptional.map((a) => (
                            <TableRow key={a.name}>
                              <TableCell className="font-medium">{a.name}</TableCell>
                              <TableCell>
                                <Badge variant={a.mode === 'SELECTION_ONLY' ? 'default' : 'outline'} className="text-xs">
                                  {a.mode === 'SELECTION_ONLY' ? 'Selection' : 'Free Text'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">{a.maxValues}</TableCell>
                              <TableCell>
                                {a.allowedValues.length > 0 ? (
                                  <div className="flex flex-wrap gap-1 max-w-md">
                                    {a.allowedValues.slice(0, 8).map((v) => (
                                      <Badge key={v} variant="secondary" className="text-xs">{v}</Badge>
                                    ))}
                                    {a.allowedValues.length > 8 && (
                                      <Badge variant="outline" className="text-xs">+{a.allowedValues.length - 8} more</Badge>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Any value</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                          {filteredOptional.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                                {aspectFilter ? 'No matching optional aspects' : 'No optional aspects'}
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
