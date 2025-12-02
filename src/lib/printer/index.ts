/**
 * Printer module exports
 */
export * from './zebraService';
export { 
  checkBridgeStatus, 
  getSystemPrinters, 
  printToSystemPrinter,
  pingPrinter,
  type BridgeStatus, 
  type SystemPrinter 
} from './zebraService';
