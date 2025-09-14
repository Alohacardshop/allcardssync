import React from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';

interface BatchProcessingWrapperProps {
  children: React.ReactNode;
  componentName?: string;
}

export const BatchProcessingWrapper = ({ 
  children, 
  componentName = "Batch Processing" 
}: BatchProcessingWrapperProps) => {
  return (
    <ErrorBoundary
      fallback={
        <div className="p-6 border border-destructive rounded-lg bg-destructive/5">
          <h3 className="text-lg font-semibold text-destructive mb-2">
            {componentName} Error
          </h3>
          <p className="text-muted-foreground">
            An error occurred during batch processing. Please try again or contact support if the issue persists.
          </p>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
};