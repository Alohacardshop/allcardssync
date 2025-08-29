import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { catalogMovedDetails } from "@/sentinel/catalogMoved";

interface CatalogMigrationPlaceholderProps {
  title?: string;
  description?: string;
}

export const CatalogMigrationPlaceholder = ({ 
  title = "Catalog Functionality Moved",
  description = "This catalog feature is no longer available in this application."
}: CatalogMigrationPlaceholderProps) => {
  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-800">
          <AlertTriangle className="h-5 w-5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-amber-700">
          <p className="mb-2">{description}</p>
          <p className="text-sm">
            <strong>Migration Notice:</strong> {catalogMovedDetails.message}
          </p>
        </div>
        
        <div className="bg-white p-4 rounded-md border border-amber-200">
          <h4 className="font-medium text-amber-800 mb-2">New Location:</h4>
          <a 
            href={`https://github.com/${catalogMovedDetails.newRepository}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 hover:underline"
          >
            {catalogMovedDetails.newRepository}
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
        
        <div className="text-xs text-amber-600">
          Migration completed: {catalogMovedDetails.migrationDate}
        </div>
      </CardContent>
    </Card>
  );
};