// --- Bit conversion helpers ---

function uint8ArrayToBits(uint8Array) {
  const bits = [];
  for (let i = 0; i < uint8Array.length; i++) {
    for (let b = 7; b >= 0; b--) {
      bits.push((uint8Array[i] >> b) & 1);
    }
  }
  return bits;
}

function bitsToUint8Array(bitArray) {
  const bytes = new Uint8Array(bitArray.length / 8);
  for (let i = 0; i < bytes.length; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) {
      byte = (byte << 1) | bitArray[i * 8 + b];
    }
    bytes[i] = byte;
  }
  return bytes;
}

function numberTo32Bits(num) {
  const bits = [];
  for (let i = 31; i >= 0; i--) {
    bits.push((num >>> i) & 1);
  }
  return bits;
}

function bitsToNumber(bitArray) {
  return bitArray.reduce((acc, bit) => (acc * 2) + bit, 0);
}

// --- Core LSB engine ---

export function getCapacity(imageData) {
  return imageData.width * imageData.height * 3;
}

export function embedBits(imageData, bitArray) {
  if (bitArray.length > getCapacity(imageData)) {
    throw new Error('Message too long for this image');
  }
  let bitIndex = 0;
  for (let i = 0; i < imageData.data.length; i++) {
    if (i % 4 !== 3) {
      imageData.data[i] = (imageData.data[i] & 0xFE) | bitArray[bitIndex];
      bitIndex++;
      if (bitIndex >= bitArray.length) {
        return;
      }
    }
  }
}

export function extractBits(imageData, numBits) {
  const bits = [];
  for (let i = 0; i < imageData.data.length; i++) {
    if (i % 4 !== 3) {
      bits.push(imageData.data[i] & 1);
      if (bits.length >= numBits) {
        return bits;
      }
    }
  }
  return bits;
}

// --- Packet helpers (used by encode.js / decode.js) ---

export function buildPacket(payload, flags) {
  const lengthBits = numberTo32Bits(payload.length);
  const flagsBits = [];
  for (let i = 7; i >= 0; i--) {
    flagsBits.push((flags >> i) & 1);
  }
  const payloadBits = uint8ArrayToBits(payload);
  return [...lengthBits, ...flagsBits, ...payloadBits];
}

export function parsePacket(imageData) {
  const headerBits = extractBits(imageData, 40);
  const payloadLength = bitsToNumber(headerBits.slice(0, 32));
  const flags = bitsToNumber(headerBits.slice(32, 40));

  const capacity = getCapacity(imageData);
  if (payloadLength <= 0 || payloadLength * 8 + 40 > capacity) {
    throw new Error('No hidden message found');
  }

  const allBits = extractBits(imageData, 40 + payloadLength * 8);
  const payloadBits = allBits.slice(40);
  const payload = bitsToUint8Array(payloadBits);

  return { payload, flags };
}
