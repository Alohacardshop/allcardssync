import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { DuplicateCleanup } from '../DuplicateCleanup';

// Mock the supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    functions: {
      invoke: vi.fn(),
    },
  },
}));

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('DuplicateCleanup', () => {
  it('should render without crashing', () => {
    const { container } = render(<DuplicateCleanup />);
    expect(container.textContent).toContain('Duplicate Cleanup Tool');
  });

  it('should display scan button', () => {
    const { container } = render(<DuplicateCleanup />);
    expect(container.textContent).toContain('Scan for Duplicates');
  });

  it('should show initial clean state message', () => {
    const { container } = render(<DuplicateCleanup />);
    expect(container.textContent).toContain('No duplicates found');
  });
});
