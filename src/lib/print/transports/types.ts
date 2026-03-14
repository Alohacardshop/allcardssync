/**
 * Print Transport Abstraction
 * 
 * A transport takes a ZPL payload string and delivers it to a printer.
 * The PrintQueue already uses this signature internally — we're just
 * making it a first-class concept so we can swap implementations.
 */
export type PrintTransport = (payload: string) => Promise<void>;

export type TransportMode = 'mock' | 'qz-tray';
