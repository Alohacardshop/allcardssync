import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { PreflightIndexCheck } from '../PreflightIndexCheck';

// Mock the supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

describe('PreflightIndexCheck', () => {
  it('should render without crashing', () => {
    const { container } = render(<PreflightIndexCheck />);
    expect(container.textContent).toContain('Pre-flight Index Check');
  });

  it('should display run button', () => {
    const { container } = render(<PreflightIndexCheck />);
    expect(container.textContent).toContain('Run Pre-flight Checks');
  });

  it('should show description', () => {
    const { container } = render(<PreflightIndexCheck />);
    expect(container.textContent).toContain('Verify database integrity');
  });
});
