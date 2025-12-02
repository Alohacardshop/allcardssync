import { ArrowLeft, ExternalLink, Calendar, MapPin, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { type Document } from '../data/documents';

interface DocumentViewerProps {
  document: Document;
  onBack: () => void;
}

const VISIBILITY_LABELS: Record<string, string> = {
  ALL: 'All Locations',
  HAWAII: 'Hawaii Only',
  LAS_VEGAS: 'Las Vegas Only',
};

export function DocumentViewer({ document, onBack }: DocumentViewerProps) {
  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button variant="ghost" onClick={onBack} className="gap-2">
        <ArrowLeft className="h-4 w-4" />
        Back to Documents
      </Button>

      {/* Document Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-2xl">{document.title}</CardTitle>
              <p className="text-muted-foreground mt-1">{document.description}</p>
            </div>
            {document.url && (
              <Button variant="outline" size="sm" asChild>
                <a href={document.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open File
                </a>
              </Button>
            )}
          </div>

          {/* Metadata */}
          <div className="flex flex-wrap gap-3 mt-4">
            <Badge variant="outline" className="flex items-center gap-1">
              <Tag className="h-3 w-3" />
              {document.category}
            </Badge>
            <Badge variant="secondary" className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {VISIBILITY_LABELS[document.locationVisibility]}
            </Badge>
            <Badge variant="secondary" className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Updated {new Date(document.updatedAt).toLocaleDateString()}
            </Badge>
          </div>
        </CardHeader>

        <Separator />

        <CardContent className="pt-6">
          {document.content ? (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <p className="whitespace-pre-wrap">{document.content}</p>
            </div>
          ) : document.url ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">
                This document is stored externally.
              </p>
              <Button asChild>
                <a href={document.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View Document
                </a>
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">
              No content available for this document.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
