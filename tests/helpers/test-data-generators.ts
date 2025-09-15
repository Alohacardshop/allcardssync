// Test data generators for integration tests
export const TestDataGenerators = {
  // Generate realistic inventory items
  inventoryItem: (overrides = {}) => ({
    id: `item-${Math.random().toString(36).substr(2, 9)}`,
    sku: `SKU-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
    brand_title: ['Pokemon', 'Magic The Gathering', 'Yu-Gi-Oh!', 'Digimon'][Math.floor(Math.random() * 4)],
    subject: ['Charizard', 'Black Lotus', 'Blue Eyes White Dragon', 'Agumon'][Math.floor(Math.random() * 4)],
    category: ['Pokemon', 'Magic', 'Yu-Gi-Oh', 'Digimon'][Math.floor(Math.random() * 4)],
    variant: ['Base Set', 'First Edition', 'Unlimited', 'Promo'][Math.floor(Math.random() * 4)],
    price: Math.round((Math.random() * 500 + 10) * 100) / 100,
    cost: Math.round((Math.random() * 300 + 5) * 100) / 100,
    quantity: Math.floor(Math.random() * 10) + 1,
    grade: Math.random() > 0.7 ? ['8', '9', '9.5', '10'][Math.floor(Math.random() * 4)] : null,
    psa_cert: Math.random() > 0.7 ? (Math.floor(Math.random() * 90000000) + 10000000).toString() : null,
    type: Math.random() > 0.7 ? 'Graded' : 'Raw',
    store_key: 'test_store',
    shopify_location_gid: 'gid://shopify/Location/123',
    created_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }),

  // Generate PSA certificate data
  psaCertificate: (overrides = {}) => ({
    cert_number: (Math.floor(Math.random() * 90000000) + 10000000).toString(),
    grade: ['8', '8.5', '9', '9.5', '10'][Math.floor(Math.random() * 5)],
    brand: ['Pokemon', 'Magic The Gathering', 'Yu-Gi-Oh!'][Math.floor(Math.random() * 3)],
    subject: ['Charizard', 'Pikachu', 'Blastoise', 'Venusaur'][Math.floor(Math.random() * 4)],
    category: 'Trading Card',
    variety_pedigree: ['Base Set', 'Jungle', 'Fossil', 'Team Rocket'][Math.floor(Math.random() * 4)],
    year: (1998 + Math.floor(Math.random() * 25)).toString(),
    is_valid: true,
    image_url: `https://example.com/cert-${Math.random().toString(36).substr(2, 9)}.jpg`,
    psa_url: `https://www.psacard.com/cert/${Math.floor(Math.random() * 90000000) + 10000000}`,
    scraped_at: new Date().toISOString(),
    ...overrides,
  }),

  // Generate print jobs
  printJob: (overrides = {}) => ({
    id: `print-job-${Math.random().toString(36).substr(2, 9)}`,
    workstation_id: `workstation-${Math.floor(Math.random() * 3) + 1}`,
    template_id: ['barcode-template', 'price-tag-template', 'shelf-label-template'][Math.floor(Math.random() * 3)],
    data: {
      sku: `SKU-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
      title: ['Pokemon Charizard', 'Magic Black Lotus', 'Yu-Gi-Oh Blue Eyes'][Math.floor(Math.random() * 3)],
      price: Math.round((Math.random() * 200 + 10) * 100) / 100,
      barcode: `SKU-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
    },
    copies: Math.floor(Math.random() * 5) + 1,
    status: ['queued', 'processing', 'completed', 'failed'][Math.floor(Math.random() * 4)],
    created_at: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  }),

  // Generate sync queue items
  syncQueueItem: (overrides = {}) => ({
    id: `sync-${Math.random().toString(36).substr(2, 9)}`,
    inventory_item_id: `item-${Math.random().toString(36).substr(2, 9)}`,
    action: ['create', 'update', 'delete'][Math.floor(Math.random() * 3)],
    status: ['queued', 'processing', 'completed', 'failed'][Math.floor(Math.random() * 4)],
    retry_count: Math.floor(Math.random() * 3),
    max_retries: 3,
    error_message: Math.random() > 0.8 ? 'Network timeout' : null,
    created_at: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000).toISOString(),
    started_at: Math.random() > 0.5 ? new Date().toISOString() : null,
    completed_at: Math.random() > 0.7 ? new Date().toISOString() : null,
    ...overrides,
  }),

  // Generate batch/lot data
  intakeLot: (overrides = {}) => ({
    id: `lot-${Math.random().toString(36).substr(2, 9)}`,
    lot_number: `LOT-${Math.floor(Math.random() * 900000) + 100000}`,
    store_key: 'test_store',
    shopify_location_gid: 'gid://shopify/Location/123',
    lot_type: 'mixed',
    total_items: Math.floor(Math.random() * 100) + 1,
    total_value: Math.round((Math.random() * 5000 + 100) * 100) / 100,
    status: ['active', 'closed'][Math.floor(Math.random() * 2)],
    created_by: `user-${Math.random().toString(36).substr(2, 9)}`,
    created_at: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }),

  // Generate large datasets for performance testing
  largeDataset: (size: number, generator: (index: number) => any) => {
    return Array.from({ length: size }, (_, index) => generator(index));
  },

  // Generate realistic user data
  user: (overrides = {}) => ({
    id: `user-${Math.random().toString(36).substr(2, 9)}`,
    email: `test${Math.floor(Math.random() * 1000)}@example.com`,
    role: ['staff', 'admin'][Math.floor(Math.random() * 2)],
    store_assignments: [{
      store_key: 'test_store',
      location_gid: 'gid://shopify/Location/123',
      location_name: 'Test Location',
      is_default: true,
    }],
    created_at: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  }),

  // Generate Shopify product data
  shopifyProduct: (overrides = {}) => ({
    id: `prod_${Math.floor(Math.random() * 9000000000000) + 1000000000000}`,
    title: ['Pokemon Charizard Card', 'Magic Black Lotus', 'Yu-Gi-Oh Blue Eyes'][Math.floor(Math.random() * 3)],
    vendor: ['Pokemon Company', 'Wizards of the Coast', 'Konami'][Math.floor(Math.random() * 3)],
    product_type: 'Trading Card',
    handle: `product-handle-${Math.random().toString(36).substr(2, 9)}`,
    status: 'active',
    variants: [{
      id: `var_${Math.floor(Math.random() * 9000000000000) + 1000000000000}`,
      sku: `SKU-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
      price: Math.round((Math.random() * 200 + 10) * 100) / 100,
      inventory_quantity: Math.floor(Math.random() * 10) + 1,
      inventory_item_id: `inv_${Math.floor(Math.random() * 9000000000000) + 1000000000000}`,
    }],
    ...overrides,
  }),
};

// Test utilities for common operations
export const TestUtils = {
  // Simulate network delays
  delay: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),

  // Generate realistic timestamps
  randomRecentDate: (maxDaysAgo: number = 30) => {
    const maxMs = maxDaysAgo * 24 * 60 * 60 * 1000;
    return new Date(Date.now() - Math.random() * maxMs).toISOString();
  },

  // Create paginated response
  paginatedResponse: <T>(data: T[], page: number, pageSize: number) => ({
    data: data.slice(page * pageSize, (page + 1) * pageSize),
    count: data.length,
    page,
    pageSize,
    totalPages: Math.ceil(data.length / pageSize),
  }),

  // Measure execution time
  measureTime: async <T>(operation: () => Promise<T>): Promise<{ result: T; timeMs: number }> => {
    const start = Date.now();
    const result = await operation();
    const timeMs = Date.now() - start;
    return { result, timeMs };
  },

  // Create mock Supabase responses
  mockSupabaseResponse: (data: any, error: any = null) => ({
    data,
    error,
    status: error ? 400 : 200,
    statusText: error ? 'Error' : 'OK',
  }),

  // Generate realistic errors
  generateError: (type: 'network' | 'validation' | 'auth' | 'database', message?: string) => {
    const errorMap = {
      network: { message: message || 'Network connection failed', code: 'NETWORK_ERROR' },
      validation: { message: message || 'Validation failed', code: 'VALIDATION_ERROR' },
      auth: { message: message || 'Authentication required', code: 'AUTH_ERROR' },
      database: { message: message || 'Database query failed', code: 'DATABASE_ERROR' },
    };
    return errorMap[type];
  },
};

export default { TestDataGenerators, TestUtils };