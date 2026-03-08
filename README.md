# InvisiBits

Hide secret messages inside images and audio files using LSB steganography. Built with vanilla JS — no frameworks, no bundlers, no nonsense.

## What it does

- **Encode** — hide a text message inside a PNG/JPG image or WAV audio file
- **Decode** — extract hidden messages back out
- **Detect** — analyze images for signs of hidden data (chi-square analysis + LSB plane visualization)

## Features

- LSB (Least Significant Bit) embedding in image pixels and audio samples
- AES-256-GCM encryption with password protection (PBKDF2 key derivation)
- Compression via pako/deflate to fit longer messages
- Image steg runs entirely client-side (nothing leaves your browser)
- Audio steg handled server-side via Express API
- JPG input supported — output is always PNG to preserve hidden data
- Steganography detection with confidence scoring and visual LSB plane

## Setup

```bash
npm install
npm start
```

Open `http://localhost:3000`

## Docker

```bash
docker build -t invisibits .
docker run -p 3000:3000 invisibits
```

## Tech stack

- Vanilla HTML/CSS/JS (ES modules)
- Node.js + Express
- Web Crypto API (client-side encryption)
- pako (compression)
- multer (file uploads)

## How it works

Messages get converted to binary bits and written into the least significant bit of each color channel (R, G, B) per pixel. The change is invisible to the human eye. Same idea for audio — LSB of each 16-bit sample.

Every hidden message follows this packet format:

```
[32 bits] payload length
[8 bits]  flags (encrypted? compressed?)
[N bits]  payload
```

## File structure

```
public/js/steg.js      — core LSB engine
public/js/encode.js    — image encode UI
public/js/decode.js    — image decode UI
public/js/detect.js    — steg detection
public/js/audio.js     — audio steg UI
public/js/crypto.js    — AES-GCM encryption
public/js/compress.js  — pako wrapper
public/js/main.js      — tab switching
server.js              — Express + audio API
```
