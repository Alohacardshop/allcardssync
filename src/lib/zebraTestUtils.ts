// Test utilities for Zebra printer functionality
import { zebraNetworkService } from './zebraNetworkService';
import { simpleTestLabel, generateSampleZPL, testPattern } from './zplSamples';

/**
 * Test direct ZPL printing to a network printer
 * Example: testDirectPrinting("192.168.1.70") 
 */
export async function testDirectPrinting(
  host: string, 
  port: number = 9100, 
  testLabel: string = simpleTestLabel
) {
  console.log(`🖨️ Testing direct ZPL printing to ${host}:${port}`);
  
  try {
    const result = await zebraNetworkService.printZPLDirect(testLabel, host, port);
    
    if (result.success) {
      console.log('✅ Print successful:', result.message);
      return true;
    } else {
      console.error('❌ Print failed:', result.error);
      return false;
    }
  } catch (error) {
    console.error('❌ Test failed:', error);
    return false;
  }
}

/**
 * Test printer connectivity
 */
export async function testPrinterConnection(host: string, port: number = 9100) {
  console.log(`🔍 Testing connection to ${host}:${port}`);
  
  try {
    const isConnected = await zebraNetworkService.testConnection(host, port);
    
    if (isConnected) {
      console.log('✅ Printer is reachable');
      return true;
    } else {
      console.log('❌ Printer is not reachable');
      return false;
    }
  } catch (error) {
    console.error('❌ Connection test failed:', error);
    return false;
  }
}

/**
 * Run full printer test suite
 */
export async function runPrinterTests(host: string, port: number = 9100) {
  console.log(`🧪 Running full test suite for ${host}:${port}`);
  
  const connectionTest = await testPrinterConnection(host, port);
  if (!connectionTest) {
    console.log('Skipping print tests due to connection failure');
    return false;
  }
  
  console.log('Testing simple label...');
  const simpleTest = await testDirectPrinting(host, port, simpleTestLabel);
  
  console.log('Testing generated label...');
  const generatedTest = await testDirectPrinting(host, port, generateSampleZPL());
  
  console.log('Testing pattern...');
  const patternTest = await testDirectPrinting(host, port, testPattern);
  
  const allPassed = simpleTest && generatedTest && patternTest;
  
  if (allPassed) {
    console.log('✅ All tests passed!');
  } else {
    console.log('❌ Some tests failed');
  }
  
  return allPassed;
}

// Export for global use in browser console
if (typeof window !== 'undefined') {
  (window as any).zebraTest = {
    testDirectPrinting,
    testPrinterConnection,
    runPrinterTests,
    samples: {
      simpleTestLabel,
      generateSampleZPL: generateSampleZPL(), 
      testPattern
    }
  };
  
  console.log('🖨️ Zebra test utilities available as window.zebraTest');
  console.log('Usage: window.zebraTest.testDirectPrinting("192.168.1.70")');
}