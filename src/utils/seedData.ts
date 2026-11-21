export interface StaticJurisdictionSeed {
  id: string;
  city: string;
  woreda: string;
  kebele: string;
}

export const DEFAULT_LOGO_PATH = '/src/assets/images/bg_police_logo_1795171832571.jpg';
export const ASSOSA_BANNER_PATH = '/src/assets/images/assosa_hero_banner_1795171833846.jpg';
export const LOGIN_SEA_MOUNTAINS_BG_PATH = '/src/assets/images/login_sea_mountains_bg_1795271607106.jpg';
export const DEFAULT_REGIONAL_FLAG_PATH = '/src/assets/images/bg_regional_flag.svg';
export const DEFAULT_ETHIOPIAN_FLAG_PATH = '/src/assets/images/ethiopia_national_flag.svg';

const LEGACY_REGIONAL_FLAG_JPG = '/src/assets/images/bg_regional_flag_1795271605750.jpg';
const LEGACY_ETHIOPIAN_FLAG_JPG = '/src/assets/images/ethiopia_national_flag_1795271605690.jpg';

export function resolveRegionalFlagSrc(src?: string): string {
  if (!src || src === LEGACY_REGIONAL_FLAG_JPG) return DEFAULT_REGIONAL_FLAG_PATH;
  return src;
}

export function resolveEthiopianFlagSrc(src?: string): string {
  if (!src || src === LEGACY_ETHIOPIAN_FLAG_JPG) return DEFAULT_ETHIOPIAN_FLAG_PATH;
  return src;
}

export const DEFAULT_COMMISSION_NAME = 'የቤኒሻንጉል ጉሙዝ ክልል ፖሊስ ኮሚሽን';
export const DEFAULT_COMMISSION_SUBTITLE = 'የአከራይ ተከራይ መመዝገቢያና የወንጀል መከላከያ ክትትል ሲስተም';

export const DEFAULT_JURISDICTIONS: StaticJurisdictionSeed[] = [
  { id: 'jur_assosa_w1_k01', city: 'አሶሳ ከተማ', woreda: 'ወረዳ 1', kebele: 'ቀበሌ 01' },
  { id: 'jur_assosa_w1_k02', city: 'አሶሳ ከተማ', woreda: 'ወረዳ 1', kebele: 'ቀበሌ 02' },
  { id: 'jur_assosa_w1_k03', city: 'አሶሳ ከተማ', woreda: 'ወረዳ 1', kebele: 'ቀበሌ 03' },
  { id: 'jur_assosa_w1_k04', city: 'አሶሳ ከተማ', woreda: 'ወረዳ 1', kebele: 'ቀበሌ 04' },
  { id: 'jur_assosa_w2_k05', city: 'አሶሳ ከተማ', woreda: 'ወረዳ 2', kebele: 'ቀበሌ 05' },
  { id: 'jur_assosa_w2_k06', city: 'አሶሳ ከተማ', woreda: 'ወረዳ 2', kebele: 'ቀበሌ 06' },
  { id: 'jur_assosa_w2_k07', city: 'አሶሳ ከተማ', woreda: 'ወረዳ 2', kebele: 'ቀበሌ 07' },
  { id: 'jur_assosa_w2_k08', city: 'አሶሳ ከተማ', woreda: 'ወረዳ 2', kebele: 'ቀበሌ 08' },
  { id: 'jur_bambasi_w1_k01', city: 'ባምባሲ ከተማ', woreda: 'ወረዳ 1', kebele: 'ቀበሌ 01' },
  { id: 'jur_bambasi_w1_k02', city: 'ባምባሲ ከተማ', woreda: 'ወረዳ 1', kebele: 'ቀበሌ 02' },
  { id: 'jur_gilgel_w1_k01', city: 'ግልገል በለስ ከተማ', woreda: 'ወረዳ 1', kebele: 'ቀበሌ 01' },
  { id: 'jur_gilgel_w1_k02', city: 'ግልገል በለስ ከተማ', woreda: 'ወረዳ 1', kebele: 'ቀበሌ 02' },
  { id: 'jur_kamashi_w1_k01', city: 'ካማሺ ከተማ', woreda: 'ወረዳ 1', kebele: 'ቀበሌ 01' },
  { id: 'jur_kamashi_w1_k02', city: 'ካማሺ ከተማ', woreda: 'ወረዳ 1', kebele: 'ቀበሌ 02' },
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
