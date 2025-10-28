import { Home, ChevronRight } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

interface EnhancedBreadcrumbProps {
  currentSection: string;
}

const sectionLabels: Record<string, string> = {
  overview: 'Overview',
  store: 'Store Management',
  catalog: 'Catalog',
  queue: 'Queue Management',
  users: 'Users',
  hardware: 'Hardware',
  system: 'System',
  vendors: 'Vendors',
};

export function EnhancedBreadcrumb({ currentSection }: EnhancedBreadcrumbProps) {
  return (
    <div className="flex items-center justify-between">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/admin" className="flex items-center gap-2">
              <Home className="w-4 h-4" />
              <span>Admin</span>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator>
            <ChevronRight className="w-4 h-4" />
          </BreadcrumbSeparator>
          <BreadcrumbItem>
            <BreadcrumbPage className="font-semibold">
              {sectionLabels[currentSection] || currentSection}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="text-sm text-muted-foreground">
        {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  );
}
