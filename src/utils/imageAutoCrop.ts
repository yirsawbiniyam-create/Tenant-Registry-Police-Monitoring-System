export type PhotoCropMode = 'id_card' | 'portrait' | 'free';

export interface NormalizedCropRect {
  x: number; // 0..1
  y: number; // 0..1
  w: number; // 0.05..1
  h: number; // 0.05..1
}

export interface LoadedImageInfo {
  dataUrl: string;
  width: number;
  height: number;
}

const ALLOWED_UPLOAD_MIME_RE = /^image\/(jpeg|jpg|png|webp|gif|bmp|heic|heif|avif)$/i;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Loads a File (from mobile camera or gallery), honors EXIF orientation,
 * and scales down huge phone camera photos cleanly to <= 1600px for smooth cropping.
 */
export async function loadImageForEditing(file: File): Promise<LoadedImageInfo> {
  if (file.size > 15 * 1024 * 1024) {
    throw new Error('የምስሉ መጠን በጣም ትልቅ ነው (ከ15MB በታች ይሁን)');
  }
  if (file.type && !ALLOWED_UPLOAD_MIME_RE.test(file.type)) {
    throw new Error('የተፈቀደ የምስል ፋይል (JPG, PNG, WEBP) ብቻ ይምረጡ');
  }

  const maxWorkDim = 1600;
  const rawUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('ምስሉን ማንበብ አልተቻለም'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onerror = () => reject(new Error('ትክክለኛ የምስል ፋይል ይምረጡ'));
    el.onload = () => resolve(el);
    el.src = rawUrl;
  });

  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
  if (w > maxWorkDim || h > maxWorkDim) {
    if (w >= h) {
      h = Math.round((h * maxWorkDim) / w);
      w = maxWorkDim;
    } else {
      w = Math.round((w * maxWorkDim) / h);
      h = maxWorkDim;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context error');
  ctx.drawImage(img, 0, 0, w, h);

  const keepAlpha = /^image\/(png|webp|gif)$/i.test(file.type || '');
  const mime = keepAlpha ? 'image/png' : 'image/jpeg';
  const dataUrl = canvas.toDataURL(mime, keepAlpha ? undefined : 0.92);

  return { dataUrl, width: w, height: h };
}

/**
 * Automatically detects the ID card or subject bounding box on a photo taken from
 * a phone camera or gallery by combining perimeter background separation + Sobel edge energy.
 */
export async function detectAutoCropBounds(
  imageDataUrl: string,
  mode: PhotoCropMode
): Promise<NormalizedCropRect> {
  if (mode === 'free') {
    return { x: 0, y: 0, w: 1, h: 1 };
  }

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onerror = () => reject(new Error('Image load failed'));
    el.onload = () => resolve(el);
    el.src = imageDataUrl;
  });

  const maxAna = 260;
  let aw = img.naturalWidth || img.width;
  let ah = img.naturalHeight || img.height;
  if (aw > maxAna || ah > maxAna) {
    if (aw >= ah) {
      ah = Math.max(40, Math.round((ah * maxAna) / aw));
      aw = maxAna;
    } else {
      aw = Math.max(40, Math.round((aw * maxAna) / ah));
      ah = maxAna;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = aw;
  canvas.height = ah;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { x: 0.06, y: 0.08, w: 0.88, h: 0.84 };
  ctx.drawImage(img, 0, 0, aw, ah);
  const { data } = ctx.getImageData(0, 0, aw, ah);

  const totalPx = aw * ah;
  const lum = new Float32Array(totalPx);
  for (let i = 0; i < totalPx; i++) {
    const idx = i * 4;
    lum[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
  }

  // Sample outer 5% border pixels to estimate surface/table/wall background color
  let bgR = 0;
  let bgG = 0;
  let bgB = 0;
  let bgCount = 0;
  const bxMargin = Math.max(2, Math.floor(aw * 0.05));
  const byMargin = Math.max(2, Math.floor(ah * 0.05));
  for (let y = 0; y < ah; y++) {
    for (let x = 0; x < aw; x++) {
      if (x < bxMargin || x >= aw - bxMargin || y < byMargin || y >= ah - byMargin) {
        const idx = (y * aw + x) * 4;
        bgR += data[idx];
        bgG += data[idx + 1];
        bgB += data[idx + 2];
        bgCount++;
      }
    }
  }
  bgR /= Math.max(1, bgCount);
  bgG /= Math.max(1, bgCount);
  bgB /= Math.max(1, bgCount);

  if (mode === 'portrait') {
    // Find weighted center of high-detail/edge subject region for clean portrait framing
    let sumWeight = 0;
    let cxSum = 0;
    let cySum = 0;
    for (let y = 2; y < ah - 2; y++) {
      for (let x = 2; x < aw - 2; x++) {
        const idx = (y * aw + x) * 4;
        const colorDiff = Math.sqrt(
          (data[idx] - bgR) ** 2 + (data[idx + 1] - bgG) ** 2 + (data[idx + 2] - bgB) ** 2
        );
        const gx = Math.abs(lum[y * aw + (x + 1)] - lum[y * aw + (x - 1)]);
        const gy = Math.abs(lum[(y + 1) * aw + x] - lum[(y - 1) * aw + x]);
        const wgt = Math.max(0, colorDiff * 0.6 + (gx + gy) * 0.8 - 18);
        if (wgt > 0) {
          sumWeight += wgt;
          cxSum += (x / aw) * wgt;
          cySum += (y / ah) * wgt;
        }
      }
    }
    const cx = sumWeight > 0 ? clamp(cxSum / sumWeight, 0.25, 0.75) : 0.5;
    const cy = sumWeight > 0 ? clamp(cySum / sumWeight, 0.25, 0.7) : 0.45;
    const boxW = aw > ah ? 0.62 : 0.82;
    const boxH = aw > ah ? 0.86 : 0.74;
    const x1 = clamp(cx - boxW / 2, 0.02, 1 - boxW - 0.02);
    const y1 = clamp(cy - boxH / 2, 0.02, 1 - boxH - 0.02);
    return { x: x1, y: y1, w: boxW, h: boxH };
  }

  // ID Card Mode: combine edge gradient + color separation along rows and columns
  const rowScore = new Float32Array(ah);
  const colScore = new Float32Array(aw);
  let borderRowNoise = 0;
  let borderColNoise = 0;

  for (let y = 1; y < ah - 1; y++) {
    let rSum = 0;
    for (let x = 1; x < aw - 1; x++) {
      const idx = (y * aw + x) * 4;
      const colorDist = Math.sqrt(
        (data[idx] - bgR) ** 2 + (data[idx + 1] - bgG) ** 2 + (data[idx + 2] - bgB) ** 2
      );
      const gx =
        Math.abs(
          lum[(y - 1) * aw + (x + 1)] +
            2 * lum[y * aw + (x + 1)] +
            lum[(y + 1) * aw + (x + 1)] -
            lum[(y - 1) * aw + (x - 1)] -
            2 * lum[y * aw + (x - 1)] -
            lum[(y + 1) * aw + (x - 1)]
        ) * 0.25;
      const gy =
        Math.abs(
          lum[(y + 1) * aw + (x - 1)] +
            2 * lum[(y + 1) * aw + x] +
            lum[(y + 1) * aw + (x + 1)] -
            lum[(y - 1) * aw + (x - 1)] -
            2 * lum[(y - 1) * aw + x] -
            lum[(y - 1) * aw + (x + 1)]
        ) * 0.25;
      const edge = gx + gy;
      const pxScore = (edge > 22 ? edge * 1.35 : 0) + (colorDist > 26 ? colorDist * 0.9 : 0);
      rSum += pxScore;
      colScore[x] += pxScore;
    }
    rowScore[y] = rSum / aw;
    if (y < byMargin || y >= ah - byMargin) {
      borderRowNoise += rowScore[y];
    }
  }

  for (let x = 0; x < aw; x++) {
    colScore[x] /= ah;
    if (x < bxMargin || x >= aw - bxMargin) {
      borderColNoise += colScore[x];
    }
  }

  const avgBorderRowNoise = borderRowNoise / Math.max(1, byMargin * 2);
  const avgBorderColNoise = borderColNoise / Math.max(1, bxMargin * 2);

  const smooth = (arr: Float32Array, radius = 3): Float32Array => {
    const out = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      let s = 0;
      let c = 0;
      for (let k = -radius; k <= radius; k++) {
        const j = i + k;
        if (j >= 0 && j < arr.length) {
          s += arr[j];
          c++;
        }
      }
      out[i] = s / c;
    }
    return out;
  };

  const sRow = smooth(rowScore, 3);
  const sCol = smooth(colScore, 3);
  const peakRow = Math.max(...sRow);
  const peakCol = Math.max(...sCol);

  const rowThresh = Math.max(peakRow * 0.22, avgBorderRowNoise * 1.45, 4);
  const colThresh = Math.max(peakCol * 0.22, avgBorderColNoise * 1.45, 4);

  let minY = 0;
  while (minY < ah - 1 && sRow[minY] < rowThresh) minY++;
  let maxY = ah - 1;
  while (maxY > minY + 1 && sRow[maxY] < rowThresh) maxY--;

  let minX = 0;
  while (minX < aw - 1 && sCol[minX] < colThresh) minX++;
  let maxX = aw - 1;
  while (maxX > minX + 1 && sCol[maxX] < colThresh) maxX--;

  let nx = minX / aw;
  let ny = minY / ah;
  let nw = (maxX - minX) / aw;
  let nh = (maxY - minY) / ah;

  const area = nw * nh;

  // Guard against overly tight false positives or already-tightly-cropped ID photos
  if (area < 0.16 || nw < 0.25 || nh < 0.2) {
    // Smart centered ID card framing (~1.586:1 aspect ratio)
    const imgAspect = aw / ah;
    if (imgAspect >= 1.15) {
      return { x: 0.07, y: 0.09, w: 0.86, h: 0.82 };
    }
    const targetH = clamp((0.88 * imgAspect) / 1.586, 0.38, 0.72);
    return { x: 0.06, y: (1 - targetH) / 2, w: 0.88, h: targetH };
  }

  if (area > 0.94) {
    // Card already fills virtually the whole frame — keep clean 1.5% trim
    return { x: 0.015, y: 0.015, w: 0.97, h: 0.97 };
  }

  // Add subtle 2% safety padding around detected ID borders so corners/QR never clip
  const padX = Math.max(0.015, nw * 0.025);
  const padY = Math.max(0.015, nh * 0.025);
  nx = clamp(nx - padX, 0, 0.9);
  ny = clamp(ny - padY, 0, 0.9);
  nw = clamp(nw + padX * 2, 0.1, 1 - nx);
  nh = clamp(nh + padY * 2, 0.1, 1 - ny);

  return { x: nx, y: ny, w: nw, h: nh };
}

/**
 * Applies gentle auto-contrast & clarity stretch for crisp ID card text legibility.
 */
function enhanceDocumentCanvas(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  const hist = new Uint32Array(256);
  const pxCount = w * h;

  for (let i = 0; i < d.length; i += 4) {
    const l = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    hist[l]++;
  }

  const lowCut = Math.floor(pxCount * 0.015);
  const highCut = Math.floor(pxCount * 0.985);
  let acc = 0;
  let pLow = 0;
  let pHigh = 255;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= lowCut && pLow === 0) pLow = v;
    if (acc >= highCut) {
      pHigh = v;
      break;
    }
  }

  const span = pHigh - pLow;
  if (span < 40 || span > 235) return; // Already well balanced or nearly blank

  // Blend 55% of the contrast-stretched channel with 45% original for natural photo look
  const scale = 248 / span;
  for (let i = 0; i < d.length; i += 4) {
    const sr = clamp((d[i] - pLow) * scale + 4, 0, 255);
    const sg = clamp((d[i + 1] - pLow) * scale + 4, 0, 255);
    const sb = clamp((d[i + 2] - pLow) * scale + 4, 0, 255);
    d[i] = Math.round(d[i] * 0.45 + sr * 0.55);
    d[i + 1] = Math.round(d[i + 1] * 0.45 + sg * 0.55);
    d[i + 2] = Math.round(d[i + 2] * 0.45 + sb * 0.55);
  }
  ctx.putImageData(imgData, 0, 0);
}

/**
 * Renders the rotated + cropped + compressed final base64 DataURL ready for Firestore storage.
 */
export async function renderCroppedAndCompressed(params: {
  sourceDataUrl: string;
  crop: NormalizedCropRect;
  rotationDeg: 0 | 90 | 180 | 270;
  enhanceDocument?: boolean;
  maxDimension?: number;
  maxChars?: number;
  preserveTransparency?: boolean;
}): Promise<string> {
  const {
    sourceDataUrl,
    crop,
    rotationDeg,
    enhanceDocument = false,
    maxDimension = 900,
    maxChars = 250000,
    preserveTransparency = false,
  } = params;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onerror = () => reject(new Error('Image render failed'));
    el.onload = () => resolve(el);
    el.src = sourceDataUrl;
  });

  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;

  // Step 1: Draw rotated image
  const rotCanvas = document.createElement('canvas');
  const swap = rotationDeg === 90 || rotationDeg === 270;
  rotCanvas.width = swap ? ih : iw;
  rotCanvas.height = swap ? iw : ih;
  const rctx = rotCanvas.getContext('2d');
  if (!rctx) throw new Error('Canvas context error');

  rctx.save();
  rctx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
  rctx.rotate((rotationDeg * Math.PI) / 180);
  rctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
  rctx.restore();

  // Step 2: Crop region
  const sx = Math.round(clamp(crop.x, 0, 0.95) * rotCanvas.width);
  const sy = Math.round(clamp(crop.y, 0, 0.95) * rotCanvas.height);
  const sw = Math.max(16, Math.round(clamp(crop.w, 0.05, 1 - crop.x) * rotCanvas.width));
  const sh = Math.max(16, Math.round(clamp(crop.h, 0.05, 1 - crop.y) * rotCanvas.height));

  let dw = sw;
  let dh = sh;
  if (dw > maxDimension || dh > maxDimension) {
    if (dw >= dh) {
      dh = Math.round((dh * maxDimension) / dw);
      dw = maxDimension;
    } else {
      dw = Math.round((dw * maxDimension) / dh);
      dh = maxDimension;
    }
  }

  const outCanvas = document.createElement('canvas');
  outCanvas.width = dw;
  outCanvas.height = dh;
  const octx = outCanvas.getContext('2d');
  if (!octx) throw new Error('Canvas context error');

  const keepAlpha = preserveTransparency && sourceDataUrl.startsWith('data:image/png');
  if (!keepAlpha) {
    octx.fillStyle = '#ffffff';
    octx.fillRect(0, 0, dw, dh);
  }
  octx.drawImage(rotCanvas, sx, sy, sw, sh, 0, 0, dw, dh);

  if (enhanceDocument && !keepAlpha) {
    enhanceDocumentCanvas(octx, dw, dh);
  }

  const mime = keepAlpha ? 'image/webp' : 'image/jpeg';
  let quality = 0.84;
  let resultUrl = outCanvas.toDataURL(mime, quality);
  while (resultUrl.length > maxChars && quality > 0.28) {
    quality -= 0.12;
    resultUrl = outCanvas.toDataURL(mime, quality);
  }

  let scale = 0.72;
  let attempts = 0;
  while (resultUrl.length > maxChars && attempts < 3) {
    attempts += 1;
    const down = document.createElement('canvas');
    down.width = Math.max(64, Math.round(dw * scale));
    down.height = Math.max(64, Math.round(dh * scale));
    const dctx = down.getContext('2d');
    if (!dctx) break;
    if (!keepAlpha) {
      dctx.fillStyle = '#ffffff';
      dctx.fillRect(0, 0, down.width, down.height);
    }
    dctx.drawImage(outCanvas, 0, 0, down.width, down.height);
    // If WebP fallback on Safari yields oversized PNG, use compact JPEG compression on final step
    const stepMime = keepAlpha && attempts < 2 ? 'image/webp' : 'image/jpeg';
    if (stepMime === 'image/jpeg' && keepAlpha) {
      dctx.globalCompositeOperation = 'destination-over';
      dctx.fillStyle = '#ffffff';
      dctx.fillRect(0, 0, down.width, down.height);
      dctx.globalCompositeOperation = 'source-over';
    }
    resultUrl = down.toDataURL(stepMime, 0.72);
    scale *= 0.7;
  }

  return resultUrl;
}
