// Test utilities for Zebra printer functionality
import { zebraService } from './printer/zebraService';
import { simpleTestLabel, generateSampleZPL, testPattern } from './zplSamples';

export async function testDirectPrinting(printerName: string, testLabel: string = simpleTestLabel) {
  console.log(`🖨️ Testing direct ZPL printing to ${printerName}`);
  
  try {
    const result = await zebraService.print(testLabel, printerName);
    
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

export async function testPrinterConnection() {
  console.log(`🔍 Testing QZ Tray connection`);
  
  try {
    const isConnected = await zebraService.testConnection();
    console.log(isConnected ? '✅ QZ Tray is connected' : '❌ QZ Tray not connected');
    return isConnected;
  } catch (error) {
    console.error('❌ Connection test failed:', error);
    return false;
  }
}

export async function runPrinterTests(printerName: string) {
  console.log(`🧪 Running full test suite for ${printerName}`);
  
  const connectionTest = await testPrinterConnection();
  if (!connectionTest) {
    console.log('Skipping print tests due to connection failure');
    return false;
  }
  
  const simpleTest = await testDirectPrinting(printerName, simpleTestLabel);
  const generatedTest = await testDirectPrinting(printerName, generateSampleZPL());
  const patternTest = await testDirectPrinting(printerName, testPattern);
  
  const allPassed = simpleTest && generatedTest && patternTest;
  console.log(allPassed ? '✅ All tests passed!' : '❌ Some tests failed');
  
  return allPassed;
}

if (typeof window !== 'undefined') {
  (window as any).zebraTest = {
    testDirectPrinting,
    testPrinterConnection,
    runPrinterTests,
    samples: { simpleTestLabel, generateSampleZPL: generateSampleZPL(), testPattern }
  };
}
