// --- Audio Steganography UI ---

const encodeFileInput = document.getElementById('audio-encode-file');
const encodeMessage = document.getElementById('audio-encode-message');
const encodePassword = document.getElementById('audio-encode-password');
const encodeButton = document.getElementById('audio-encode-button');
const encodeStatus = document.getElementById('audio-encode-status');

const decodeFileInput = document.getElementById('audio-decode-file');
const decodePassword = document.getElementById('audio-decode-password');
const decodeButton = document.getElementById('audio-decode-button');
const decodeStatus = document.getElementById('audio-decode-status');
const decodeOutput = document.getElementById('audio-decode-output');
const decodeDownload = document.getElementById('audio-decode-download');

let decodedText = '';

// --- Encode ---

encodeButton.addEventListener('click', async () => {
  const file = encodeFileInput.files[0];
  if (!file) {
    encodeStatus.textContent = 'Please select a WAV file first.';
    return;
  }

  if (!file.name.toLowerCase().endsWith('.wav')) {
    encodeStatus.textContent = 'Only .wav files are supported.';
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    encodeStatus.textContent = 'File too large — max 5MB.';
    return;
  }

  const message = encodeMessage.value.trim();
  if (!message) {
    encodeStatus.textContent = 'Please enter a message to hide.';
    return;
  }

  const password = encodePassword.value;

  const formData = new FormData();
  formData.append('audio', file);
  formData.append('message', message);
  if (password) {
    formData.append('password', password);
  }

  encodeStatus.textContent = 'Encoding...';
  encodeButton.disabled = true;

  try {
    const response = await fetch('/api/audio/encode', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Encoding failed.');
    }

    const blob = await response.blob();
    const originalName = file.name.replace(/\.wav$/i, '').replace(/_steg$/, '');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${originalName}_steg.wav`;
    link.click();
    URL.revokeObjectURL(link.href);
    encodeStatus.textContent = 'Message encoded and downloaded!';
  } catch (error) {
    encodeStatus.textContent = error.message;
  } finally {
    encodeButton.disabled = false;
  }
});

// --- Decode ---

decodeButton.addEventListener('click', async () => {
  const file = decodeFileInput.files[0];
  if (!file) {
    decodeStatus.textContent = 'Please select a WAV file first.';
    return;
  }

  if (!file.name.toLowerCase().endsWith('.wav')) {
    decodeStatus.textContent = 'Only .wav files are supported.';
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    decodeStatus.textContent = 'File too large — max 5MB.';
    return;
  }

  const password = decodePassword.value;

  const formData = new FormData();
  formData.append('audio', file);
  if (password) {
    formData.append('password', password);
  }

  decodeStatus.textContent = 'Decoding...';
  decodeButton.disabled = true;

  try {
    const response = await fetch('/api/audio/decode', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Decoding failed.');
    }

    const data = await response.json();
    decodedText = data.message;
    decodeOutput.value = decodedText;
    decodeDownload.hidden = false;
    decodeStatus.textContent = 'Message decoded!';
  } catch (error) {
    decodeStatus.textContent = error.message;
    decodeOutput.value = '';
    decodeDownload.hidden = true;
  } finally {
    decodeButton.disabled = false;
  }
});

// --- Download decoded message ---

decodeDownload.addEventListener('click', () => {
  const blob = new Blob([decodedText], { type: 'text/plain' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'decoded_message.txt';
  link.click();
  URL.revokeObjectURL(link.href);
});
