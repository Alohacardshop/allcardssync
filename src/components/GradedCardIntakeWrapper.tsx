import React from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { GradedCardIntake } from '@/components/GradedCardIntake';

interface GradedCardIntakeWrapperProps {
  onBatchAdd?: () => void;
}

export const GradedCardIntakeWrapper = ({ onBatchAdd }: GradedCardIntakeWrapperProps) => {
  return (
    <ErrorBoundary
      fallback={
        <div className="p-6 border border-destructive rounded-lg bg-destructive/5">
          <h3 className="text-lg font-semibold text-destructive mb-2">
            Graded Card Intake Error
          </h3>
          <p className="text-muted-foreground">
            The graded card intake component encountered an error. Please refresh the page or contact support.
          </p>
        </div>
      }
    >
      <GradedCardIntake onBatchAdd={onBatchAdd} />
    </ErrorBoundary>
  );
};