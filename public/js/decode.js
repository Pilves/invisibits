import { parsePacket } from './steg.js';
import { decompressData } from './compress.js';
import { decrypt } from './crypto.js';

// grab all the decode tab elements
const fileInput = document.getElementById('decode-file');
const passwordInput = document.getElementById('decode-password');
const decodeButton = document.getElementById('decode-button');
const messageOutput = document.getElementById('decode-output');
const downloadButton = document.getElementById('decode-download');
const status = document.getElementById('decode-status');

// hidden canvas for reading pixel data
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

let decodedText = '';

decodeButton.addEventListener('click', () => {
  const file = fileInput.files[0];
  if (!file) {
    status.textContent = 'Please select an image first.';
    return;
  }

  if (!file.type.match(/^image\/(png|jpeg)$/)) {
    status.textContent = 'Unsupported format — please use PNG or JPG.';
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    const image = new Image();
    image.onload = async () => {
      try {
        // draw image onto hidden canvas to access pixel data
        canvas.width = image.width;
        canvas.height = image.height;
        ctx.drawImage(image, 0, 0);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // extract header + payload from pixel LSBs
        const { messageBytes, isEncrypted, isCompressed } = parsePacket(pixels);

        let payload = messageBytes;

        // decrypt if needed
        if (isEncrypted) {
          const password = passwordInput.value;
          if (!password) {
            status.textContent = 'This message is encrypted. Please enter the password.';
            return;
          }
          try {
            payload = await decrypt(payload, password);
          } catch {
            status.textContent = 'Wrong password or image doesn\'t contain a message.';
            return;
          }
        }

        // decompress if needed
        if (isCompressed) {
          payload = decompressData(payload);
        }

        // convert bytes back to text
        decodedText = new TextDecoder().decode(payload);
        messageOutput.value = decodedText;
        downloadButton.hidden = false;
        status.textContent = 'Message decoded!';
      } catch (error) {
        status.textContent = error.message;
        messageOutput.value = '';
        downloadButton.hidden = true;
      }
    };
    image.src = reader.result;
  };

  reader.readAsDataURL(file);
});

// download decoded message as .txt
downloadButton.addEventListener('click', () => {
  const blob = new Blob([decodedText], { type: 'text/plain' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'decoded_message.txt';
  link.click();
  URL.revokeObjectURL(link.href);
});
