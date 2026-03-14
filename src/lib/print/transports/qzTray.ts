/**
 * QZ Tray Transport — sends raw ZPL to a named printer via QZ Tray.
 * This is the production transport for Zebra ZD611 printers.
 */
import { zebraService } from '@/lib/printer/zebraService';
import { logger } from '@/lib/logger';
import { getConfiguredPrinter } from '../queueInstance';
import type { PrintTransport } from './types';

export const qzTrayTransport: PrintTransport = async (payload) => {
  const printerName = getConfiguredPrinter() || zebraService.getConfig()?.name || null;

  if (!printerName) {
    const error = 'No printer configured. Please select a printer in Settings.';
    logger.error('Printer config missing', new Error(error), undefined, 'print-transport');
    throw new Error(error);
  }

  logger.info('Sending print job via QZ Tray', {
    printerName,
    payloadSize: payload.length,
  }, 'print-transport');

  const result = await zebraService.print(payload, printerName);

  if (!result.success) {
    throw new Error(result.error || 'Print failed');
  }

  logger.info('Print job sent successfully via QZ Tray', {
    printerName,
    message: result.message,
  }, 'print-transport');
};
