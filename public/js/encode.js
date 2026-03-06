import { getCapacity, embedBits, buildPacket } from './steg.js';
import { compressData } from './compress.js';
import { encrypt } from './crypto.js';

// grab all the encode tab elements
const fileInput = document.getElementById('encode-file');
const preview = document.getElementById('encode-preview');
const messageInput = document.getElementById('encode-message');
const capacityDisplay = document.getElementById('encode-capacity');
const passwordInput = document.getElementById('encode-password');
const encodeButton = document.getElementById('encode-button');
const status = document.getElementById('encode-status');

// hidden canvas where we manipulate pixel data
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

let loadedImage = null;
let originalFileName = '';

// PNG output ~4 bytes per pixel; cap so output stays under 5MB
const MAX_PNG_BYTES = 5 * 1024 * 1024;
const BYTES_PER_PIXEL = 4;
const MAX_PIXELS = Math.floor(MAX_PNG_BYTES / BYTES_PER_PIXEL);

// scale down image dimensions so total pixels stay under the limit
function fitDimensions(width, height) {
  const totalPixels = width * height;
  if (totalPixels <= MAX_PIXELS) return { width, height };
  const scale = Math.sqrt(MAX_PIXELS / totalPixels);
  return {
    width: Math.floor(width * scale),
    height: Math.floor(height * scale),
  };
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;

  // validate file type
  if (!file.type.match(/^image\/(png|jpeg)$/)) {
    status.textContent = 'Unsupported format — please use PNG or JPG.';
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    status.textContent = 'File too large — max 5MB.';
    return;
  }

  // strip existing _steg suffix to avoid _steg_steg_steg...
  originalFileName = file.name.replace(/\.[^.]+$/, '').replace(/_steg$/, '');
  const reader = new FileReader();

  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      loadedImage = image;
      preview.src = image.src;
      preview.hidden = false;

      // scale down if needed so output PNG stays under 5MB
      const fit = fitDimensions(image.width, image.height);
      canvas.width = fit.width;
      canvas.height = fit.height;
      ctx.drawImage(image, 0, 0, fit.width, fit.height);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const maxBits = getCapacity(pixels);
      const maxChars = Math.floor((maxBits - 40) / 8);
      capacityDisplay.textContent = `0 / ${maxChars.toLocaleString()} chars available`;

      status.textContent = '';
    };
    image.src = reader.result;
  };

  reader.readAsDataURL(file);
});

// update character count as user types
messageInput.addEventListener('input', () => {
  if (!loadedImage) return;
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const maxBits = getCapacity(pixels);
  const maxChars = Math.floor((maxBits - 40) / 8);
  const typed = new TextEncoder().encode(messageInput.value).length;
  capacityDisplay.textContent = `${typed.toLocaleString()} / ${maxChars.toLocaleString()} chars available`;
});

encodeButton.addEventListener('click', async () => {
  if (!loadedImage) {
    status.textContent = 'Please select an image first.';
    return;
  }
  if (!messageInput.value.trim()) {
    status.textContent = 'Please enter a message to hide.';
    return;
  }

  try {
    // step 1: convert message text to bytes
    const messageBytes = new TextEncoder().encode(messageInput.value);

    // step 2: compress the message
    let payload = compressData(messageBytes);
    let flags = 0x02; // compressed flag

    // step 3: encrypt if password provided
    const password = passwordInput.value;
    if (password) {
      payload = await encrypt(payload, password);
      flags = 0x03; // compressed + encrypted
    }

    // step 4: build the binary packet (header + payload as bits)
    const bitArray = buildPacket(new Uint8Array(payload), flags);

    // step 5: draw image onto canvas (scaled to fit under 5MB PNG)
    const fit = fitDimensions(loadedImage.width, loadedImage.height);
    canvas.width = fit.width;
    canvas.height = fit.height;
    ctx.drawImage(loadedImage, 0, 0, fit.width, fit.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // step 6: embed the bits into the pixel LSBs
    embedBits(pixels, bitArray);

    // step 7: put modified pixels back and export as PNG
    ctx.putImageData(pixels, 0, 0);
    canvas.toBlob((blob) => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${originalFileName}_steg.png`;
      link.click();
      URL.revokeObjectURL(link.href);
      status.textContent = 'Message encoded and downloaded!';
    }, 'image/png');
  } catch (error) {
    status.textContent = error.message;
  }
});
