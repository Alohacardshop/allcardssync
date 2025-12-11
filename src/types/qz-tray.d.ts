/**
 * Type declarations for qz-tray package
 */

declare module 'qz-tray' {
  interface QzWebsocket {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    isActive(): boolean;
  }

  interface QzPrinters {
    find(query?: string): Promise<string[] | string>;
    getDefault(): Promise<string>;
  }

  interface QzConfigOptions {
    colorType?: 'color' | 'grayscale' | 'blackwhite';
    copies?: number;
    density?: number;
    duplex?: boolean;
    interpolation?: 'bicubic' | 'bilinear' | 'nearest-neighbor';
    jobName?: string;
    margins?: number | { top?: number; right?: number; bottom?: number; left?: number };
    orientation?: 'portrait' | 'landscape' | 'reverse-portrait' | 'reverse-landscape';
    paperThickness?: number;
    printerTray?: string;
    rasterize?: boolean;
    rotation?: number;
    scaleContent?: boolean;
    size?: { width?: number; height?: number };
    units?: 'in' | 'cm' | 'mm';
  }

  interface QzConfig {
    printer: string;
  }

  interface QzConfigs {
    create(printer: string, options?: QzConfigOptions): QzConfig;
  }

  interface QzPrintData {
    type: 'raw' | 'file' | 'image' | 'html' | 'pdf' | 'pixel';
    format?: 'plain' | 'base64' | 'hex' | 'file' | 'image' | 'command';
    flavor?: 'plain' | 'base64' | 'hex' | 'file';
    data: string;
    options?: Record<string, unknown>;
  }

  interface QzTray {
    websocket: QzWebsocket;
    printers: QzPrinters;
    configs: QzConfigs;
    print(config: QzConfig, data: QzPrintData[]): Promise<void>;
  }

  const qz: QzTray;
  export default qz;
}
