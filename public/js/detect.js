// --- Detect tab: chi-square analysis + LSB plane visualization ---

const fileInput = document.getElementById('detect-file');
const analyzeButton = document.getElementById('detect-button');
const statusText = document.getElementById('detect-status');
const resultDiv = document.getElementById('detect-result');
const detectCanvas = document.getElementById('detect-canvas');

// loads user-selected image file into an Image object
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// pulls raw pixel data from an image using an offscreen canvas
function getPixelData(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

// chi-square on one channel, but only the first `pixelCount` pixels
// embedding goes left-to-right, top-to-bottom, so we analyze from the start
function chiSquareForChannel(pixelData, channelOffset, pixelCount) {
  const histogram = new Array(256).fill(0);
  const end = Math.min(pixelCount * 4, pixelData.length);
  for (let i = channelOffset; i < end; i += 4) {
    histogram[pixelData[i]]++;
  }

  let chiSquare = 0;
  let degreesOfFreedom = 0;

  for (let k = 0; k < 128; k++) {
    const even = histogram[2 * k];
    const odd = histogram[2 * k + 1];
    const expected = (even + odd) / 2;

    if (expected < 1) continue;

    chiSquare += ((even - expected) ** 2) / expected;
    chiSquare += ((odd - expected) ** 2) / expected;
    degreesOfFreedom++;
  }

  return { chiSquare, degreesOfFreedom };
}

// p-value: probability of seeing this chi-square if the data is uniform
// high p-value = LSBs look random = likely steg
function chiSquarePValue(chiSquare, degreesOfFreedom) {
  if (degreesOfFreedom <= 0) return 0;

  const a = degreesOfFreedom / 2;
  const x = chiSquare / 2;

  const lower = lowerIncompleteGamma(a, x);
  const full = gammaFunction(a);
  const pValue = 1 - (lower / full);

  return Math.max(0, Math.min(1, pValue));
}

function lnGamma(a) {
  const coefficients = [
    76.18009172947146, -86.50532032941677,
    24.01409824083091, -1.231739572450155,
    0.001208650973866179, -0.000005395239384953
  ];
  let x = a;
  let y = a;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let sum = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    y++;
    sum += coefficients[j] / y;
  }
  return -tmp + Math.log(2.5066282746310005 * sum / x);
}

function gammaFunction(a) {
  return Math.exp(lnGamma(a));
}

function lowerIncompleteGamma(a, x) {
  if (x <= 0) return 0;

  if (x > a + 1) {
    return gammaFunction(a) - upperIncompleteGammaCF(a, x);
  }

  let sum = 1 / a;
  let term = 1 / a;
  for (let n = 1; n < 200; n++) {
    term *= x / (a + n);
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * 1e-10) break;
  }
  return Math.exp(-x + a * Math.log(x)) * sum;
}

function upperIncompleteGammaCF(a, x) {
  let c = 1e-30;
  let d = 1 / (x + 1 - a);
  let h = d;

  for (let n = 1; n < 200; n++) {
    const an = -n * (n - a);
    const bn = x + 2 * n + 1 - a;
    d = bn + an * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = bn + an / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-10) break;
  }

  return Math.exp(-x + a * Math.log(x)) * h;
}

// progressive analysis: scan increasing portions of the image
// embedding starts at pixel 0, so we check multiple window sizes
// and report the one with the highest confidence
function analyzeImage(imageData) {
  const pixelData = imageData.data;
  const totalPixels = imageData.width * imageData.height;
  const channelNames = ['Red', 'Green', 'Blue'];

  // test these fractions of the image (from start)
  const fractions = [0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1.0];
  let bestAvgPValue = -1;
  let bestChannelResults = [];
  let bestFraction = 1.0;

  for (const fraction of fractions) {
    const pixelCount = Math.floor(totalPixels * fraction);
    if (pixelCount < 100) continue;

    const results = [];
    for (let channel = 0; channel < 3; channel++) {
      const { chiSquare, degreesOfFreedom } = chiSquareForChannel(pixelData, channel, pixelCount);
      const pValue = chiSquarePValue(chiSquare, degreesOfFreedom);
      results.push({
        name: channelNames[channel],
        chiSquare: chiSquare.toFixed(2),
        degreesOfFreedom,
        pValue
      });
    }

    const avgPValue = results.reduce((sum, r) => sum + r.pValue, 0) / 3;

    if (avgPValue > bestAvgPValue) {
      bestAvgPValue = avgPValue;
      bestChannelResults = results;
      bestFraction = fraction;
    }
  }

  if (bestAvgPValue < 0) bestAvgPValue = 0;

  const confidencePercent = (bestAvgPValue * 100).toFixed(1);

  return {
    channelResults: bestChannelResults,
    confidencePercent,
    averagePValue: bestAvgPValue,
    analyzedFraction: bestFraction
  };
}

// renders the LSB plane: shows each channel's LSB as color
function renderLSBPlane(imageData, canvas) {
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const outputData = ctx.createImageData(imageData.width, imageData.height);
  const src = imageData.data;
  const dst = outputData.data;

  for (let i = 0; i < src.length; i += 4) {
    dst[i] = (src[i] & 1) * 255;
    dst[i + 1] = (src[i + 1] & 1) * 255;
    dst[i + 2] = (src[i + 2] & 1) * 255;
    dst[i + 3] = 255;
  }

  ctx.putImageData(outputData, 0, 0);
}

function getInterpretation(averagePValue) {
  if (averagePValue > 0.8) return 'Likely contains hidden data';
  if (averagePValue > 0.5) return 'Possibly contains hidden data';
  if (averagePValue > 0.2) return 'Inconclusive';
  if (averagePValue > 0.05) return 'Probably clean image';
  return 'Likely clean image';
}

function formatResults(analysis) {
  const { channelResults, confidencePercent, averagePValue, analyzedFraction } = analysis;
  const interpretation = getInterpretation(averagePValue);
  const percent = Math.round(analyzedFraction * 100);

  let html = `<h3>${confidencePercent}% likelihood of hidden data</h3>`;
  html += `<p><strong>${interpretation}</strong></p>`;
  html += `<p class="note">Strongest signal found in first ${percent}% of image</p>`;
  if (averagePValue < 0.2) {
    html += `<p class="note">Note: Chi-square detection works best when a large portion of the image contains hidden data. Short messages are designed to be statistically undetectable — check the LSB plane below for visual clues.</p>`;
  }
  html += '<table><thead><tr><th>Channel</th><th>Chi-Square</th><th>p-value</th></tr></thead><tbody>';

  for (const result of channelResults) {
    html += `<tr>
      <td>${result.name}</td>
      <td>${result.chiSquare}</td>
      <td>${result.pValue.toFixed(4)}</td>
    </tr>`;
  }

  html += '</tbody></table>';
  return html;
}

// --- Event wiring ---

analyzeButton.addEventListener('click', async () => {
  statusText.textContent = '';
  resultDiv.innerHTML = '';

  const file = fileInput.files[0];
  if (!file) {
    statusText.textContent = 'Please select an image file.';
    return;
  }

  statusText.textContent = 'Analyzing...';

  try {
    const img = await loadImage(file);
    const imageData = getPixelData(img);

    const analysis = analyzeImage(imageData);
    resultDiv.innerHTML = formatResults(analysis);

    renderLSBPlane(imageData, detectCanvas);
    detectCanvas.hidden = false;

    statusText.textContent = 'Analysis complete.';
  } catch (error) {
    statusText.textContent = `Error: ${error.message}`;
  }
});
