import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Package, Printer, Scan, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

export function FloatingActionButton() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const actions = [
    {
      icon: Package,
      label: 'Add Cards',
      action: () => navigate('/inventory'),
      color: 'bg-blue-500 hover:bg-blue-600'
    },
    {
      icon: Scan,
      label: 'Bulk Import',
      action: () => navigate('/bulk-import'),
      color: 'bg-green-500 hover:bg-green-600'
    },
    {
      icon: Printer,
      label: 'Print Labels',
      action: () => navigate('/labels'),
      color: 'bg-purple-500 hover:bg-purple-600'
    },
    {
      icon: Upload,
      label: 'Batches',
      action: () => navigate('/batches'),
      color: 'bg-orange-500 hover:bg-orange-600'
    }
  ];

  const handleAction = (action: () => void) => {
    action();
    setIsOpen(false);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Action buttons */}
      <div className={cn(
        "flex flex-col gap-2 mb-4 transition-all duration-200",
        isOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
      )}>
        {actions.map((action, index) => (
          <Button
            key={action.label}
            onClick={() => handleAction(action.action)}
            className={cn(
              "h-12 px-4 rounded-full shadow-lg transition-all duration-200",
              action.color,
              "flex items-center gap-2 min-w-fit"
            )}
            style={{
              transitionDelay: isOpen ? `${index * 50}ms` : '0ms'
            }}
          >
            <action.icon className="h-4 w-4" />
            <span className="text-sm font-medium">{action.label}</span>
          </Button>
        ))}
      </div>

      {/* Main FAB */}
      <Button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "h-14 w-14 rounded-full shadow-lg transition-all duration-200",
          "bg-primary hover:bg-primary/90",
          isOpen && "rotate-45"
        )}
      >
        <Plus className="h-6 w-6" />
      </Button>
    </div>
  );
}