import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import { useStore } from '@/contexts/StoreContext';
import { Button } from '@/components/ui/button';
import { DocumentList } from '../components/DocumentList';
import { DocumentViewer } from '../components/DocumentViewer';
import { DOCUMENTS, filterDocumentsByLocation, type Document } from '../data/documents';
import { PageHeader } from '@/components/layout/PageHeader';

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
            <PageHeader
              title="Documents"
              description="Handbooks, procedures, and policies"
              showEcosystem
              className="mb-0"
            />
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
