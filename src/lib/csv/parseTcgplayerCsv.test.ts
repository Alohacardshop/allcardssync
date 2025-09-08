import { parseTcgplayerCsv } from './parseTcgplayerCsv';

// Simple test setup without vitest dependency
export function runTests() {
  console.log('Running TCGPlayer CSV Parser Tests...');
  
  const shortCsv = `TCGplayer Id,Product Line,Set Name,Product Name,Title,Number,Rarity,Condition,TCG Market Price,TCG Low Price,Total Quantity,Photo URL
226594,Pokemon,SWSH04: Vivid Voltage,Rayquaza,,138/185, Amazing Rare, Near Mint,19.1, , ,https://tcgplayer-cdn.tcgplayer.com/product/226594_in_400x400.jpg
246719,Pokemon,SWSH07: Evolving Skies,Umbreon V (Alternate Full Art),,189/203,Ultra Rare,Near Mint,350.91, , ,https://tcgplayer-cdn.tcgplayer.com/product/246719_in_400x400.jpg`;

  const fullCsv = `TCGplayer Id,Product Line,Set Name,Product Name,Title,Number,Rarity,Condition,TCG Market Price,TCG Direct Low,TCG Low Price With Shipping,TCG Low Price,Total Quantity,Add to Quantity,TCG Marketplace Price,Photo URL
8112866,Pokémon (Japan),SV2D: Clay Burst,Iono - 091/071,,091/071,Super Rare,Near Mint - Japanese,45.60,,,,,,,https://tcgplayer-cdn.tcgplayer.com/product/565953_in_200x200.jpg
7337188,Pokémon,SV03: Obsidian Flames,Bellibolt - 201/197,,201/197,Illustration Rare,Near Mint,3.05,,,,,,,https://tcgplayer-cdn.tcgplayer.com/product/509948_in_200x200.jpg`;

  // Test short CSV format
  const shortResult = parseTcgplayerCsv(shortCsv);
  console.assert(shortResult.schema === 'short', 'Expected short schema');
  console.assert(shortResult.data.length === 2, 'Expected 2 rows from short CSV');
  console.assert(shortResult.data[0].marketPrice === 19.10, 'Expected correct price parsing');
  console.assert(shortResult.data[0].quantity === 0, 'Expected default quantity 0');
  
  // Test full CSV format
  const fullResult = parseTcgplayerCsv(fullCsv);
  console.assert(fullResult.schema === 'full', 'Expected full schema');
  console.assert(fullResult.data.length === 2, 'Expected 2 rows from full CSV');
  console.assert(fullResult.data[0].marketPrice === 45.60, 'Expected correct price parsing');
  
  console.log('✅ All tests passed!');
}

// Export for manual testing in console
if (typeof window !== 'undefined') {
  (window as any).testTcgCsvParser = runTests;
}