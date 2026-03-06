const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const pako = require("pako");

const app = express();
const port = 3000;
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.static("public"));

// --- Audio steganography helpers ---

const WAV_HEADER_SIZE = 44;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const PBKDF2_ITERATIONS = 100000;

function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, "sha256");
}

function encryptData(data, password) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(password, salt);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // salt + iv + authTag(16) + ciphertext
  return Buffer.concat([salt, iv, authTag, encrypted]);
}

function decryptData(data, password) {
  const salt = data.subarray(0, SALT_LENGTH);
  const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = data.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + 16);
  const ciphertext = data.subarray(SALT_LENGTH + IV_LENGTH + 16);

  const key = deriveKey(password, salt);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

const MAGIC = [0x49, 0x42]; // "IB"
const HEADER_BITS = 16 + 32 + 8; // magic + length + flags = 56 bits

function buildBitArray(payloadBytes, flags) {
  const bits = [];

  // 16-bit magic header ("IB")
  for (const byte of MAGIC) {
    for (let i = 7; i >= 0; i--) {
      bits.push((byte >> i) & 1);
    }
  }

  // 32-bit length header
  const length = payloadBytes.length;
  for (let i = 31; i >= 0; i--) {
    bits.push((length >>> i) & 1);
  }

  // 8-bit flags
  for (let i = 7; i >= 0; i--) {
    bits.push((flags >> i) & 1);
  }

  // payload bytes as bits
  for (let b = 0; b < payloadBytes.length; b++) {
    for (let i = 7; i >= 0; i--) {
      bits.push((payloadBytes[b] >> i) & 1);
    }
  }

  return bits;
}

function embedBitsInSamples(wavBuffer, bits) {
  const sampleCount = (wavBuffer.length - WAV_HEADER_SIZE) / 2;

  if (bits.length > sampleCount) {
    throw new Error("Message too long for this audio file.");
  }

  const output = Buffer.from(wavBuffer);

  for (let i = 0; i < bits.length; i++) {
    const offset = WAV_HEADER_SIZE + i * 2;
    let sample = output.readInt16LE(offset);
    sample = (sample & 0xFFFE) | bits[i];
    output.writeInt16LE(sample, offset);
  }

  return output;
}

function extractBitsFromSamples(wavBuffer, numBits) {
  const bits = [];
  const sampleCount = (wavBuffer.length - WAV_HEADER_SIZE) / 2;

  const count = Math.min(numBits, sampleCount);
  for (let i = 0; i < count; i++) {
    const offset = WAV_HEADER_SIZE + i * 2;
    const sample = wavBuffer.readInt16LE(offset);
    bits.push(sample & 1);
  }

  return bits;
}

function bitsToNumber(bitArray) {
  return bitArray.reduce((acc, bit) => acc * 2 + bit, 0);
}

function bitsToBytes(bitArray) {
  const bytes = Buffer.alloc(bitArray.length / 8);
  for (let i = 0; i < bytes.length; i++) {
    let val = 0;
    for (let j = 0; j < 8; j++) {
      val = (val << 1) | bitArray[i * 8 + j];
    }
    bytes[i] = val;
  }
  return bytes;
}

// --- Audio API routes ---

app.post("/api/audio/encode", upload.single("audio"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No audio file uploaded." });
    }

    const message = req.body.message;
    if (!message) {
      return res.status(400).json({ error: "No message provided." });
    }

    const password = req.body.password || "";
    const wavBuffer = req.file.buffer;

    // compress the message
    const messageBytes = Buffer.from(message, "utf-8");
    let payload = Buffer.from(pako.deflate(messageBytes));
    let flags = 0x02; // compressed

    // encrypt if password provided
    if (password) {
      payload = encryptData(payload, password);
      flags = 0x03; // compressed + encrypted
    }

    const bits = buildBitArray(payload, flags);
    const outputWav = embedBitsInSamples(wavBuffer, bits);

    res.set("Content-Type", "audio/wav");
    res.set("Content-Disposition", "attachment; filename=steg.wav");
    res.send(outputWav);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/audio/decode", upload.single("audio"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No audio file uploaded." });
    }

    const password = req.body.password || "";
    const wavBuffer = req.file.buffer;
    const sampleCount = (wavBuffer.length - WAV_HEADER_SIZE) / 2;

    // read 56-bit header: 16 magic + 32 length + 8 flags
    const headerBits = extractBitsFromSamples(wavBuffer, HEADER_BITS);

    // verify magic bytes
    const magicByte0 = bitsToNumber(headerBits.slice(0, 8));
    const magicByte1 = bitsToNumber(headerBits.slice(8, 16));
    if (magicByte0 !== MAGIC[0] || magicByte1 !== MAGIC[1]) {
      return res.status(400).json({ error: "No hidden message found — file may not contain InvisiBits data." });
    }

    const payloadLength = bitsToNumber(headerBits.slice(16, 48));
    const flags = bitsToNumber(headerBits.slice(48, HEADER_BITS));
    const isEncrypted = (flags & 1) === 1;
    const isCompressed = (flags & 2) === 2;

    if (payloadLength <= 0 || payloadLength * 8 + HEADER_BITS > sampleCount) {
      return res.status(400).json({ error: "No hidden message found." });
    }

    // extract all bits (header + payload)
    const allBits = extractBitsFromSamples(wavBuffer, HEADER_BITS + payloadLength * 8);
    let payload = bitsToBytes(allBits.slice(HEADER_BITS));

    // decrypt if needed
    if (isEncrypted) {
      if (!password) {
        return res.status(400).json({ error: "This message is encrypted. Please provide a password." });
      }
      payload = decryptData(payload, password);
    }

    // decompress if needed
    if (isCompressed) {
      payload = Buffer.from(pako.inflate(payload));
    }

    const message = payload.toString("utf-8");
    res.json({ message });
  } catch (error) {
    res.status(400).json({ error: error.message || "Decoding failed." });
  }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
