export function compressData(raw) {
  const compressed = pako.deflate(raw);
  return compressed;
}

export function decompressData(compressed) {
  const raw = pako.inflate(compressed);
  return raw;
}
