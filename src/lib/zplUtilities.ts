// ZPL Utility Commands for Zebra Printers
// Uses QZ Tray for printing utility commands

// Configuration and status commands
export const ZPL_COMMANDS = {
  // Print configuration info
  PRINT_CONFIG: '^XA^HH^XZ',
  
  // Calibration commands
  GAP_SENSOR_SETUP: '^XA^JUS^XZ',
  MEDIA_DETECTION: '^XA^MNY^XZ', 
  SAVE_SETTINGS: '^XA^JUS^XZ',
  
  // Status queries
  PRINTER_STATUS: '^XA~HS^XZ',
  HOST_IDENTIFICATION: '^XA^HH^XZ',
  
  // Test patterns
  TEST_PATTERN: `^XA
^LL203
^FO50,50^GB100,100,3^FS
^FO75,75^A0N,20,20^FDTEST^FS
^PQ1
^XZ`,

  // Network configuration test
  NETWORK_CONFIG: '^XA^HH^XZ',
  
  // Print head cleaning (for maintenance)
  PRINT_HEAD_TEST: `^XA
^LL203
^FO10,10^GB386,183,3^FS
^FO20,20^A0N,30,30^FDPRINT HEAD TEST^FS
^FO20,60^A0N,20,20^FD================^FS
^FO20,90^A0N,20,20^FDCheck for streaks^FS
^FO20,120^A0N,20,20^FDor missing lines^FS
^FO20,150^A0N,20,20^FD================^FS
^PQ1
^XZ`,

  // Darkness test pattern
  DARKNESS_TEST: `^XA
^LL203
^FO10,10^A0N,20,20^FDDARKNESS TEST^FS
^FO10,40^GB50,20,20^FS
^FO70,40^GB50,20,15^FS
^FO130,40^GB50,20,10^FS
^FO190,40^GB50,20,5^FS
^FO250,40^GB50,20,1^FS
^FO10,70^A0N,15,15^FD20^FS
^FO70,70^A0N,15,15^FD15^FS
^FO130,70^A0N,15,15^FD10^FS
^FO190,70^A0N,15,15^FD5^FS
^FO250,70^A0N,15,15^FD1^FS
^PQ1
^XZ`
};

// Utility functions for printer diagnostics via QZ Tray
export interface PrinterUtilityOptions {
  printerName: string;
}

export class ZPLUtilities {
  
  static async sendUtilityCommand(
    command: string,
    description: string,
    options: PrinterUtilityOptions
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      // Dynamically import QZ Tray to avoid circular dependencies
      const { isConnected, printZpl } = await import('@/lib/qzTray');
      
      if (!isConnected()) {
        return {
          success: false,
          error: 'QZ Tray is not connected. Please ensure QZ Tray is running.'
        };
      }
      
      await printZpl(options.printerName, command);
      
      return {
        success: true,
        message: `${description} sent successfully`
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  static async printConfiguration(options: PrinterUtilityOptions) {
    return this.sendUtilityCommand(
      ZPL_COMMANDS.PRINT_CONFIG,
      'Configuration print',
      options
    );
  }

  static async calibrateGapSensor(options: PrinterUtilityOptions) {
    try {
      // Send calibration sequence with delays
      const step1 = await this.sendUtilityCommand(
        ZPL_COMMANDS.GAP_SENSOR_SETUP,
        'Gap sensor setup',
        options
      );
      
      if (!step1.success) return step1;
      
      // Wait for sensor setup
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const step2 = await this.sendUtilityCommand(
        ZPL_COMMANDS.MEDIA_DETECTION,
        'Media detection',
        options
      );
      
      if (!step2.success) return step2;
      
      // Wait for media detection
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const step3 = await this.sendUtilityCommand(
        ZPL_COMMANDS.SAVE_SETTINGS,
        'Save calibration',
        options
      );
      
      return step3.success ? {
        success: true,
        message: 'Gap sensor calibration completed successfully'
      } : step3;
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Calibration sequence failed'
      };
    }
  }

  static async printTestPattern(options: PrinterUtilityOptions) {
    return this.sendUtilityCommand(
      ZPL_COMMANDS.TEST_PATTERN,
      'Test pattern print',
      options
    );
  }

  static async printHeadTest(options: PrinterUtilityOptions) {
    return this.sendUtilityCommand(
      ZPL_COMMANDS.PRINT_HEAD_TEST,
      'Print head test',
      options
    );
  }

  static async printDarknessTest(options: PrinterUtilityOptions) {
    return this.sendUtilityCommand(
      ZPL_COMMANDS.DARKNESS_TEST,
      'Darkness test pattern',
      options
    );
  }
}

// Export individual utility functions for convenience
export const printConfiguration = ZPLUtilities.printConfiguration.bind(ZPLUtilities);
export const calibrateGapSensor = ZPLUtilities.calibrateGapSensor.bind(ZPLUtilities);
export const printTestPattern = ZPLUtilities.printTestPattern.bind(ZPLUtilities);
export const printHeadTest = ZPLUtilities.printHeadTest.bind(ZPLUtilities);
export const printDarknessTest = ZPLUtilities.printDarknessTest.bind(ZPLUtilities);
