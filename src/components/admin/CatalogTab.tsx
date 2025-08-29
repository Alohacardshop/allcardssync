import { CatalogMigrationPlaceholder } from "@/components/CatalogMigrationPlaceholder";

const CatalogTab = () => {
  return (
    <div className="space-y-6">
      <CatalogMigrationPlaceholder 
        title="Catalog Management Moved"
        description="Catalog management functionality has been moved to a dedicated external service. All catalog operations including browsing, syncing, and data management are now handled by the external TCG database."
      />
    </div>
  );
};

export default CatalogTab;