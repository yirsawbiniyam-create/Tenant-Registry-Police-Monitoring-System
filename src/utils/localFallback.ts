import type {
  ActivePortalSession,
  ActivityActionType,
  ActivityHistory,
  AdminCredential,
  BrandingSetting,
  CriminalRecord,
  Jurisdiction,
  Landlord,
  PoliceOfficer,
  RecordType,
  Tenant,
  WantedAlert,
  WantedPerson,
} from '../types';
import { FIELD_LIMITS } from '../types';
import {
  createValidId,
  generateSalt,
  hashPassword,
  normalizePhone,
  phonesMatch,
  sanitizeImageSrc,
  verifyPassword,
} from './crypto';
import {
  DEFAULT_COMMISSION_NAME,
  DEFAULT_COMMISSION_SUBTITLE,
  DEFAULT_ETHIOPIAN_FLAG_PATH,
  DEFAULT_JURISDICTIONS,
  DEFAULT_LOGO_PATH,
  DEFAULT_REGION_NAME,
  DEFAULT_REGIONAL_FLAG_PATH,
  inferZoneForCity,
  resolveEthiopianFlagSrc,
  resolveRegionalFlagSrc,
} from './seedData';
import { ROOT_ADMIN_EMAIL } from '../firebase';

const STORAGE_KEY = 'bg_police_domain_fallback_v1';

export interface FallbackStoreState {
  adminCredential: AdminCredential;
  branding: BrandingSetting;
  jurisdictions: Jurisdiction[];
  officers: PoliceOfficer[];
  landlords: Landlord[];
  tenants: Tenant[];
  wantedPersons: WantedPerson[];
  wantedAlerts: WantedAlert[];
  criminalRecords: CriminalRecord[];
  history: ActivityHistory[];
  syncedCloudIds?: string[];
}

type StoreListener = (state: FallbackStoreState) => void;
const listeners = new Set<StoreListener>();
let memoryStore: FallbackStoreState | null = null;
let initPromise: Promise<FallbackStoreState> | null = null;

function buildDefaultStateSync(salt: string, hash: string): FallbackStoreState {
  const nowIso = new Date().toISOString();
  return {
    adminCredential: {
      credId: 'primary',
      username: 'admin',
      passwordHash: hash,
      passwordSalt: salt,
      isDefaultPassword: true,
      updatedByUid: 'fallback-admin',
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    branding: {
      commissionName: DEFAULT_COMMISSION_NAME,
      subtitle: DEFAULT_COMMISSION_SUBTITLE,
      logoDataUrl: DEFAULT_LOGO_PATH,
      regionalFlagDataUrl: DEFAULT_REGIONAL_FLAG_PATH,
      ethiopianFlagDataUrl: DEFAULT_ETHIOPIAN_FLAG_PATH,
      updatedByUid: 'system',
      updatedAt: null,
    },
    jurisdictions: DEFAULT_JURISDICTIONS.map((j) => ({
      id: j.id,
      region: j.region,
      zone: j.zone,
      city: j.city,
      woreda: j.woreda,
      kebele: j.kebele,
      createdByUid: 'seed',
      createdAt: nowIso,
    })),
    officers: [],
    landlords: [],
    tenants: [],
    wantedPersons: [],
    wantedAlerts: [],
    criminalRecords: [],
    history: [],
    syncedCloudIds: [],
  };
}

function normalizeStore(raw: Partial<FallbackStoreState>, fallbackDefault: FallbackStoreState): FallbackStoreState {
  return {
    adminCredential: raw.adminCredential?.username ? raw.adminCredential : fallbackDefault.adminCredential,
    branding: raw.branding?.commissionName
      ? {
          ...raw.branding,
          regionalFlagDataUrl: resolveRegionalFlagSrc(raw.branding.regionalFlagDataUrl),
          ethiopianFlagDataUrl: resolveEthiopianFlagSrc(raw.branding.ethiopianFlagDataUrl),
        }
      : fallbackDefault.branding,
    jurisdictions:
      Array.isArray(raw.jurisdictions) && raw.jurisdictions.length > 0
        ? raw.jurisdictions.map((j) => ({
            ...j,
            region: j.region || DEFAULT_REGION_NAME,
            zone: j.zone || inferZoneForCity(j.city),
          }))
        : fallbackDefault.jurisdictions,
    officers: Array.isArray(raw.officers) ? raw.officers : [],
    landlords: Array.isArray(raw.landlords) ? raw.landlords : [],
    tenants: Array.isArray(raw.tenants) ? raw.tenants : [],
    wantedPersons: Array.isArray(raw.wantedPersons) ? raw.wantedPersons : [],
    wantedAlerts: Array.isArray(raw.wantedAlerts) ? raw.wantedAlerts : [],
    criminalRecords: Array.isArray(raw.criminalRecords) ? raw.criminalRecords : [],
    history: Array.isArray(raw.history) ? raw.history : [],
    syncedCloudIds: Array.isArray(raw.syncedCloudIds) ? raw.syncedCloudIds : [],
  };
}

function persistAndNotify(next: FallbackStoreState): FallbackStoreState {
  memoryStore = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota or private-mode restrictions; memoryStore remains active
  }
  listeners.forEach((cb) => cb(next));
  return next;
}

export async function ensureFallbackInitialized(): Promise<FallbackStoreState> {
  if (memoryStore) return memoryStore;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const salt = generateSalt();
    const hash = await hashPassword('admin', salt);
    const defaultState = buildDefaultStateSync(salt, hash);
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<FallbackStoreState>;
        const normalized = normalizeStore(parsed, defaultState);
        return persistAndNotify(normalized);
      }
    } catch {
      // Corrupt or inaccessible localStorage — initialize fresh
    }
    return persistAndNotify(defaultState);
  })();

  try {
    return await initPromise;
  } finally {
    initPromise = null;
  }
}

export function getFallbackSnapshot(): FallbackStoreState | null {
  if (memoryStore) return memoryStore;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved) as Partial<FallbackStoreState>;
    const placeholder = buildDefaultStateSync('', '');
    const normalized = normalizeStore(parsed, placeholder);
    memoryStore = normalized;
    return normalized;
  } catch {
    return null;
  }
}

export async function markFallbackIdsSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const store = await ensureFallbackInitialized();
  const merged = Array.from(new Set([...(store.syncedCloudIds || []), ...ids]));
  persistAndNotify({
    ...store,
    syncedCloudIds: merged,
  });
}

export function subscribeFallbackStore(listener: StoreListener): () => void {
  listeners.add(listener);
  void ensureFallbackInitialized().then((state) => {
    listener(state);
  });
  return () => {
    listeners.delete(listener);
  };
}

function appendFallbackHistory(
  store: FallbackStoreState,
  params: {
    actorUid: string;
    actorRole: 'admin' | 'police' | 'landlord';
    actorName: string;
    actionType: ActivityActionType;
    subjectType: 'landlord' | 'tenant' | 'officer' | 'wanted' | 'criminal_record' | 'system';
    subjectId: string;
    subjectName: string;
    subjectPhone?: string;
    subjectIdNumber?: string;
    city: string;
    woreda: string;
    kebele: string;
    details: string;
  }
): ActivityHistory[] {
  const entry: ActivityHistory = {
    historyId: createValidId('hist'),
    actorUid: params.actorUid,
    actorRole: params.actorRole,
    actorName: params.actorName.slice(0, 150),
    actionType: params.actionType,
    subjectType: params.subjectType,
    subjectId: params.subjectId,
    subjectName: params.subjectName.slice(0, 150),
    subjectPhone: params.subjectPhone?.slice(0, 30),
    subjectIdNumber: params.subjectIdNumber?.slice(0, 60),
    city: (params.city || '-').slice(0, 100),
    woreda: (params.woreda || '-').slice(0, 100),
    kebele: (params.kebele || '-').slice(0, 100),
    details: params.details.slice(0, 1000),
    createdAt: new Date().toISOString(),
  };
  return [entry, ...store.history];
}

export async function verifyFallbackLogin(
  rawId: string,
  password: string
): Promise<
  | { ok: true; session: ActivePortalSession; uid: string }
  | { ok: false; reason: 'invalid_password' | 'suspended' | 'not_found' }
> {
  const store = await ensureFallbackInitialized();
  const cleanId = rawId.trim();

  // 1. Admin credentials (default admin / admin)
  if (cleanId === store.adminCredential.username) {
    const passOk = await verifyPassword(
      password,
      store.adminCredential.passwordSalt,
      store.adminCredential.passwordHash
    );
    if (passOk) {
      return {
        ok: true,
        uid: 'fallback-admin',
        session: {
          role: 'admin',
          displayName: 'ክልል ዋና አድሚን',
          email: ROOT_ADMIN_EMAIL,
          adminUsername: store.adminCredential.username,
        },
      };
    }
    return { ok: false, reason: 'invalid_password' };
  }

  // 2. Police officer credentials
  const officer = store.officers.find((o) => o.username === cleanId);
  if (officer) {
    if (!officer.active) {
      return { ok: false, reason: 'suspended' };
    }
    const ok = await verifyPassword(password, officer.passwordSalt, officer.passwordHash);
    if (ok) {
      return { ok: true, uid: officer.officerId, session: { role: 'police', officer } };
    }
    return { ok: false, reason: 'invalid_password' };
  }

  // 3. Landlord credentials (by phone, ignoring 09 / +251 formatting variance)
  const phone = normalizePhone(cleanId);
  if (phone) {
    const candidates = store.landlords.filter(
      (l) => phonesMatch(l.phone, cleanId) && l.status === 'active'
    );
    for (const ll of candidates) {
      const ok = await verifyPassword(password, ll.passwordSalt, ll.passwordHash);
      if (ok) {
        return { ok: true, uid: ll.ownerUid, session: { role: 'landlord', landlord: ll } };
      }
    }
    if (candidates.length > 0) {
      return { ok: false, reason: 'invalid_password' };
    }
  }

  return { ok: false, reason: 'not_found' };
}

export async function updateFallbackAdminCredentials(params: {
  adminUid: string;
  actorName: string;
  currentPassword: string;
  newUsername: string;
  newPassword?: string;
}): Promise<{ username: string }> {
  const store = await ensureFallbackInitialized();
  const cleanUsername = params.newUsername.trim().slice(0, 60);
  if (!cleanUsername || !FIELD_LIMITS.USERNAME_PATTERN.test(cleanUsername)) {
    throw new Error('ዩዘርኔም የእንግሊዝኛ ፊደላት፣ ቁጥሮች ወይም (._-) ብቻ መያዝ አለበት።');
  }
  const currentOk = await verifyPassword(
    params.currentPassword,
    store.adminCredential.passwordSalt,
    store.adminCredential.passwordHash
  );
  if (!currentOk) {
    throw new Error('የገባው የአሁኑ የይለፍ ቃል ትክክል አይደለም።');
  }

  let nextSalt = store.adminCredential.passwordSalt;
  let nextHash = store.adminCredential.passwordHash;
  if (params.newPassword && params.newPassword.length > 0) {
    if (params.newPassword.length < 4) {
      throw new Error('አዲሱ የይለፍ ቃል ቢያንስ 4 ቁምፊ መሆን አለበት።');
    }
    nextSalt = generateSalt();
    nextHash = await hashPassword(params.newPassword, nextSalt);
  }

  const nextCred: AdminCredential = {
    ...store.adminCredential,
    username: cleanUsername,
    passwordHash: nextHash,
    passwordSalt: nextSalt,
    isDefaultPassword: false,
    updatedByUid: params.adminUid,
    updatedAt: new Date().toISOString(),
  };

  persistAndNotify({
    ...store,
    adminCredential: nextCred,
    history: appendFallbackHistory(store, {
      actorUid: params.adminUid,
      actorRole: 'admin',
      actorName: params.actorName || 'ክልል ዋና አድሚን',
      actionType: 'admin_credentials_updated',
      subjectType: 'system',
      subjectId: 'primary',
      subjectName: cleanUsername,
      city: DEFAULT_REGION_NAME,
      woreda: 'ክልል',
      kebele: 'ዋና ጽ/ቤት',
      details: `የአድሚን መግቢያ ዩዘርኔም (${cleanUsername}) እና የይለፍ ቃል ተስተካክሏል።`,
    }),
  });
  return { username: cleanUsername };
}

export async function saveFallbackBranding(
  uid: string,
  payload: {
    commissionName: string;
    subtitle: string;
    logoDataUrl: string;
    regionalFlagDataUrl?: string;
    ethiopianFlagDataUrl?: string;
  }
): Promise<void> {
  const store = await ensureFallbackInitialized();
  const safeLogo = sanitizeImageSrc(payload.logoDataUrl) || DEFAULT_LOGO_PATH;
  const safeRegional = sanitizeImageSrc(payload.regionalFlagDataUrl) || DEFAULT_REGIONAL_FLAG_PATH;
  const safeEth = sanitizeImageSrc(payload.ethiopianFlagDataUrl) || DEFAULT_ETHIOPIAN_FLAG_PATH;

  const nextBranding: BrandingSetting = {
    commissionName: payload.commissionName.slice(0, 200),
    subtitle: payload.subtitle.slice(0, 200),
    logoDataUrl: safeLogo,
    regionalFlagDataUrl: safeRegional,
    ethiopianFlagDataUrl: safeEth,
    updatedByUid: uid,
    updatedAt: new Date().toISOString(),
  };

  persistAndNotify({
    ...store,
    branding: nextBranding,
    history: appendFallbackHistory(store, {
      actorUid: uid,
      actorRole: 'admin',
      actorName: 'ክልል ዋና አድሚን',
      actionType: 'logo_updated',
      subjectType: 'system',
      subjectId: 'branding',
      subjectName: payload.commissionName,
      city: DEFAULT_REGION_NAME,
      woreda: 'ክልል',
      kebele: 'ዋና ጽ/ቤት',
      details: 'የፖሊስ ኮሚሽን ሎጎ፣ የክልል እና የኢትዮጵያ ሰንደቅአላማ እና መጠሪያ ተዘምኗል።',
    }),
  });
}

export async function addFallbackJurisdiction(
  uid: string,
  input: { region: string; zone: string; city: string; woreda: string; kebele: string }
): Promise<Jurisdiction> {
  const store = await ensureFallbackInitialized();
  const item: Jurisdiction = {
    id: createValidId('jur'),
    region: (input.region || DEFAULT_REGION_NAME).trim().slice(0, 100),
    zone: (input.zone || inferZoneForCity(input.city)).trim().slice(0, 100),
    city: input.city.trim().slice(0, 100),
    woreda: input.woreda.trim().slice(0, 100),
    kebele: input.kebele.trim().slice(0, 100),
    createdByUid: uid,
    createdAt: new Date().toISOString(),
  };
  persistAndNotify({
    ...store,
    jurisdictions: [...store.jurisdictions, item],
  });
  return item;
}

export async function updateFallbackJurisdiction(
  jurisdictionId: string,
  updates: { region: string; zone: string; city: string; woreda: string; kebele: string }
): Promise<void> {
  const store = await ensureFallbackInitialized();
  const next = store.jurisdictions.map((j) =>
    j.id === jurisdictionId
      ? {
          ...j,
          region: (updates.region || DEFAULT_REGION_NAME).trim().slice(0, 100),
          zone: (updates.zone || inferZoneForCity(updates.city)).trim().slice(0, 100),
          city: updates.city.trim().slice(0, 100),
          woreda: updates.woreda.trim().slice(0, 100),
          kebele: updates.kebele.trim().slice(0, 100),
        }
      : j
  );
  persistAndNotify({ ...store, jurisdictions: next });
}

export async function deleteFallbackJurisdiction(jurisdictionId: string): Promise<void> {
  const store = await ensureFallbackInitialized();
  persistAndNotify({
    ...store,
    jurisdictions: store.jurisdictions.filter((j) => j.id !== jurisdictionId),
  });
}

export async function registerFallbackLandlord(
  ownerUid: string,
  input: {
    fullName: string;
    phone: string;
    region?: string;
    zone?: string;
    city: string;
    woreda: string;
    kebele: string;
    houseNumber: string;
    roomCount: number;
    faydaId: string;
    idFrontImage: string;
    idBackImage: string;
    password: string;
  },
  actorRole: 'admin' | 'police' | 'landlord' = 'landlord',
  actorName?: string
): Promise<Landlord> {
  const store = await ensureFallbackInitialized();
  const landlordId = createValidId('ll');
  const salt = generateSalt();
  const passwordHash = await hashPassword(input.password, salt);
  const resolvedUid = ownerUid || createValidId('lluid');
  const landlord: Landlord = {
    landlordId,
    ownerUid: resolvedUid,
    fullName: input.fullName.trim().slice(0, 150),
    phone: normalizePhone(input.phone).slice(0, 30),
    region: (input.region || DEFAULT_REGION_NAME).trim().slice(0, 100),
    zone: (input.zone || inferZoneForCity(input.city)).trim().slice(0, 100),
    city: input.city.trim().slice(0, 100),
    woreda: input.woreda.trim().slice(0, 100),
    kebele: input.kebele.trim().slice(0, 100),
    houseNumber: input.houseNumber.trim().slice(0, 60),
    roomCount: Math.max(1, Math.min(500, Math.floor(input.roomCount))),
    faydaId: input.faydaId.trim().slice(0, 60),
    idFrontImage: sanitizeImageSrc(input.idFrontImage),
    idBackImage: sanitizeImageSrc(input.idBackImage),
    passwordHash,
    passwordSalt: salt,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  persistAndNotify({
    ...store,
    landlords: [landlord, ...store.landlords],
    history: appendFallbackHistory(store, {
      actorUid: resolvedUid,
      actorRole,
      actorName: actorName || landlord.fullName,
      actionType: 'landlord_registered',
      subjectType: 'landlord',
      subjectId: landlordId,
      subjectName: landlord.fullName,
      subjectPhone: landlord.phone,
      subjectIdNumber: landlord.faydaId,
      city: landlord.city,
      woreda: landlord.woreda,
      kebele: landlord.kebele,
      details: `አዲስ አከራይ ተመዝግቧል — ${landlord.roomCount} ክፍሎች፣ የቤት ቁጥር ${landlord.houseNumber} (${landlord.city}, ${landlord.woreda}, ${landlord.kebele})።`,
    }),
  });
  return landlord;
}

export async function updateFallbackLandlordAddress(
  actorUid: string,
  landlord: Landlord,
  updates: {
    region?: string;
    zone?: string;
    city: string;
    woreda: string;
    kebele: string;
    houseNumber: string;
    roomCount: number;
    phone: string;
  }
): Promise<void> {
  const store = await ensureFallbackInitialized();
  const nowIso = new Date().toISOString();
  const nextLandlords = store.landlords.map((l) =>
    l.landlordId === landlord.landlordId
      ? {
          ...l,
          region: (updates.region || l.region || DEFAULT_REGION_NAME).trim().slice(0, 100),
          zone: (updates.zone || inferZoneForCity(updates.city)).trim().slice(0, 100),
          city: updates.city.trim().slice(0, 100),
          woreda: updates.woreda.trim().slice(0, 100),
          kebele: updates.kebele.trim().slice(0, 100),
          houseNumber: updates.houseNumber.trim().slice(0, 60),
          roomCount: Math.max(1, Math.min(500, Math.floor(updates.roomCount))),
          phone: normalizePhone(updates.phone).slice(0, 30),
          updatedAt: nowIso,
        }
      : l
  );
  persistAndNotify({
    ...store,
    landlords: nextLandlords,
    history: appendFallbackHistory(store, {
      actorUid,
      actorRole: 'landlord',
      actorName: landlord.fullName,
      actionType: 'landlord_address_changed',
      subjectType: 'landlord',
      subjectId: landlord.landlordId,
      subjectName: landlord.fullName,
      subjectPhone: updates.phone,
      subjectIdNumber: landlord.faydaId,
      city: updates.city,
      woreda: updates.woreda,
      kebele: updates.kebele,
      details: `አከራይ ቤት/አድራሻ ቀይሯል፦ ከ ${landlord.city}/${landlord.woreda}/${landlord.kebele} (ቤት ${landlord.houseNumber}) ወደ ${updates.city}/${updates.woreda}/${updates.kebele} (ቤት ${updates.houseNumber})።`,
    }),
  });
}

export async function replaceFallbackLandlordOwner(
  actorUid: string,
  actorRole: 'admin' | 'police',
  actorName: string,
  oldLandlord: Landlord,
  newOwner: {
    fullName: string;
    phone: string;
    faydaId: string;
    idFrontImage: string;
    idBackImage: string;
  }
): Promise<void> {
  const store = await ensureFallbackInitialized();
  const nowIso = new Date().toISOString();
  const nextLandlords = store.landlords.map((l) =>
    l.landlordId === oldLandlord.landlordId
      ? {
          ...l,
          fullName: newOwner.fullName.trim().slice(0, 150),
          phone: normalizePhone(newOwner.phone).slice(0, 30),
          faydaId: newOwner.faydaId.trim().slice(0, 60),
          idFrontImage: sanitizeImageSrc(newOwner.idFrontImage),
          idBackImage: sanitizeImageSrc(newOwner.idBackImage),
          updatedAt: nowIso,
        }
      : l
  );
  const nextTenants = store.tenants.map((t) =>
    t.landlordId === oldLandlord.landlordId
      ? {
          ...t,
          landlordName: newOwner.fullName.trim().slice(0, 150),
          landlordPhone: normalizePhone(newOwner.phone).slice(0, 30),
          updatedAt: nowIso,
        }
      : t
  );
  persistAndNotify({
    ...store,
    landlords: nextLandlords,
    tenants: nextTenants,
    history: appendFallbackHistory(store, {
      actorUid,
      actorRole,
      actorName,
      actionType: 'landlord_replaced',
      subjectType: 'landlord',
      subjectId: oldLandlord.landlordId,
      subjectName: newOwner.fullName,
      subjectPhone: newOwner.phone,
      subjectIdNumber: newOwner.faydaId,
      city: oldLandlord.city,
      woreda: oldLandlord.woreda,
      kebele: oldLandlord.kebele,
      details: `የንብረት አከራይ ስም ተቀይሯል፦ የቀድሞ አከራይ ${oldLandlord.fullName} ወጥቶ በአዲስ አከራይ ${newOwner.fullName} ተተክቷል።`,
    }),
  });
}

export async function registerFallbackTenant(
  actorUid: string,
  landlord: Landlord,
  input: {
    fullName: string;
    phone: string;
    maritalStatus: 'married' | 'single';
    livingArrangement: 'alone' | 'with_others';
    coResidents: string[];
    occupation: string;
    idType: 'fayda' | 'police_digital';
    idNumber: string;
    idFrontImage: string;
    idBackImage: string;
    portraitImage?: string;
    roomLabel: string;
    moveInDate: string;
    replacedTenant?: Tenant;
  },
  actorRole: 'admin' | 'police' | 'landlord' = 'landlord'
): Promise<Tenant> {
  const store = await ensureFallbackInitialized();
  const tenantId = createValidId('ten');
  const nowIso = new Date().toISOString();
  const isPoliceTenant = input.occupation.trim() === 'ፖሊስ' || input.idType === 'police_digital';

  const tenant: Tenant = {
    tenantId,
    landlordId: landlord.landlordId,
    landlordUid: landlord.ownerUid,
    landlordName: landlord.fullName.slice(0, 150),
    landlordPhone: landlord.phone.slice(0, 30),
    region: (landlord.region || DEFAULT_REGION_NAME).slice(0, 100),
    zone: (landlord.zone || inferZoneForCity(landlord.city)).slice(0, 100),
    city: landlord.city.slice(0, 100),
    woreda: landlord.woreda.slice(0, 100),
    kebele: landlord.kebele.slice(0, 100),
    houseNumber: landlord.houseNumber.slice(0, 60),
    roomLabel: (input.roomLabel || 'ክፍል 1').trim().slice(0, 60),
    fullName: input.fullName.trim().slice(0, 150),
    phone: normalizePhone(input.phone).slice(0, 30),
    maritalStatus: input.maritalStatus,
    livingArrangement: input.livingArrangement,
    coResidents:
      input.livingArrangement === 'with_others'
        ? input.coResidents.map((n) => n.trim().slice(0, 150)).filter(Boolean).slice(0, 20)
        : [],
    occupation: input.occupation.trim().slice(0, 120),
    isPoliceTenant,
    idType: isPoliceTenant ? 'police_digital' : 'fayda',
    idNumber: input.idNumber.trim().slice(0, 60),
    idFrontImage: sanitizeImageSrc(input.idFrontImage),
    idBackImage: sanitizeImageSrc(input.idBackImage),
    portraitImage: input.portraitImage ? sanitizeImageSrc(input.portraitImage) : undefined,
    moveInDate: input.moveInDate.slice(0, 30),
    status: 'active',
    replacedTenantId: input.replacedTenant?.tenantId,
    replacedTenantName: input.replacedTenant?.fullName,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const nextTenants = [
    tenant,
    ...store.tenants.map((item) =>
      input.replacedTenant && item.tenantId === input.replacedTenant.tenantId
        ? { ...item, status: 'moved_out' as const, updatedAt: nowIso }
        : item
    ),
  ];

  persistAndNotify({
    ...store,
    tenants: nextTenants,
    history: appendFallbackHistory(store, {
      actorUid,
      actorRole,
      actorName: landlord.fullName,
      actionType: 'tenant_registered',
      subjectType: 'tenant',
      subjectId: tenantId,
      subjectName: tenant.fullName,
      subjectPhone: tenant.phone,
      subjectIdNumber: tenant.idNumber,
      city: landlord.city,
      woreda: landlord.woreda,
      kebele: landlord.kebele,
      details: `አዲስ ተከራይ ተመዝግቦ ለፖሊስ ተልኳል፦ ${tenant.fullName} (ቤት ${landlord.houseNumber})።`,
    }),
  });
  return tenant;
}

export async function markFallbackTenantMovedOut(
  actorUid: string,
  actorRole: 'admin' | 'police' | 'landlord',
  actorName: string,
  tenant: Tenant
): Promise<void> {
  const store = await ensureFallbackInitialized();
  const nowIso = new Date().toISOString();
  persistAndNotify({
    ...store,
    tenants: store.tenants.map((t) =>
      t.tenantId === tenant.tenantId ? { ...t, status: 'moved_out', updatedAt: nowIso } : t
    ),
    history: appendFallbackHistory(store, {
      actorUid,
      actorRole,
      actorName,
      actionType: 'tenant_moved_out',
      subjectType: 'tenant',
      subjectId: tenant.tenantId,
      subjectName: tenant.fullName,
      subjectPhone: tenant.phone,
      subjectIdNumber: tenant.idNumber,
      city: tenant.city,
      woreda: tenant.woreda,
      kebele: tenant.kebele,
      details: `ተከራይ ${tenant.fullName} መልቀቁ ተመዝግቧል።`,
    }),
  });
}

export async function createFallbackPoliceOfficer(
  adminUid: string,
  input: {
    fullName: string;
    rank: string;
    badgeNumber: string;
    phone: string;
    username: string;
    officerEmail?: string;
    password: string;
    jurisdictionLevel: 'regional' | 'city' | 'woreda' | 'kebele';
    city: string;
    woreda: string;
    kebele: string;
  }
): Promise<PoliceOfficer> {
  const store = await ensureFallbackInitialized();
  const officerId = createValidId('off');
  const salt = generateSalt();
  const passwordHash = await hashPassword(input.password, salt);
  const nowIso = new Date().toISOString();
  const officer: PoliceOfficer = {
    officerId,
    fullName: input.fullName.trim().slice(0, 150),
    rank: input.rank.trim().slice(0, 80),
    badgeNumber: input.badgeNumber.trim().slice(0, 60),
    phone: normalizePhone(input.phone).slice(0, 30),
    username: input.username.trim().slice(0, 60),
    officerEmail: input.officerEmail?.trim().toLowerCase() || undefined,
    passwordHash,
    passwordSalt: salt,
    jurisdictionLevel: input.jurisdictionLevel,
    city: input.city.trim().slice(0, 100),
    woreda: (input.woreda || '').trim().slice(0, 100),
    kebele: (input.kebele || '').trim().slice(0, 100),
    active: true,
    createdByUid: adminUid,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  persistAndNotify({
    ...store,
    officers: [officer, ...store.officers],
    history: appendFallbackHistory(store, {
      actorUid: adminUid,
      actorRole: 'admin',
      actorName: 'ክልል ዋና አድሚን',
      actionType: 'officer_created',
      subjectType: 'officer',
      subjectId: officerId,
      subjectName: officer.fullName,
      subjectPhone: officer.phone,
      city: officer.city,
      woreda: officer.woreda || '-',
      kebele: officer.kebele || '-',
      details: `አዲስ የፖሊስ መኮንን መለያ (${officer.username}) ተከፍቷል።`,
    }),
  });
  return officer;
}

export async function updateFallbackOfficerCredentials(
  adminUid: string,
  actorName: string,
  officer: PoliceOfficer,
  updates: { newUsername: string; newPassword?: string; active?: boolean }
): Promise<void> {
  const store = await ensureFallbackInitialized();
  const cleanUsername = updates.newUsername.trim().slice(0, 60);
  if (!cleanUsername || !FIELD_LIMITS.USERNAME_PATTERN.test(cleanUsername)) {
    throw new Error('ዩዘርኔም የእንግሊዝኛ ፊደላት፣ ቁጥሮች ወይም (._-) ብቻ መያዝ አለበት።');
  }
  let nextSalt = officer.passwordSalt;
  let nextHash = officer.passwordHash;
  if (updates.newPassword && updates.newPassword.length > 0) {
    if (updates.newPassword.length < 4) {
      throw new Error('አዲሱ የይለፍ ቃል ቢያንስ 4 ቁምፊ መሆን አለበት።');
    }
    nextSalt = generateSalt();
    nextHash = await hashPassword(updates.newPassword, nextSalt);
  }
  persistAndNotify({
    ...store,
    officers: store.officers.map((o) =>
      o.officerId === officer.officerId
        ? {
            ...o,
            username: cleanUsername,
            passwordSalt: nextSalt,
            passwordHash: nextHash,
            active: typeof updates.active === 'boolean' ? updates.active : o.active,
            updatedAt: new Date().toISOString(),
          }
        : o
    ),
    history: appendFallbackHistory(store, {
      actorUid: adminUid,
      actorRole: 'admin',
      actorName,
      actionType: 'officer_updated',
      subjectType: 'officer',
      subjectId: officer.officerId,
      subjectName: officer.fullName,
      subjectPhone: officer.phone,
      city: officer.city,
      woreda: officer.woreda || '-',
      kebele: officer.kebele || '-',
      details: `የፖሊስ ኦፊሰር ${officer.fullName} ዩዘርኔም (${cleanUsername}) እና መግቢያ መረጃ ተስተካክሏል።`,
    }),
  });
}

export async function deleteFallbackOfficerAccount(
  adminUid: string,
  actorName: string,
  officer: PoliceOfficer
): Promise<void> {
  const store = await ensureFallbackInitialized();
  persistAndNotify({
    ...store,
    officers: store.officers.filter((o) => o.officerId !== officer.officerId),
    history: appendFallbackHistory(store, {
      actorUid: adminUid,
      actorRole: 'admin',
      actorName,
      actionType: 'user_deleted',
      subjectType: 'officer',
      subjectId: officer.officerId,
      subjectName: officer.fullName,
      subjectPhone: officer.phone,
      city: officer.city,
      woreda: officer.woreda || '-',
      kebele: officer.kebele || '-',
      details: `የፖሊስ ኦፊሰር ${officer.fullName} (${officer.username}) መለያ በአድሚን ተሰርዟል።`,
    }),
  });
}

export async function updateFallbackLandlordCredentials(
  actorUid: string,
  actorRole: 'admin' | 'police',
  actorName: string,
  landlord: Landlord,
  updates: { newPhone: string; newPassword?: string }
): Promise<void> {
  const store = await ensureFallbackInitialized();
  const cleanPhone = normalizePhone(updates.newPhone).slice(0, 30);
  if (!cleanPhone) {
    throw new Error('እባክዎ ትክክለኛ ስልክ ቁጥር (ዩዘርኔም) ያስገቡ።');
  }
  let nextSalt = landlord.passwordSalt;
  let nextHash = landlord.passwordHash;
  if (updates.newPassword && updates.newPassword.length > 0) {
    if (updates.newPassword.length < 4) {
      throw new Error('አዲሱ የይለፍ ቃል ቢያንስ 4 ቁምፊ መሆን አለበት።');
    }
    nextSalt = generateSalt();
    nextHash = await hashPassword(updates.newPassword, nextSalt);
  }
  persistAndNotify({
    ...store,
    landlords: store.landlords.map((l) =>
      l.landlordId === landlord.landlordId
        ? {
            ...l,
            phone: cleanPhone,
            passwordSalt: nextSalt,
            passwordHash: nextHash,
            updatedAt: new Date().toISOString(),
          }
        : l
    ),
    history: appendFallbackHistory(store, {
      actorUid,
      actorRole,
      actorName,
      actionType: 'password_reset',
      subjectType: 'landlord',
      subjectId: landlord.landlordId,
      subjectName: landlord.fullName,
      subjectPhone: cleanPhone,
      city: landlord.city,
      woreda: landlord.woreda,
      kebele: landlord.kebele,
      details: `የአከራይ ${landlord.fullName} ዩዘርኔም/ስልክ (${cleanPhone}) እና የይለፍ ቃል ተስተካክሏል።`,
    }),
  });
}

export async function deleteFallbackLandlordAccount(
  adminUid: string,
  actorName: string,
  landlord: Landlord
): Promise<void> {
  const store = await ensureFallbackInitialized();
  persistAndNotify({
    ...store,
    landlords: store.landlords.filter((l) => l.landlordId !== landlord.landlordId),
    history: appendFallbackHistory(store, {
      actorUid: adminUid,
      actorRole: 'admin',
      actorName,
      actionType: 'user_deleted',
      subjectType: 'landlord',
      subjectId: landlord.landlordId,
      subjectName: landlord.fullName,
      subjectPhone: landlord.phone,
      city: landlord.city,
      woreda: landlord.woreda,
      kebele: landlord.kebele,
      details: `የአከራይ ${landlord.fullName} (${landlord.phone}) መለያ ተሰርዟል።`,
    }),
  });
}

export async function createFallbackWantedPerson(
  actorUid: string,
  actorName: string,
  officerId: string | undefined,
  input: {
    fullName: string;
    phone: string;
    faydaId: string;
    photoImage?: string;
    reason: string;
    caseNumber: string;
    priority: 'critical' | 'high' | 'medium';
    city: string;
    woreda: string;
    kebele: string;
  }
): Promise<WantedPerson> {
  const store = await ensureFallbackInitialized();
  const wantedId = createValidId('want');
  const nowIso = new Date().toISOString();
  const wanted: WantedPerson = {
    wantedId,
    fullName: input.fullName.trim().slice(0, 150),
    phone: normalizePhone(input.phone).slice(0, 30),
    faydaId: input.faydaId.trim().slice(0, 60),
    photoImage: input.photoImage ? sanitizeImageSrc(input.photoImage) : undefined,
    reason: input.reason.trim().slice(0, 1000),
    caseNumber: input.caseNumber.trim().slice(0, 80),
    priority: input.priority,
    status: 'active',
    reportedByOfficerId: officerId,
    reportedByName: actorName.slice(0, 150),
    createdByUid: actorUid,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  persistAndNotify({
    ...store,
    wantedPersons: [wanted, ...store.wantedPersons],
    history: appendFallbackHistory(store, {
      actorUid,
      actorRole: 'police',
      actorName,
      actionType: 'wanted_registered',
      subjectType: 'wanted',
      subjectId: wantedId,
      subjectName: wanted.fullName || wanted.caseNumber,
      subjectPhone: wanted.phone,
      subjectIdNumber: wanted.faydaId,
      city: input.city || DEFAULT_REGION_NAME,
      woreda: input.woreda || '-',
      kebele: input.kebele || '-',
      details: `በህግ የሚፈለግ ግለሰብ ተመዝግቧል (${wanted.caseNumber})።`,
    }),
  });
  return wanted;
}

export async function updateFallbackWantedStatus(
  wantedId: string,
  status: 'active' | 'captured' | 'closed'
): Promise<void> {
  const store = await ensureFallbackInitialized();
  persistAndNotify({
    ...store,
    wantedPersons: store.wantedPersons.map((w) =>
      w.wantedId === wantedId ? { ...w, status, updatedAt: new Date().toISOString() } : w
    ),
  });
}

export async function deleteFallbackWantedPerson(
  adminUid: string,
  actorName: string,
  wanted: WantedPerson
): Promise<void> {
  const store = await ensureFallbackInitialized();
  persistAndNotify({
    ...store,
    wantedPersons: store.wantedPersons.filter((w) => w.wantedId !== wanted.wantedId),
    history: appendFallbackHistory(store, {
      actorUid: adminUid,
      actorRole: 'admin',
      actorName,
      actionType: 'record_deleted',
      subjectType: 'wanted',
      subjectId: wanted.wantedId,
      subjectName: wanted.fullName || wanted.caseNumber,
      city: DEFAULT_REGION_NAME,
      woreda: '-',
      kebele: '-',
      details: `በህግ የሚፈለግ መዝገብ (${wanted.fullName || wanted.caseNumber}) ተሰርዟል።`,
    }),
  });
}

export async function createFallbackWantedAlertIfMissing(
  actorUid: string,
  wanted: WantedPerson,
  tenant: Tenant,
  matchType: string
): Promise<void> {
  const store = await ensureFallbackInitialized();
  if (
    store.wantedAlerts.some(
      (a) => a.wantedId === wanted.wantedId && a.tenantId === tenant.tenantId
    )
  ) {
    return;
  }
  const alertId = `alt_${wanted.wantedId.slice(0, 16)}_${tenant.tenantId.slice(0, 16)}`;
  const nowIso = new Date().toISOString();
  const alert: WantedAlert = {
    alertId,
    wantedId: wanted.wantedId,
    wantedName: wanted.fullName || wanted.phone || wanted.faydaId || 'በፎቶ ተፈላጊ',
    tenantId: tenant.tenantId,
    tenantName: tenant.fullName,
    tenantPhone: tenant.phone,
    landlordId: tenant.landlordId,
    landlordName: tenant.landlordName,
    landlordPhone: tenant.landlordPhone,
    city: tenant.city,
    woreda: tenant.woreda,
    kebele: tenant.kebele,
    houseNumber: tenant.houseNumber,
    matchType: matchType.slice(0, 100),
    status: 'unread',
    createdByUid: actorUid,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  persistAndNotify({
    ...store,
    wantedAlerts: [alert, ...store.wantedAlerts],
  });
}

export async function updateFallbackAlertStatus(
  alertId: string,
  status: 'unread' | 'acknowledged' | 'resolved'
): Promise<void> {
  const store = await ensureFallbackInitialized();
  persistAndNotify({
    ...store,
    wantedAlerts: store.wantedAlerts.map((a) =>
      a.alertId === alertId ? { ...a, status, updatedAt: new Date().toISOString() } : a
    ),
  });
}

export async function createFallbackCriminalRecord(
  actorUid: string,
  actorName: string,
  officerId: string | undefined,
  input: {
    personName: string;
    phone?: string;
    faydaId?: string;
    photoImage?: string;
    recordType: RecordType;
    offenseTitle: string;
    description: string;
    city: string;
    woreda: string;
    kebele: string;
    stationName: string;
    incidentDate: string;
  }
): Promise<CriminalRecord> {
  const store = await ensureFallbackInitialized();
  const recordId = createValidId('crim');
  const nowIso = new Date().toISOString();
  const record: CriminalRecord = {
    recordId,
    personName: input.personName.trim().slice(0, 150),
    phone: input.phone ? normalizePhone(input.phone).slice(0, 30) : undefined,
    faydaId: input.faydaId ? input.faydaId.trim().slice(0, 60) : undefined,
    photoImage: input.photoImage ? sanitizeImageSrc(input.photoImage) : undefined,
    recordType: input.recordType,
    offenseTitle: input.offenseTitle.trim().slice(0, 200),
    description: input.description.trim().slice(0, 2000),
    city: input.city.trim().slice(0, 100),
    woreda: input.woreda.trim().slice(0, 100),
    kebele: input.kebele.trim().slice(0, 100),
    stationName: input.stationName.trim().slice(0, 150),
    incidentDate: input.incidentDate.slice(0, 30),
    recordedByOfficerId: officerId,
    recordedByName: actorName.slice(0, 150),
    createdByUid: actorUid,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  persistAndNotify({
    ...store,
    criminalRecords: [record, ...store.criminalRecords],
    history: appendFallbackHistory(store, {
      actorUid,
      actorRole: 'police',
      actorName,
      actionType: 'criminal_record_added',
      subjectType: 'criminal_record',
      subjectId: recordId,
      subjectName: record.personName,
      subjectPhone: record.phone,
      subjectIdNumber: record.faydaId,
      city: record.city,
      woreda: record.woreda,
      kebele: record.kebele,
      details: `የእስር/ወንጀል ሪከርድ ተመዝግቧል (${record.recordType}): ${record.offenseTitle}።`,
    }),
  });
  return record;
}

export async function updateFallbackCriminalRecordType(
  recordId: string,
  recordType: RecordType
): Promise<void> {
  const store = await ensureFallbackInitialized();
  persistAndNotify({
    ...store,
    criminalRecords: store.criminalRecords.map((r) =>
      r.recordId === recordId ? { ...r, recordType, updatedAt: new Date().toISOString() } : r
    ),
  });
}

export async function updateFallbackCriminalRecord(
  actorUid: string,
  actorName: string,
  recordId: string,
  updates: {
    personName: string;
    phone?: string;
    faydaId?: string;
    photoImage?: string;
    recordType: RecordType;
    offenseTitle: string;
    description: string;
    city: string;
    woreda: string;
    kebele: string;
    stationName: string;
    incidentDate: string;
  }
): Promise<void> {
  const store = await ensureFallbackInitialized();
  persistAndNotify({
    ...store,
    criminalRecords: store.criminalRecords.map((r) =>
      r.recordId === recordId
        ? {
            ...r,
            personName: updates.personName.trim().slice(0, 150),
            phone: updates.phone ? normalizePhone(updates.phone).slice(0, 30) : '',
            faydaId: updates.faydaId ? updates.faydaId.trim().slice(0, 60) : '',
            photoImage: updates.photoImage ? sanitizeImageSrc(updates.photoImage) : '',
            recordType: updates.recordType,
            offenseTitle: updates.offenseTitle.trim().slice(0, 200),
            description: updates.description.trim().slice(0, 2000),
            city: updates.city.trim().slice(0, 100),
            woreda: updates.woreda.trim().slice(0, 100),
            kebele: updates.kebele.trim().slice(0, 100),
            stationName: updates.stationName.trim().slice(0, 150),
            incidentDate: updates.incidentDate.slice(0, 30),
            updatedAt: new Date().toISOString(),
          }
        : r
    ),
    history: appendFallbackHistory(store, {
      actorUid,
      actorRole: 'police',
      actorName,
      actionType: 'criminal_record_updated',
      subjectType: 'criminal_record',
      subjectId: recordId,
      subjectName: updates.personName,
      subjectPhone: updates.phone ? normalizePhone(updates.phone) : undefined,
      subjectIdNumber: updates.faydaId,
      city: updates.city,
      woreda: updates.woreda,
      kebele: updates.kebele,
      details: `የወንጀል/ተጠርጣሪ ሪከርድ (${updates.personName}) ተስተካክሏል።`,
    }),
  });
}

export async function deleteFallbackCriminalRecord(
  adminUid: string,
  actorName: string,
  record: CriminalRecord
): Promise<void> {
  const store = await ensureFallbackInitialized();
  persistAndNotify({
    ...store,
    criminalRecords: store.criminalRecords.filter((r) => r.recordId !== record.recordId),
    history: appendFallbackHistory(store, {
      actorUid: adminUid,
      actorRole: 'admin',
      actorName,
      actionType: 'record_deleted',
      subjectType: 'criminal_record',
      subjectId: record.recordId,
      subjectName: record.personName,
      city: record.city,
      woreda: record.woreda,
      kebele: record.kebele,
      details: `የወንጀል/ጥርጣሬ ሪከርድ (${record.personName}) ተሰርዟል።`,
    }),
  });
}
