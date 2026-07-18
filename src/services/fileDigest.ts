/** Computes a browser-native SHA-256 digest without uploading the file. */
export async function sha256File(file: File): Promise<string> {
  return sha256Blob(file);
}

/** Computes a SHA-256 digest for locally stored evidence bytes. */
export async function sha256Blob(blob: Blob): Promise<string> {
  return sha256ArrayBuffer(await blob.arrayBuffer());
}

export async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  return sha256ArrayBuffer(bytes.slice().buffer as ArrayBuffer);
}

async function sha256ArrayBuffer(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
