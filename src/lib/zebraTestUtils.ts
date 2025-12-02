// Test utilities for Zebra printer functionality
import { zebraService } from './printer/zebraService';
import { simpleTestLabel, generateSampleZPL, testPattern } from './zplSamples';

export async function testDirectPrinting(
  host: string, 
  port: number = 9100, 
  testLabel: string = simpleTestLabel
) {
  console.log(`🖨️ Testing direct ZPL printing to ${host}:${port}`);
  
  try {
    const result = await zebraService.print(testLabel, host, port);
    
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

export async function testPrinterConnection(host: string, port: number = 9100) {
  console.log(`🔍 Testing connection to ${host}:${port}`);
  
  try {
    const isConnected = await zebraService.testConnection(host, port);
    
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

export async function runPrinterTests(host: string, port: number = 9100) {
  console.log(`🧪 Running full test suite for ${host}:${port}`);
  
  const connectionTest = await testPrinterConnection(host, port);
  if (!connectionTest) {
    console.log('Skipping print tests due to connection failure');
    return false;
  }
  
  const simpleTest = await testDirectPrinting(host, port, simpleTestLabel);
  const generatedTest = await testDirectPrinting(host, port, generateSampleZPL());
  const patternTest = await testDirectPrinting(host, port, testPattern);
  
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
