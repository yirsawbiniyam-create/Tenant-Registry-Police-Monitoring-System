export interface StaticJurisdictionSeed {
  id: string;
  region: string;
  zone: string;
  city: string;
  woreda: string;
  kebele: string;
}

export const DEFAULT_REGION_NAME = 'ቤኒሻንጉል ጉሙዝ ክልል';

export const DEFAULT_ZONE_PRESETS = [
  'አሶሳ ዞን',
  'መተከል ዞን',
  'ካማሽ ዞን',
  'ማዖና ኮሞ ልዩ ወረዳ',
] as const;

export const DEFAULT_CITY_ADMIN_PRESETS = [
  'አሶሳ ከተማ',
  'ባምባሲ ከተማ',
  'ግልገል በለስ ከተማ',
  'ካማሽ ከተማ',
] as const;

export const ASOSA_WOREDA_PRESETS = ['ወረዳ 1', 'ወረዳ 2'] as const;

export const ASOSA_KEBELE_PRESETS = [
  'ቀበሌ 01',
  'ቀበሌ 02',
  'ቀበሌ 03',
  'ቀበሌ 04',
  'ቀበሌ 05',
] as const;

export function inferZoneForCity(city: string): string {
  const c = (city || '').trim();
  if (c.includes('ግልገል') || c.includes('መተከል') || c.includes('ፓዌ') || c.includes('ቻግኒ')) {
    return 'መተከል ዞን';
  }
  if (c.includes('ካማሽ') || c.includes('ካማሺ')) {
    return 'ካማሽ ዞን';
  }
  if (c.includes('ማኦ') || c.includes('ማዖ') || c.includes('ኮሞ')) {
    return 'ማዖና ኮሞ ልዩ ወረዳ';
  }
  return 'አሶሳ ዞን';
}

export const DEFAULT_LOGO_PATH = '/assets/images/bg_police_logo_1795171832571.jpg';
export const ASSOSA_BANNER_PATH = '/assets/images/assosa_hero_banner_1795171833846.jpg';
export const LOGIN_SEA_MOUNTAINS_BG_PATH = '/assets/images/login_sea_mountains_bg_1795271607106.jpg';
export const DEFAULT_REGIONAL_FLAG_PATH = '/assets/images/bg_regional_flag.svg';
export const DEFAULT_ETHIOPIAN_FLAG_PATH = '/assets/images/ethiopia_national_flag.svg';

const LEGACY_LOGO_SRC_PATH = '/src/assets/images/bg_police_logo_1795171832571.jpg';
const LEGACY_BANNER_SRC_PATH = '/src/assets/images/assosa_hero_banner_1795171833846.jpg';
const LEGACY_REGIONAL_FLAG_JPG = '/src/assets/images/bg_regional_flag_1795271605750.jpg';
const LEGACY_REGIONAL_FLAG_SVG_SRC = '/src/assets/images/bg_regional_flag.svg';
const LEGACY_ETHIOPIAN_FLAG_JPG = '/src/assets/images/ethiopia_national_flag_1795271605690.jpg';
const LEGACY_ETHIOPIAN_FLAG_SVG_SRC = '/src/assets/images/ethiopia_national_flag.svg';

export function normalizeLegacyAssetPath(src?: string): string {
  if (!src || typeof src !== 'string') return '';
  const trimmed = src.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/src/assets/')) {
    return trimmed.slice(4); // "/src/assets/..." -> "/assets/..."
  }
  if (trimmed.startsWith('src/assets/')) {
    return `/${trimmed.slice(4)}`;
  }
  return trimmed;
}

export function resolveLogoSrc(src?: string): string {
  const norm = normalizeLegacyAssetPath(src);
  if (!norm || norm === normalizeLegacyAssetPath(LEGACY_LOGO_SRC_PATH)) {
    return DEFAULT_LOGO_PATH;
  }
  return norm;
}

export function resolveBannerSrc(src?: string): string {
  const norm = normalizeLegacyAssetPath(src);
  if (!norm || norm === normalizeLegacyAssetPath(LEGACY_BANNER_SRC_PATH)) {
    return ASSOSA_BANNER_PATH;
  }
  return norm;
}

export function resolveRegionalFlagSrc(src?: string): string {
  const norm = normalizeLegacyAssetPath(src);
  if (
    !norm ||
    norm === normalizeLegacyAssetPath(LEGACY_REGIONAL_FLAG_JPG) ||
    norm === '/assets/images/bg_regional_flag_1795271605750.jpg' ||
    norm === normalizeLegacyAssetPath(LEGACY_REGIONAL_FLAG_SVG_SRC)
  ) {
    return DEFAULT_REGIONAL_FLAG_PATH;
  }
  return norm;
}

export function resolveEthiopianFlagSrc(src?: string): string {
  const norm = normalizeLegacyAssetPath(src);
  if (
    !norm ||
    norm === normalizeLegacyAssetPath(LEGACY_ETHIOPIAN_FLAG_JPG) ||
    norm === '/assets/images/ethiopia_national_flag_1795271605690.jpg' ||
    norm === normalizeLegacyAssetPath(LEGACY_ETHIOPIAN_FLAG_SVG_SRC)
  ) {
    return DEFAULT_ETHIOPIAN_FLAG_PATH;
  }
  return norm;
}

export const DEFAULT_COMMISSION_NAME = 'የቤኒሻንጉል ጉሙዝ ክልል ፖሊስ ኮሚሽን';
export const DEFAULT_COMMISSION_SUBTITLE = 'የአከራይ ተከራይ መመዝገቢያና የወንጀል መከላከያ ክትትል ሲስተም';

export const DEFAULT_JURISDICTIONS: StaticJurisdictionSeed[] = [
  // አሶሳ ከተማ — ወረዳ 1 (ቀበሌ 01 - 05)
  { id: 'jur_assosa_w1_k01', region: DEFAULT_REGION_NAME, zone: 'አሶሳ ዞን', city: 'አሶሳ ከተማ', woreda: 'ወረዳ 1', kebele: 'ቀበሌ 01' },
  { id: 'jur_assosa_w1_k02', region: DEFAULT_REGION_NAME, zone: 'አሶሳ ዞን', city: 'አሶሳ ከተማ', woreda: 'ወረዳ 1', kebele: 'ቀበሌ 02' },
  { id: 'jur_assosa_w1_k03', region: DEFAULT_REGION_NAME, zone: 'አሶሳ ዞን', city: 'አሶሳ ከተማ', woreda: 'ወረዳ 1', kebele: 'ቀበሌ 03' },
  { id: 'jur_assosa_w1_k04', region: DEFAULT_REGION_NAME, zone: 'አሶሳ ዞን', city: 'አሶሳ ከተማ', woreda: 'ወረዳ 1', kebele: 'ቀበሌ 04' },
  { id: 'jur_assosa_w1_k05', region: DEFAULT_REGION_NAME, zone: 'አሶሳ ዞን', city: 'አሶሳ ከተማ', woreda: 'ወረዳ 1', kebele: 'ቀበሌ 05' },
  // አሶሳ ከተማ — ወረዳ 2 (ቀበሌ 01 - 05)
  { id: 'jur_assosa_w2_k01', region: DEFAULT_REGION_NAME, zone: 'አሶሳ ዞን', city: 'አሶሳ ከተማ', woreda: 'ወረዳ 2', kebele: 'ቀበሌ 01' },
  { id: 'jur_assosa_w2_k02', region: DEFAULT_REGION_NAME, zone: 'አሶሳ ዞን', city: 'አሶሳ ከተማ', woreda: 'ወረዳ 2', kebele: 'ቀበሌ 02' },
  { id: 'jur_assosa_w2_k03', region: DEFAULT_REGION_NAME, zone: 'አሶሳ ዞን', city: 'አሶሳ ከተማ', woreda: 'ወረዳ 2', kebele: 'ቀበሌ 03' },
  { id: 'jur_assosa_w2_k04', region: DEFAULT_REGION_NAME, zone: 'አሶሳ ዞን', city: 'አሶሳ ከተማ', woreda: 'ወረዳ 2', kebele: 'ቀበሌ 04' },
  { id: 'jur_assosa_w2_k05', region: DEFAULT_REGION_NAME, zone: 'አሶሳ ዞን', city: 'አሶሳ ከተማ', woreda: 'ወረዳ 2', kebele: 'ቀበሌ 05' },
  // ሌሎች ከተማ አስተዳደሮች
  { id: 'jur_bambasi_w1_k01', region: DEFAULT_REGION_NAME, zone: 'አሶሳ ዞን', city: 'ባምባሲ ከተማ', woreda: 'ወረዳ 1', kebele: 'ቀበሌ 01' },
  { id: 'jur_bambasi_w1_k02', region: DEFAULT_REGION_NAME, zone: 'አሶሳ ዞን', city: 'ባምባሲ ከተማ', woreda: 'ወረዳ 1', kebele: 'ቀበሌ 02' },
  { id: 'jur_gilgel_w1_k01', region: DEFAULT_REGION_NAME, zone: 'መተከል ዞን', city: 'ግልገል በለስ ከተማ', woreda: 'ወረዳ 1', kebele: 'ቀበሌ 01' },
  { id: 'jur_gilgel_w1_k02', region: DEFAULT_REGION_NAME, zone: 'መተከል ዞን', city: 'ግልገል በለስ ከተማ', woreda: 'ወረዳ 1', kebele: 'ቀበሌ 02' },
  { id: 'jur_kamashi_w1_k01', region: DEFAULT_REGION_NAME, zone: 'ካማሽ ዞን', city: 'ካማሽ ከተማ', woreda: 'ወረዳ 1', kebele: 'ቀበሌ 01' },
  { id: 'jur_kamashi_w1_k02', region: DEFAULT_REGION_NAME, zone: 'ካማሽ ዞን', city: 'ካማሽ ከተማ', woreda: 'ወረዳ 1', kebele: 'ቀበሌ 02' },
];

export const OCCUPATION_OPTIONS = [
  'የመንግስት ሰራተኛ',
  'ፖሊስ',
  'ነጋዴ',
  'የግል ድርጅት ሰራተኛ',
  'ተማሪ',
  'የጤና ባለሙያ',
  'መምህር',
  'አሽከርካሪ',
  'የግንባታ ባለሙያ',
  'ሌላ',
];
