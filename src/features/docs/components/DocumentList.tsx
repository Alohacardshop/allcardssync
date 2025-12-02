import { useState } from 'react';
import { FileText, Book, ClipboardList, Scale, Search, MapPin } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { type Document, type DocumentCategory } from '../data/documents';

interface DocumentListProps {
  documents: Document[];
  onSelectDocument: (doc: Document) => void;
}

const CATEGORY_ICONS: Record<DocumentCategory, React.ComponentType<{ className?: string }>> = {
  Handbook: Book,
  Procedure: ClipboardList,
  Policy: Scale,
};

const CATEGORY_COLORS: Record<DocumentCategory, string> = {
  Handbook: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  Procedure: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  Policy: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
};

const VISIBILITY_LABELS: Record<string, string> = {
  ALL: 'All Locations',
  HAWAII: 'Hawaii Only',
  LAS_VEGAS: 'Las Vegas Only',
};

export function DocumentList({ documents, onSelectDocument }: DocumentListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const filteredDocs = documents.filter(doc => {
    const matchesSearch = 
      doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || doc.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categories: (DocumentCategory | 'all')[] = ['all', 'Handbook', 'Procedure', 'Policy'];

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search documents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Category Tabs */}
      <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
        <TabsList>
          {categories.map(cat => (
            <TabsTrigger key={cat} value={cat} className="capitalize">
              {cat === 'all' ? 'All' : cat}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={selectedCategory} className="mt-4">
          {filteredDocs.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No documents found</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {filteredDocs.map(doc => {
                const Icon = CATEGORY_ICONS[doc.category];
                const colorClass = CATEGORY_COLORS[doc.category];
                
                return (
                  <Card 
                    key={doc.id} 
                    className="cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all"
                    onClick={() => onSelectDocument(doc)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${colorClass}`}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div>
                            <CardTitle className="text-base">{doc.title}</CardTitle>
                            <CardDescription className="text-sm mt-0.5">
                              {doc.description}
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant="outline" className="text-xs">
                            {doc.category}
                          </Badge>
                          {doc.locationVisibility !== 'ALL' && (
                            <Badge variant="secondary" className="text-xs flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {VISIBILITY_LABELS[doc.locationVisibility]}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground">
                        Last updated: {new Date(doc.updatedAt).toLocaleDateString()}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
