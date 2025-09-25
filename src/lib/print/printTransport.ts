// printTransport.ts
// QZ Tray must be included in index.html, or imported; assumes qz is global.
declare const qz: any;

let connected = false;
async function ensureConnected() {
  if (connected) return;
  if (!window.hasOwnProperty("qz")) {
    throw new Error("QZ Tray not found on window. Make sure QZ Tray is installed and qz is available.");
  }
  await qz.websocket.connect();
  connected = true;
}

export async function sendZpl(zpl: string): Promise<void> {
  await ensureConnected();
  // Choose default printer; customize if needed
  const config = qz.configs.create(null, { encoding: "raw" });
  await qz.print(config, [{ type: "raw", format: "plain", data: zpl }]);
}