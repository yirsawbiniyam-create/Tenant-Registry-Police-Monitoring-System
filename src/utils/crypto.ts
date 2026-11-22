import { FIELD_LIMITS } from '../types';

export function createValidId(prefix: string): string {
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 24) || 'doc';
  const rand =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : Math.random().toString(36).slice(2, 12);
  const ts = Date.now().toString(36);
  return `${cleanPrefix}_${ts}_${rand}`.slice(0, FIELD_LIMITS.ID_MAX);
}

export function generateSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: 60000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return Array.from(new Uint8Array(bits))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string
): Promise<boolean> {
  const computed = await hashPassword(password, salt);
  if (computed.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  }
  return diff === 0;
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateVaultKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function deriveVaultAesKey(password: string, salt: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(`vault:${salt}`),
      iterations: 60000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptVaultJson(
  data: unknown,
  password: string
): Promise<{ vaultSalt: string; encryptedVault: string }> {
  const vaultSalt = generateSalt();
  const key = await deriveVaultAesKey(password, vaultSalt);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    plaintext
  );
  const encryptedVault = JSON.stringify({
    iv: bytesToBase64(iv),
    ct: bytesToBase64(new Uint8Array(cipherBuf)),
  });
  return { vaultSalt, encryptedVault };
}

export async function decryptVaultJson<T>(
  encryptedVault: string,
  vaultSalt: string,
  password: string
): Promise<T> {
  const parsed = JSON.parse(encryptedVault) as { iv: string; ct: string };
  const iv = base64ToBytes(parsed.iv);
  const ct = base64ToBytes(parsed.ct);
  const key = await deriveVaultAesKey(password, vaultSalt);
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    ct.buffer as ArrayBuffer
  );
  const jsonText = new TextDecoder().decode(plainBuf);
  return JSON.parse(jsonText) as T;
}

const SAFE_RASTER_DATA_URL_RE = /^data:image\/(jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const SAFE_LOCAL_ASSET_RE = /^\/?(?:src\/)?assets\/[a-zA-Z0-9_.\-/]+$/;
const ALLOWED_UPLOAD_MIME_RE = /^image\/(jpeg|jpg|png|webp|gif|bmp|heic|heif|avif)$/i;

export function sanitizeImageSrc(src?: string): string {
  if (!src || typeof src !== 'string') return '';
  const trimmed = src.trim();
  if (!trimmed || trimmed.includes('..')) return '';
  if (SAFE_LOCAL_ASSET_RE.test(trimmed)) return trimmed;
  if (SAFE_RASTER_DATA_URL_RE.test(trimmed)) return trimmed;
  return '';
}

export async function compressImageFile(
  file: File,
  maxDimension = 760,
  quality = 0.68,
  maxChars = 280000,
  preserveTransparency = false
): Promise<string> {
  if (file.size > 15 * 1024 * 1024) {
    throw new Error('የምስሉ መጠን በጣም ትልቅ ነው (ከ15MB በታች ይሁን)');
  }
  if (file.type && !ALLOWED_UPLOAD_MIME_RE.test(file.type)) {
    throw new Error('የተፈቀደ የምስል ፋይል (JPG, PNG, WEBP) ብቻ ይምረጡ');
  }

  const keepAlpha =
    preserveTransparency && /^image\/(png|webp|gif)$/i.test(file.type || '');

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('ምስሉን ማንበብ አልተቻለም'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('ትክክለኛ የምስል ፋይል ይምረጡ'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context error'));
          return;
        }
        if (!keepAlpha) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
        }
        ctx.drawImage(img, 0, 0, width, height);

        const mime = keepAlpha ? 'image/webp' : 'image/jpeg';
        let currentQuality = quality;
        let dataUrl = canvas.toDataURL(mime, currentQuality);
        while (dataUrl.length > maxChars && currentQuality > 0.25) {
          currentQuality -= 0.12;
          dataUrl = canvas.toDataURL(mime, currentQuality);
        }
        if (dataUrl.length > maxChars) {
          canvas.width = Math.round(width * 0.7);
          canvas.height = Math.round(height * 0.7);
          const ctx2 = canvas.getContext('2d');
          if (ctx2) {
            if (!keepAlpha) {
              ctx2.fillStyle = '#ffffff';
              ctx2.fillRect(0, 0, canvas.width, canvas.height);
            }
            ctx2.drawImage(img, 0, 0, canvas.width, canvas.height);
            dataUrl = canvas.toDataURL(mime, 0.55);
          }
        }
        resolve(dataUrl);
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

export function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-()]/g, '').trim();
}

export function canonicalPhoneDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('251') && digits.length >= 12) {
    return digits.slice(3);
  }
  if (digits.startsWith('0') && digits.length >= 10) {
    return digits.slice(1);
  }
  return digits;
}

export function phonesMatch(a: string, b: string): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ca = canonicalPhoneDigits(na);
  const cb = canonicalPhoneDigits(nb);
  return Boolean(ca && cb && ca === cb);
}

export function normalizeText(val: string): string {
  return val.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function formatDateAm(ts: unknown): string {
  if (!ts) return '-';
  let date: Date | null = null;
  if (ts instanceof Date) {
    date = ts;
  } else if (typeof ts === 'object' && ts !== null && 'toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
    date = (ts as { toDate: () => Date }).toDate();
  } else if (typeof ts === 'object' && ts !== null && 'seconds' in ts) {
    date = new Date(((ts as { seconds: number }).seconds || 0) * 1000);
  } else if (typeof ts === 'string' || typeof ts === 'number') {
    date = new Date(ts);
  }
  if (!date || Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('am-ET', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function toJsDate(ts: unknown): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof ts === 'object' && ts !== null && 'toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
    return (ts as { toDate: () => Date }).toDate();
  }
  if (typeof ts === 'object' && ts !== null && 'seconds' in ts) {
    return new Date(((ts as { seconds: number }).seconds || 0) * 1000);
  }
  if (typeof ts === 'string' || typeof ts === 'number') {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}
