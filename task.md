# InvisiBits — Project Plan & Implementation Guide

## Overview

A minimal web-based steganography tool that hides and reveals text messages within images (and audio) using LSB (Least Significant Bit) technique. Built with vanilla HTML/CSS/JS frontend and Node.js/Express backend.

**Design philosophy:** No frameworks, no bundlers, no build step. Each file does one thing. Every module boundary is a clean function interface.

---

## Tech Stack

- **Frontend:** Vanilla HTML, CSS, JavaScript (ES modules)
- **Backend:** Node.js + Express (serves static files + audio API)
- **Encryption:** Web Crypto API (AES-GCM + PBKDF2), client-side only
- **Compression:** pako library (loaded from CDN: `https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js`)
- **Containerization:** Docker (single container, node:20-alpine)
- **No database, no build tools, no React, no bundler**

---

## File Structure

```
invisibits/
├── server.js              # Express server: static files + audio API routes
├── package.json           # Only dependency: express + multer (for audio file uploads)
├── Dockerfile
├── .dockerignore
├── README.md
└── public/
    ├── index.html         # Single page, tab-based UI (Encode | Decode | Detect)
    ├── style.css          # Minimal, clean styling
    └── js/
        ├── main.js        # Tab switching, shared UI helpers
        ├── steg.js        # Core LSB engine: embedBits(), extractBits()
        ├── crypto.js      # AES-GCM encrypt/decrypt via Web Crypto API
        ├── compress.js    # pako wrapper: compress/decompress
        ├── encode.js      # Encode tab orchestrator + UI handlers
        ├── decode.js      # Decode tab orchestrator + UI handlers
        ├── detect.js      # Steg detection: chi-square analysis + LSB plane visualization
        └── audio.js       # Audio steg UI: sends files to backend API
```

**13 files total. That's it.**

---

## Module Specifications

### `steg.js` — Core LSB Engine

The heart of the project. Operates on raw Canvas ImageData. Knows nothing about encryption, compression, or UI.

**Exports:**

- `embedBits(imageData, bitArray)` → mutates imageData in place, writes bits into LSB of R, G, B channels (skip Alpha). Throws if bitArray is too long for the image.
- `extractBits(imageData, numBits)` → returns a Uint8Array of bit values (0 or 1). Reads LSB of R, G, B channels sequentially.
- `getCapacity(imageData)` → returns max number of bits that can be embedded: `width * height * 3`

**LSB embedding order:** For each pixel, left to right, top to bottom: R channel LSB, then G channel LSB, then B channel LSB. Skip Alpha entirely (modifying alpha is visible).

**Important:** Canvas context must be created with `{ willReadFrequently: true }` to avoid alpha premultiplication issues.

### `crypto.js` — Encryption Layer

Client-side only. Uses Web Crypto API. Knows nothing about images or steganography.

**Exports:**

- `encrypt(data, password)` → returns Uint8Array containing: `[16 bytes salt][12 bytes IV][N bytes ciphertext]`
- `decrypt(data, password)` → takes Uint8Array in the above format, returns decrypted Uint8Array. Throws on wrong password.

**Implementation details:**

- Key derivation: PBKDF2 with 100,000 iterations, SHA-256, random 16-byte salt
- Encryption: AES-GCM with random 12-byte IV
- Salt and IV are prepended to the ciphertext so they're embedded alongside the encrypted payload

### `compress.js` — Compression Wrapper

Thin wrapper around pako. Loaded via CDN `<script>` tag in index.html (not an ES module import).

**Exports:**

- `compressData(uint8Array)` → returns compressed Uint8Array (pako.deflate)
- `decompressData(uint8Array)` → returns decompressed Uint8Array (pako.inflate)

### `encode.js` — Encode Orchestrator

Handles the Encode tab UI and orchestrates the encoding pipeline.

**Pipeline:**

```
1. User selects image (PNG or JPG, validate ≤ 5MB)
2. User enters text message
3. User optionally enters password
4. On "Encode" button click:
   a. Convert text to Uint8Array (TextEncoder)
   b. Compress the bytes (compressData)
   c. If password provided: encrypt the compressed bytes (encrypt)
   d. Build binary packet: [32-bit length][8-bit flags][payload]
   e. Check total bits ≤ image capacity (error if too long)
   f. Load image onto hidden canvas, getImageData
   g. Call embedBits(imageData, bitArray)
   h. putImageData back onto canvas
   i. Export canvas as PNG blob
   j. Trigger download as "{originalName}_steg.png"
```

**UI elements:**

- File input (accept=".png,.jpg,.jpeg", validate ≤ 5MB)
- Image preview (show uploaded image)
- Textarea for message
- Character count / capacity indicator (e.g., "142 / 3,750 chars available")
- Password input (optional, type=password)
- Encode button
- Status/error message area

### `decode.js` — Decode Orchestrator

Handles the Decode tab UI and orchestrates the decoding pipeline.

**Pipeline:**

```
1. User uploads steganographic image (PNG or JPG, validate ≤ 5MB)
2. User optionally enters password
3. On "Decode" button click:
   a. Load image onto hidden canvas, getImageData
   b. Extract first 40 bits: 32-bit length + 8-bit flags
   c. Parse flags: bit 0 = encrypted, bit 1 = compressed
   d. Extract (length * 8) more bits for payload
   e. Convert bits to Uint8Array
   f. If encrypted flag set: decrypt(payload, password) — error if no password provided
   g. If compressed flag set: decompressData(payload)
   h. Convert Uint8Array to text (TextDecoder)
   i. Display message in UI
```

**UI elements:**

- File input (accept=".png,.jpg,.jpeg", validate ≤ 5MB)
- Password input (optional, type=password)
- Decode button
- Message display area (readonly textarea or div)
- "Download as .txt" button (creates Blob, triggers download)
- Status/error message area

### `detect.js` — Steganography Detection

Analyzes images for signs of LSB steganography. Standalone module.

**Exports / features:**

- Chi-square analysis: Compare observed vs expected distribution of LSB pairs in each channel. High chi-square value → likely natural image. Low/uniform → likely contains embedded data. Display a confidence score.
- LSB plane visualization: Extract only the LSB of each R, G, B channel and render as a black/white image on a canvas. Natural images show structured patterns; steg images show noise in the embedded region.

**UI elements:**

- File input for image
- "Analyze" button
- Results display: confidence score + interpretation text
- LSB plane canvas (visual output)

### `audio.js` — Audio Steganography (Client-Side UI)

UI-only module. Sends files to the backend for processing.

**Encode flow:**

```
1. User selects WAV file (validate .wav, ≤ 5MB)
2. User enters text message
3. User optionally enters password
4. POST to /api/audio/encode with FormData: { audio: file, message: text, password?: string }
5. Receive processed WAV as blob download
```

**Decode flow:**

```
1. User uploads steganographic WAV
2. User optionally enters password
3. POST to /api/audio/decode with FormData: { audio: file, password?: string }
4. Receive JSON: { message: string }
5. Display message, offer .txt download
```

### `server.js` — Express Backend

Minimal. Three responsibilities:

1. Serve `public/` as static files
2. `POST /api/audio/encode` — Accept WAV + message + optional password, return modified WAV
3. `POST /api/audio/decode` — Accept WAV + optional password, return extracted message

**Audio LSB logic (server-side):**

- Parse WAV header (first 44 bytes for standard PCM WAV)
- Audio samples are 16-bit integers (for 16-bit WAV). Modify LSB of each sample, same concept as image pixels
- Use the same binary packet format: [32-bit length][8-bit flags][payload]
- For encryption/compression on audio: do it server-side using Node's `crypto` module (AES-256-GCM + PBKDF2) and `pako` (install as npm dependency)
- Return modified WAV as a downloadable file

**Dependencies (package.json):**

- `express` — web server
- `multer` — multipart file upload parsing
- `pako` — compression (server-side for audio)

### `main.js` — Shared UI Logic

- Tab switching (Encode | Decode | Detect)
- Shared helper functions: file validation, error display, download trigger
- Initialize event listeners on DOMContentLoaded

---

## Binary Packet Format

Every embedded message (image or audio) uses this exact format:

```
Byte layout of the embedded bit stream:

[Bits 0-31]   Message payload length in bytes (32-bit unsigned integer, big-endian)
[Bits 32-39]  Flags byte:
                - Bit 0 (LSB): encrypted (1 = yes, 0 = no)
                - Bit 1: compressed (1 = yes, 0 = no)
                - Bits 2-7: reserved (set to 0)
[Bits 40+]    Payload bytes (length specified by header)
```

If the encrypted flag is set, the payload bytes have this internal structure:

```
[Bytes 0-15]   PBKDF2 salt (16 bytes)
[Bytes 16-27]  AES-GCM IV (12 bytes)
[Bytes 28+]    AES-GCM ciphertext (includes GCM auth tag)
```

**Conversion helpers needed:**

- `uint8ArrayToBits(uint8Array)` → array of 0s and 1s
- `bitsToUint8Array(bitArray)` → Uint8Array
- `numberTo32Bits(num)` → array of 32 bits (big-endian)
- `bitsToNumber(bitArray)` → number (from 32 bits, big-endian)

Put these in `steg.js` as internal helpers or export them.

---

## UI Layout (index.html)

Single page. Three tabs across the top. Only one tab's content visible at a time.

```
┌──────────────────────────────────────┐
│  [Encode]  [Decode]  [Detect]        │
├──────────────────────────────────────┤
│                                      │
│  Tab content here                    │
│                                      │
│  Each tab has a toggle:              │
│  ( ) Image  ( ) Audio                │
│  (only on Encode and Decode tabs)    │
│                                      │
└──────────────────────────────────────┘
```

Keep it minimal. No animations, no fancy components. Clear labels, clear feedback.

---

## Error Handling Requirements

Every user-facing operation must handle:

- **File too large:** Reject files > 5MB with clear message
- **Wrong file type:** Only accept PNG, JPG/JPEG for images; WAV for audio
- **Message too long:** Calculate capacity before encoding, show remaining capacity, reject if exceeded
- **Wrong/missing password:** decrypt() will throw — catch and show "Wrong password or image doesn't contain a message"
- **Corrupted/non-steg image on decode:** If extracted length header is nonsensical (> image capacity or negative), show "No hidden message found"
- **General try/catch:** Wrap all async operations, display errors in the status area

---

## JPG Handling

**Critical:** JPG is lossy. Saving as JPG destroys LSB data. The rule:

- Accept JPG uploads for encoding (users might only have JPGs)
- **Always output PNG** after encoding (this preserves the LSB data)
- On decode, accept both PNG and JPG (though JPG steg images from other tools might have degraded data)
- Note this in the UI: "Encoded images are saved as PNG to preserve hidden data"

---

## Docker

**Dockerfile:**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

**.dockerignore:**

```
node_modules
.git
README.md
```

**Run command:** `docker build -t invisibits . && docker run -p 3000:3000 invisibits`

---

## Implementation Order

Build and test each step before moving to the next. Every step should be independently verifiable.

### Step 1: Project skeleton
- Create file structure
- `server.js` with Express serving `public/` on port 3000
- `index.html` with three empty tabs
- `style.css` with basic layout
- `main.js` with tab switching
- `package.json` with express + multer
- **Verify:** `npm start` → browser shows tabbed UI

### Step 2: Core LSB engine (`steg.js`)
- Implement `embedBits()`, `extractBits()`, `getCapacity()`
- Implement bit conversion helpers
- **Verify:** Write a test in browser console — embed a known bit array into a test image, extract it back, confirm they match

### Step 3: Basic image encode/decode (no crypto, no compression)
- `encode.js`: upload image → enter text → embed (flags = 0x00, no compression/encryption) → download PNG
- `decode.js`: upload steg image → extract → display text → download .txt
- **Verify:** Encode "Hello World" into an image, decode it back. Try with different image sizes. Try with JPG input.

### Step 4: Compression (`compress.js`)
- Add pako CDN script to index.html
- Integrate compression into encode/decode pipeline
- Set compressed flag in header
- **Verify:** Encode a long message, confirm decoded output matches. Compare steg image from step 3 vs step 4 — compressed version should handle longer messages.

### Step 5: Encryption (`crypto.js`)
- Implement encrypt/decrypt with Web Crypto API
- Integrate into encode/decode pipeline
- Set encrypted flag in header
- **Verify:** Encode with password, decode with same password → works. Decode with wrong password → clear error message. Encode without password, decode without password → works.

### Step 6: Steganography detection (`detect.js`)
- Chi-square analysis on LSB pairs
- LSB plane visualization (render LSB as black/white image)
- **Verify:** Analyze a normal photo → "likely clean". Analyze a steg image from step 5 → "likely contains hidden data". Visual LSB plane should show noise pattern in steg region.

### Step 7: Audio steganography (`audio.js` + `server.js` API)
- Backend: parse WAV, embed/extract LSB in audio samples
- Backend: use same packet format (length + flags + payload)
- Backend: pako + Node crypto for compression/encryption
- Frontend: upload WAV + message → POST to API → download modified WAV
- Frontend: upload steg WAV → POST to API → display message
- **Verify:** Encode message into WAV, decode it back. Listen to both WAVs — should sound identical.

### Step 8: Polish
- Error handling on every operation
- Capacity indicator on encode tab
- Input validation (file size, file type)
- Clean status messages
- Responsive layout (basic, nothing fancy)

### Step 9: Docker
- Write Dockerfile and .dockerignore
- **Verify:** `docker build -t invisibits . && docker run -p 3000:3000 invisibits` → everything works

### Step 10: README
- Project overview
- Setup instructions (npm and Docker)
- Usage guide with examples
- List of features including extras/bonuses

---

## Style Guidelines

- **CSS:** Minimal. Dark or light theme, pick one. Clean inputs, clear labels. No CSS frameworks.
- **JS:** Use ES module syntax (`import`/`export`) via `<script type="module">`. No classes unless necessary, prefer plain functions. No global state — each module manages its own.
- **Error messages:** Always user-friendly. Never expose stack traces. Always suggest what to do next.
- **Code comments:** Comment the "why", not the "what". Especially comment the binary packet format and LSB embedding order.
