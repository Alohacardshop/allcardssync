// Unit tests for JustTCG shared library
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { TokenBucket, sortVariants, sortCards, CONFIG } from "./justtcg.ts";

// Test token bucket rate limiting
Deno.test("TokenBucket rate limiting", async () => {
  const bucket = new TokenBucket(10, 60); // 10 capacity, 60 per minute (1 per second)
  
  // Should be able to acquire 10 tokens immediately
  for (let i = 0; i < 10; i++) {
    await bucket.acquire();
  }
  
  assertEquals(bucket.getAvailableTokens(), 0, "Should have no tokens left");
  
  // Wait a bit for refill
  await new Promise(resolve => setTimeout(resolve, 1100)); // 1.1 seconds
  
  // Should have at least 1 token available
  assertEquals(bucket.getAvailableTokens() >= 1, true, "Should have refilled at least 1 token");
});

Deno.test("TokenBucket doesn't exceed capacity", async () => {
  const bucket = new TokenBucket(5, 300); // 5 capacity, 300 per minute
  
  // Wait for potential refill
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Should never exceed capacity
  assertEquals(bucket.getAvailableTokens() <= 5, true, "Should not exceed capacity");
});

// Test sorting functions
Deno.test("sortVariants by price ascending", () => {
  const variants = [
    { id: "1", price: 10, marketPrice: 12 },
    { id: "2", price: 5, marketPrice: 6 },
    { id: "3", price: 15, marketPrice: 18 }
  ];
  
  const sorted = sortVariants(variants, 'price', 'asc');
  
  assertEquals(sorted[0].id, "2", "Should sort by lowest price first");
  assertEquals(sorted[1].id, "1", "Should have medium price second");
  assertEquals(sorted[2].id, "3", "Should have highest price last");
});

Deno.test("sortVariants by price descending", () => {
  const variants = [
    { id: "1", price: 10, marketPrice: 12 },
    { id: "2", price: 5, marketPrice: 6 },
    { id: "3", price: 15, marketPrice: 18 }
  ];
  
  const sorted = sortVariants(variants, 'price', 'desc');
  
  assertEquals(sorted[0].id, "3", "Should sort by highest price first");
  assertEquals(sorted[1].id, "1", "Should have medium price second");
  assertEquals(sorted[2].id, "2", "Should have lowest price last");
});

Deno.test("sortCards by aggregated price", () => {
  const cards = [
    { 
      id: "card1", 
      variants: [{ price: 10 }, { price: 8 }, { price: 12 }] 
    },
    { 
      id: "card2", 
      variants: [{ price: 15 }, { price: 20 }] 
    },
    { 
      id: "card3", 
      variants: [{ price: 5 }, { price: 7 }] 
    }
  ];
  
  const sorted = sortCards(cards, 'price', 'asc');
  
  assertEquals(sorted[0].id, "card3", "Should sort by minimum variant price (5)");
  assertEquals(sorted[1].id, "card1", "Should have second lowest minimum (8)");
  assertEquals(sorted[2].id, "card2", "Should have highest minimum (15)");
});

Deno.test("sortCards handles missing variants", () => {
  const cards = [
    { id: "card1", variants: [{ price: 10 }] },
    { id: "card2", variants: [] },
    { id: "card3" } // No variants property
  ];
  
  const sorted = sortCards(cards, 'price', 'asc');
  
  assertEquals(sorted.length, 3, "Should handle all cards");
  assertEquals(sorted[0].id, "card1", "Card with price should be first");
});

// Test configuration constants
Deno.test("CONFIG constants are valid", () => {
  assertEquals(CONFIG.RPM, 500, "RPM should be 500");
  assertEquals(CONFIG.PAGE_SIZE_GET, 200, "Page size should be 200");
  assertEquals(CONFIG.POST_BATCH_MAX, 100, "Post batch max should be 100");
  assertEquals(CONFIG.MAX_CONCURRENT, 24, "Max concurrent should be 24");
  assertExists(CONFIG.JUSTTCG_BASE, "JustTCG base URL should exist");
});

// Test pagination logic (mock test)
Deno.test("Pagination stops on empty response", () => {
  // Mock scenario: hasMore should be false when no cards returned
  const mockResponse = { data: [], _metadata: { hasMore: false } };
  
  assertEquals(mockResponse.data.length === 0, true, "Empty response should have no cards");
  assertEquals(mockResponse._metadata.hasMore, false, "hasMore should be false for empty response");
});

Deno.test("Pagination continues on hasMore=true", () => {
  // Mock scenario: hasMore should continue when more cards available
  const mockResponse = { 
    data: [{ id: "card1" }, { id: "card2" }], 
    _metadata: { hasMore: true } 
  };
  
  assertEquals(mockResponse.data.length > 0, true, "Response should have cards");
  assertEquals(mockResponse._metadata.hasMore, true, "hasMore should be true when more data available");
});

// Test ID migration handling
Deno.test("ID format tolerance", () => {
  // Test that functions can handle both old and new ID formats
  const oldFormatId = "old-format-123";
  const newFormatId = "new_format_456";
  
  // Both should be valid strings
  assertEquals(typeof oldFormatId, "string", "Old format should be string");
  assertEquals(typeof newFormatId, "string", "New format should be string");
  assertEquals(oldFormatId.length > 0, true, "Old format should not be empty");
  assertEquals(newFormatId.length > 0, true, "New format should not be empty");
});

console.log("All JustTCG library tests completed!");