import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import { useStore } from '@/contexts/StoreContext';
import { Button } from '@/components/ui/button';
import { DocumentList } from '../components/DocumentList';
import { DocumentViewer } from '../components/DocumentViewer';
import { DOCUMENTS, filterDocumentsByLocation, type Document } from '../data/documents';

export default function DocumentsPage() {
  const { assignedRegion } = useStore();
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);

  // Filter documents based on user's region
  const visibleDocuments = filterDocumentsByLocation(DOCUMENTS, assignedRegion);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-amber-500/10 text-amber-500 border border-amber-500/20">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Documents</h1>
                <p className="text-sm text-muted-foreground">
                  Handbooks, procedures, and policies
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-6">
        {selectedDocument ? (
          <DocumentViewer 
            document={selectedDocument} 
            onBack={() => setSelectedDocument(null)} 
          />
        ) : (
          <DocumentList 
            documents={visibleDocuments} 
            onSelectDocument={setSelectedDocument} 
          />
        )}
      </div>
    </div>
  );
}
