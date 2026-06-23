/** Encodes bytes to base64, working in both Node.js and the browser. */
export function toBase64(bytes: Uint8Array): string {
  const bufferCtor = (globalThis as any).Buffer;
  if (typeof bufferCtor !== "undefined") {
    return bufferCtor.from(bytes).toString("base64");
  }
  const btoaFn = (globalThis as any).btoa;
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoaFn(binary);
}
