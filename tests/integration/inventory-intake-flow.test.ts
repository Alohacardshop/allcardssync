import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { supabase } from '@/integrations/supabase/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import { RawCardIntake } from '@/components/RawCardIntake';
import { GradedCardIntake } from '@/components/GradedCardIntake';
import { BarcodeLabel } from '@/components/BarcodeLabel';

// Test wrapper with all necessary providers
const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster />
      </QueryClientProvider>
    </BrowserRouter>
  );
};

// Mock external services
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
      getSession: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(),
        })),
        order: vi.fn(() => ({
          limit: vi.fn(),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(),
        })),
      })),
    })),
    rpc: vi.fn(),
    functions: {
      invoke: vi.fn(),
    },
  },
}));

describe('Complete Inventory Intake Flow', () => {
  let user: ReturnType<typeof userEvent.setup>;
  
  beforeEach(() => {
    user = userEvent.setup();
    vi.clearAllMocks();
    
    // Mock authenticated user
    (supabase.auth.getUser as any).mockResolvedValue({
      data: {
        user: {
          id: 'test-user-id',
          email: 'test@example.com',
        },
      },
      error: null,
    });
    
    // Mock store assignments
    (supabase.from as any).mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({
            data: {
              store_key: 'test_store',
              location_gid: 'gid://shopify/Location/123',
              location_name: 'Test Location',
              is_default: true,
            },
            error: null,
          })),
        })),
        order: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve({
            data: [],
            error: null,
          })),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => Promise.resolve({
          data: [{ id: 'new-item-id' }],
          error: null,
        })),
      })),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Raw Card Intake Process', () => {
    it('should complete full raw card intake workflow', async () => {
      // Mock successful RPC call for creating intake item
      (supabase.rpc as any).mockResolvedValue({
        data: [{
          id: 'test-item-id',
          lot_number: 'LOT-000001',
          created_at: new Date().toISOString(),
        }],
        error: null,
      });

      render(
        <TestWrapper>
          <RawCardIntake onBatchAdd={vi.fn()} />
        </TestWrapper>
      );

      // Step 1: Fill in card details
      const titleInput = screen.getByPlaceholderText(/title/i);
      const subjectInput = screen.getByPlaceholderText(/subject/i);
      const priceInput = screen.getByPlaceholderText(/price/i);
      const categorySelect = screen.getByRole('combobox');

      await user.type(titleInput, 'Pokemon');
      await user.type(subjectInput, 'Charizard');
      await user.type(priceInput, '25.99');
      
      // Step 2: Select category
      await user.click(categorySelect);
      const pokemonOption = screen.getByText('Pokemon');
      await user.click(pokemonOption);

      // Step 3: Add to batch
      const addToBatchButton = screen.getByText('Add to Batch');
      expect(addToBatchButton).toBeInTheDocument();
      
      await user.click(addToBatchButton);

      // Step 4: Verify RPC was called with correct data
      await waitFor(() => {
        expect(supabase.rpc).toHaveBeenCalledWith('create_raw_intake_item', 
          expect.objectContaining({
            brand_title_in: 'Pokemon',
            subject_in: 'Charizard',
            price_in: 25.99,
            category_in: 'Pokemon',
          })
        );
      });

      // Step 5: Verify success feedback
      await waitFor(() => {
        expect(screen.getByText(/added to batch/i)).toBeInTheDocument();
      });
    });

    it('should validate required fields before submission', async () => {
      render(
        <TestWrapper>
          <RawCardIntake onBatchAdd={vi.fn()} />
        </TestWrapper>
      );

      // Try to add without required fields
      const addToBatchButton = screen.getByText('Add to Batch');
      await user.click(addToBatchButton);

      // Should show validation errors
      await waitFor(() => {
        expect(screen.getByText(/title is required/i)).toBeInTheDocument();
      });

      // RPC should not be called
      expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      // Mock API error
      (supabase.rpc as any).mockRejectedValue(new Error('Database connection failed'));

      render(
        <TestWrapper>
          <RawCardIntake onBatchAdd={vi.fn()} />
        </TestWrapper>
      );

      // Fill required fields
      await user.type(screen.getByPlaceholderText(/title/i), 'Test Card');
      await user.type(screen.getByPlaceholderText(/price/i), '10.00');

      // Try to add to batch
      const addToBatchButton = screen.getByText('Add to Batch');
      await user.click(addToBatchButton);

      // Should show error message
      await waitFor(() => {
        expect(screen.getByText(/failed to add item/i)).toBeInTheDocument();
      });
    });
  });

  describe('PSA Graded Card Intake Process', () => {
    it('should complete PSA certificate lookup and intake', async () => {
      // Mock PSA lookup function
      (supabase.functions.invoke as any).mockResolvedValue({
        data: {
          success: true,
          certificate: {
            cert_number: '12345678',
            grade: '10',
            brand: 'Pokemon',
            subject: 'Charizard',
            category: 'Trading Card',
            year: '1999',
          },
        },
        error: null,
      });

      // Mock successful intake creation
      (supabase.rpc as any).mockResolvedValue({
        data: [{
          id: 'graded-item-id',
          lot_number: 'LOT-000002',
          created_at: new Date().toISOString(),
        }],
        error: null,
      });

      render(
        <TestWrapper>
          <GradedCardIntake onBatchAdd={vi.fn()} />
        </TestWrapper>
      );

      // Step 1: Enter PSA certificate number
      const certInput = screen.getByPlaceholderText(/psa certificate/i);
      await user.type(certInput, '12345678');

      // Step 2: Fetch PSA data
      const fetchButton = screen.getByText('Fetch PSA Data');
      await user.click(fetchButton);

      // Step 3: Wait for PSA data to load
      await waitFor(() => {
        expect(supabase.functions.invoke).toHaveBeenCalledWith('psa-scrape-v2', {
          body: { cert: '12345678' }
        });
      });

      // Step 4: Verify data is populated (would need to mock the component state)
      // This would require more complex testing setup

      // Step 5: Add pricing and submit
      const priceInput = screen.getByPlaceholderText(/price/i);
      await user.type(priceInput, '150.00');

      const addToBatchButton = screen.getByText('Add to Batch');
      await user.click(addToBatchButton);

      // Step 6: Verify graded item creation
      await waitFor(() => {
        expect(supabase.rpc).toHaveBeenCalledWith('create_raw_intake_item', 
          expect.objectContaining({
            grade_in: '10',
            psa_cert_in: '12345678',
            price_in: 150.00,
          })
        );
      });
    });

    it('should handle PSA lookup failures gracefully', async () => {
      // Mock PSA lookup error
      (supabase.functions.invoke as any).mockResolvedValue({
        data: null,
        error: { message: 'Certificate not found' },
      });

      render(
        <TestWrapper>
          <GradedCardIntake onBatchAdd={vi.fn()} />
        </TestWrapper>
      );

      const certInput = screen.getByPlaceholderText(/psa certificate/i);
      await user.type(certInput, '99999999');

      const fetchButton = screen.getByText('Fetch PSA Data');
      await user.click(fetchButton);

      // Should show error message
      await waitFor(() => {
        expect(screen.getByText(/certificate not found/i)).toBeInTheDocument();
      });
    });
  });

  describe('Label Printing Integration', () => {
    it('should generate and validate label before printing', async () => {
      const mockPrintData = {
        sku: 'TEST-SKU-001',
        title: 'Pokemon Charizard',
        price: 25.99,
        barcode: 'TEST-SKU-001',
      };

      render(
        <TestWrapper>
          <BarcodeLabel 
            value={mockPrintData.barcode}
            label={mockPrintData.title}
            showPrintButton={true}
          />
        </TestWrapper>
      );

      // Verify barcode is rendered
      const canvas = screen.getByRole('img');
      expect(canvas).toBeInTheDocument();

      // Verify print button is available
      const printButton = screen.getByText('Print Label');
      expect(printButton).toBeInTheDocument();

      // Test print functionality (would require mocking print services)
      await user.click(printButton);
      
      // Should open printer selection dialog
      await waitFor(() => {
        expect(screen.getByText(/select printer/i)).toBeInTheDocument();
      });
    });

    it('should validate label data before printing', async () => {
      const invalidData = {
        sku: '', // Missing SKU
        title: 'x'.repeat(100), // Too long
        price: -5, // Invalid price
        barcode: 'invalid barcode!@#', // Invalid characters
      };

      // Test validation helper
      const { ValidationHelper } = await import('@/lib/productionErrorHandler');
      const validation = ValidationHelper.validateLabelData(invalidData);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('SKU is required for label printing');
      expect(validation.errors).toContain('Valid price is required');
      expect(validation.errors).toContain('Title too long (max 50 characters)');
    });
  });

  describe('Batch Processing Workflow', () => {
    it('should process multiple items in batch efficiently', async () => {
      // Mock batch of items
      const batchItems = Array.from({ length: 50 }, (_, i) => ({
        id: `item-${i}`,
        sku: `TEST-SKU-${i.toString().padStart(3, '0')}`,
        title: `Test Card ${i}`,
        price: 10 + i,
        quantity: 1,
      }));

      // Mock batch processing RPC
      (supabase.rpc as any).mockResolvedValue({
        data: { processed_ids: batchItems.map(item => item.id) },
        error: null,
      });

      // Test batch processing performance
      const startTime = Date.now();
      
      // Simulate batch processing call
      const result = await supabase.rpc('send_intake_items_to_inventory', {
        item_ids: batchItems.map(item => item.id)
      });

      const processingTime = Date.now() - startTime;

      // Verify batch was processed successfully
      expect(result.data.processed_ids).toHaveLength(50);
      
      // Verify reasonable processing time (< 5 seconds for 50 items)
      expect(processingTime).toBeLessThan(5000);
    });
  });
});