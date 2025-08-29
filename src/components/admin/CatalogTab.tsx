import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { catalogMovedDetails } from "@/sentinel/catalogMoved";
import { CatalogMigrationPlaceholder } from "@/components/CatalogMigrationPlaceholder";

const CatalogTab = () => {
  return (
    <div className="space-y-6">
      <CatalogMigrationPlaceholder 
        title="Catalog Management Moved"
        description="Catalog management functionality has been moved to a dedicated external service. All catalog operations including browsing, syncing, and data management are now handled by the external TCG database."
      />
      
      <div className="mt-4">
        <a 
          href="/MIGRATION.md"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 hover:underline text-sm"
        >
          📖 Read Migration Documentation
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
};

export default CatalogTab;