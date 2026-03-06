// --- Bit conversion helpers ---

// takes a Uint8Array (raw bytes) and returns an array of 0s and 1s
// each byte becomes 8 bits, most significant bit first
function uint8ArrayToBits(uint8Array) {
  let bitArray = [];
  for (let index = 0; index < uint8Array.length; index++) {
    // shift right from bit 7 down to 0, mask with & 1 to get each bit
    for (let i = 7; i >= 0; i--) {
      bitArray.push((uint8Array[index] >> i) & 1);
    }
  }
  return bitArray;
}

// reverse of uint8ArrayToBits — groups bits back into bytes
// takes array of 0s and 1s, returns Uint8Array
function bitsToUint8Array(bitArray) {
  const bytes = new Uint8Array(bitArray.length / 8);
  for (let i = 0; i < bytes.length; i++) {
    // grab 8 bits at a time and rebuild the byte
    const character = bitArray.slice(i * 8, i * 8 + 8);
    // shift left and OR each bit in: [1,0,1] becomes 101 in binary = 5
    bytes[i] = character.reduce((acc, bit) => (acc << 1) | bit, 0);
  }
  return bytes;
}

// converts an array of bits (0s and 1s) into a single number
// uses * 2 instead of << 1 to avoid sign issues with 32-bit numbers
function bitsToNumber(bitArray) {
  return bitArray.reduce((acc, bit) => (acc * 2) + bit, 0);
}

// --- Core LSB engine ---

// max bits we can hide: 3 per pixel (R, G, B channels, skip Alpha)
export function getCapacity(imageData) {
  return imageData.width * imageData.height * 3;
}

// writes bits into the LSB of each R, G, B channel in the pixel data
// imageData.data is a flat array: [R, G, B, A, R, G, B, A, ...]
// x % 4 === 3 skips every Alpha byte (every 4th value)
// & 0xFE clears the LSB, then | bit sets it to our message bit
export function embedBits(imageData, bitArray) {
  if (bitArray.length > getCapacity(imageData)) {
    throw new Error('Message too long for this image');
  }
  let bitIndex = 0;
  for (let x = 0; x < imageData.data.length; x++) {
    if (x % 4 !== 3) {
      imageData.data[x] = (imageData.data[x] & 0xFE) | bitArray[bitIndex];
      bitIndex++;
      if (bitIndex >= bitArray.length) {
        return;
      }
    }
  }
}

// reads LSB from each R, G, B channel to recover hidden bits
// mirrors embedBits — same skip pattern, same order
export function extractBits(imageData, numBits) {
  const bits = [];
  for (let i = 0; i < imageData.data.length; i++) {
    if (i % 4 !== 3) {
      // & 1 extracts just the least significant bit
      bits.push(imageData.data[i] & 1);
      if (bits.length >= numBits) {
        return bits;
      }
    }
  }
  return bits;
}

// --- Packet helpers (embedBits && extractBits) ---

// magic bytes "IB" (0x49 0x42) to identify InvisiBits packets
const MAGIC = [0x49, 0x42];
const MAGIC_BITS = 16;
const HEADER_BITS = MAGIC_BITS + 32 + 8; // magic + length + flags = 56 bits

// flags byte: bit 0 = encrypted, bit 1 = compressed
// 0x00 = plain, 0x01 = encrypted, 0x02 = compressed, 0x03 = both
export function buildPacket(messageBytes, optionFlags) {
  let msgArray = [];
  // 16-bit magic header ("IB") to identify valid packets
  for (const byte of MAGIC) {
    for (let i = 7; i >= 0; i--) {
      msgArray.push((byte >> i) & 1);
    }
  }
  // 32-bit length header (how many bytes in the payload)
  for (let i = 31; i >= 0; i--) {
    msgArray.push((messageBytes.length >>> i) & 1);
  }
  // 8-bit flags (encrypted? compressed?)
  for (let i = 7; i >= 0; i--) {
    msgArray.push((optionFlags >> i) & 1);
  }
  // the actual payload bytes as bits
  const payloadBits = uint8ArrayToBits(messageBytes);
  for (let i = 0; i < payloadBits.length; i++) {
    msgArray.push(payloadBits[i]);
  }
  return msgArray;
}

export function parsePacket(imageData) {
  // read first 56 bits: 16 magic + 32 length + 8 flags
  let headerBits = extractBits(imageData, HEADER_BITS);

  // verify magic bytes — catches JPEG corruption, non-steg images, other tools
  let magicByte0 = bitsToNumber(headerBits.slice(0, 8));
  let magicByte1 = bitsToNumber(headerBits.slice(8, 16));
  if (magicByte0 !== MAGIC[0] || magicByte1 !== MAGIC[1]) {
    throw new Error('No hidden message found — image may not contain InvisiBits data');
  }

  let msgLength = bitsToNumber(headerBits.slice(MAGIC_BITS, MAGIC_BITS + 32));
  let optionFlags = bitsToNumber(headerBits.slice(MAGIC_BITS + 32, HEADER_BITS));
  let isEncrypted = (optionFlags & 1) === 1;
  let isCompressed = (optionFlags & 2) === 2;

  if (msgLength <= 0 || msgLength * 8 + HEADER_BITS > getCapacity(imageData)) {
    throw new Error('No hidden message found');
  }

  // read all bits: header + payload
  let allBits = extractBits(imageData, HEADER_BITS + msgLength * 8);
  let messageBytes = bitsToUint8Array(allBits.slice(HEADER_BITS));

  return { messageBytes, isEncrypted, isCompressed };
}
