import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import type {
  ActivePortalSession,
  ActivityActionType,
  ActivityHistory,
  AdminCredential,
  AuthAccount,
  BrandingSetting,
  CriminalRecord,
  Jurisdiction,
  Landlord,
  PoliceOfficer,
  Tenant,
  WantedAlert,
  WantedPerson,
} from '../types';
import { FIELD_LIMITS } from '../types';
import {
  canonicalPhoneDigits,
  createValidId,
  decryptVaultJson,
  encryptVaultJson,
  generateSalt,
  generateVaultKey,
  hashPassword,
  normalizePhone,
  normalizeText,
  phonesMatch,
  sanitizeImageSrc,
  sha256Hex,
  verifyPassword,
} from '../utils/crypto';
import { getFallbackSnapshot, markFallbackIdsSynced } from '../utils/localFallback';
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
} from '../utils/seedData';

const ADMIN_CRED_DOC_ID = 'primary';
const ADMIN_AUTH_ACCOUNT_KEY = 'adm_primary';

let adminSeedPromise: Promise<AdminCredential> | null = null;
let jurisdictionSeedPromise: Promise<void> | null = null;

interface AdminVaultPayload {
  policeVaultKey: string;
}

interface PoliceVaultPayload {
  officerId: string;
  policeVaultKey: string;
}

interface LandlordVaultPayload {
  ownerUid: string;
  workspaceSecret: string;
  landlordId: string;
}

function assertSafeImageDataUrl(val: string | undefined, maxLen: number, required = false): string {
  const safe = sanitizeImageSrc(val);
  if (!safe) {
    if (required) {
      throw new Error('የምስል ፋይሉ የተፈቀደ ቅርፀት አይደለም (JPG/PNG/WEBP ብቻ)።');
    }
    return '';
  }
  if (safe.length > maxLen) {
    throw new Error('የምስሉ መጠን ከተፈቀደው ገደብ በላይ ነው።');
  }
  return safe;
}

async function getPoliceAccountKey(username: string): Promise<string> {
  const digest = await sha256Hex(username.trim().toLowerCase());
  return `pol_${digest}`;
}

async function getLandlordPhoneAccountKey(phone: string): Promise<string> {
  const canon = canonicalPhoneDigits(phone) || normalizePhone(phone);
  const digest = await sha256Hex(canon);
  return `ll_p_${digest}`;
}

async function getLandlordUsernameAccountKey(username: string): Promise<string> {
  const digest = await sha256Hex(username.trim().toLowerCase());
  return `ll_u_${digest}`;
}

function isValidVaultKeyClient(key?: string): key is string {
  return Boolean(key && key.length >= 48 && key.length <= 128 && /^[a-zA-Z0-9_\-]+$/.test(key));
}

function mergeById<T>(primary: T[], secondary: T[], getId: (item: T) => string): T[] {
  const map = new Map<string, T>();
  secondary.forEach((item) => map.set(getId(item), item));
  primary.forEach((item) => map.set(getId(item), item));
  return Array.from(map.values());
}

export function subscribeBranding(
  onData: (branding: BrandingSetting) => void
): Unsubscribe {
  const path = 'system_settings/branding';
  return onSnapshot(
    doc(db, 'system_settings', 'branding'),
    (snap) => {
      if (snap.exists()) {
        const raw = snap.data() as BrandingSetting;
        onData({
          ...raw,
          regionalFlagDataUrl: resolveRegionalFlagSrc(raw.regionalFlagDataUrl),
          ethiopianFlagDataUrl: resolveEthiopianFlagSrc(raw.ethiopianFlagDataUrl),
        });
      } else {
        onData({
          commissionName: DEFAULT_COMMISSION_NAME,
          subtitle: DEFAULT_COMMISSION_SUBTITLE,
          logoDataUrl: DEFAULT_LOGO_PATH,
          regionalFlagDataUrl: DEFAULT_REGIONAL_FLAG_PATH,
          ethiopianFlagDataUrl: DEFAULT_ETHIOPIAN_FLAG_PATH,
          updatedByUid: 'system',
          updatedAt: null,
        });
      }
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, path);
    }
  );
}

export async function saveBranding(
  uid: string,
  payload: {
    commissionName: string;
    subtitle: string;
    logoDataUrl: string;
    regionalFlagDataUrl?: string;
    ethiopianFlagDataUrl?: string;
  }
): Promise<void> {
  const path = 'system_settings/branding';
  const safeLogo = assertSafeImageDataUrl(payload.logoDataUrl, 450000, true);
  const safeRegionalFlag = assertSafeImageDataUrl(
    payload.regionalFlagDataUrl || DEFAULT_REGIONAL_FLAG_PATH,
    450000,
    false
  );
  const safeEthiopianFlag = assertSafeImageDataUrl(
    payload.ethiopianFlagDataUrl || DEFAULT_ETHIOPIAN_FLAG_PATH,
    450000,
    false
  );
  try {
    const ref = doc(db, 'system_settings', 'branding');
    const docPayload: Record<string, unknown> = {
      commissionName: payload.commissionName.slice(0, 200),
      subtitle: payload.subtitle.slice(0, 200),
      logoDataUrl: safeLogo,
      updatedByUid: uid || ADMIN_AUTH_ACCOUNT_KEY,
      updatedAt: serverTimestamp(),
    };
    if (safeRegionalFlag) docPayload.regionalFlagDataUrl = safeRegionalFlag;
    if (safeEthiopianFlag) docPayload.ethiopianFlagDataUrl = safeEthiopianFlag;

    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      await updateDoc(ref, docPayload);
    } else {
      await setDoc(ref, docPayload);
    }
    await logActivity({
      actorUid: uid || ADMIN_AUTH_ACCOUNT_KEY,
      actorRole: 'admin',
      actorName: 'ክልል ዋና አድሚን',
      actionType: 'logo_updated',
      subjectType: 'system',
      subjectId: 'branding',
      subjectName: payload.commissionName,
      city: 'ቤኒሻንጉል ጉሙዝ',
      woreda: 'ክልል',
      kebele: 'ዋና ጽ/ቤት',
      details: 'የፖሊስ ኮሚሽን ሎጎ፣ የክልል እና የኢትዮጵያ ሰንደቅአላማ እና መጠሪያ ተዘምኗል።',
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function bootstrapAdminAuthAccount(
  username = 'admin',
  password = 'admin',
  ownerUid = ADMIN_AUTH_ACCOUNT_KEY
): Promise<{ account: AuthAccount; policeVaultKey: string }> {
  const ref = doc(db, 'auth_accounts', ADMIN_AUTH_ACCOUNT_KEY);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const existing = snap.data() as AuthAccount;
    const vault = await decryptVaultJson<AdminVaultPayload>(
      existing.encryptedVault,
      existing.vaultSalt,
      password
    );
    return { account: existing, policeVaultKey: vault.policeVaultKey };
  }

  const policeVaultKey = generateVaultKey();
  const passwordSalt = generateSalt();
  const passwordHash = await hashPassword(password, passwordSalt);
  const { vaultSalt, encryptedVault } = await encryptVaultJson(
    { policeVaultKey } satisfies AdminVaultPayload,
    password
  );

  const payload: Record<string, unknown> = {
    accountKey: ADMIN_AUTH_ACCOUNT_KEY,
    role: 'admin',
    targetId: ADMIN_CRED_DOC_ID,
    ownerUid: ownerUid || ADMIN_AUTH_ACCOUNT_KEY,
    username,
    passwordHash,
    passwordSalt,
    vaultSalt,
    encryptedVault,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(ref, payload);
  const freshSnap = await getDoc(ref);
  return {
    account: (freshSnap.exists() ? freshSnap.data() : payload) as AuthAccount,
    policeVaultKey,
  };
}

export async function ensureAdminCredentialsSeeded(adminUid: string): Promise<AdminCredential> {
  if (adminSeedPromise) return adminSeedPromise;
  adminSeedPromise = (async () => {
    const path = `auth_accounts/${ADMIN_AUTH_ACCOUNT_KEY}`;
    try {
      const authRef = doc(db, 'auth_accounts', ADMIN_AUTH_ACCOUNT_KEY);
      const authSnap = await getDoc(authRef);
      if (authSnap.exists()) {
        const acc = authSnap.data() as AuthAccount;
        return {
          credId: ADMIN_CRED_DOC_ID,
          username: acc.username,
          passwordHash: acc.passwordHash,
          passwordSalt: acc.passwordSalt,
          isDefaultPassword: acc.username === 'admin',
          updatedByUid: acc.ownerUid,
          createdAt: acc.createdAt,
          updatedAt: acc.updatedAt,
        };
      }

      // Legacy sync only when a verified Google user is signed in
      let legacyCred: AdminCredential | null = null;
      if (auth.currentUser?.emailVerified) {
        try {
          const legacySnap = await getDoc(doc(db, 'admin_credentials', ADMIN_CRED_DOC_ID));
          if (legacySnap.exists()) {
            legacyCred = legacySnap.data() as AdminCredential;
          }
        } catch {
          // Non-Google Admin sessions cannot read legacy admin_credentials directly
        }
      }

      if (legacyCred && !legacyCred.isDefaultPassword) {
        return legacyCred;
      }

      const { account } = await bootstrapAdminAuthAccount(
        'admin',
        'admin',
        adminUid || ADMIN_AUTH_ACCOUNT_KEY
      );

      // Best-effort sync to legacy admin_credentials when Google Admin is active
      if (auth.currentUser?.emailVerified) {
        try {
          const legacyRef = doc(db, 'admin_credentials', ADMIN_CRED_DOC_ID);
          const legacySnap = await getDoc(legacyRef);
          if (!legacySnap.exists()) {
            await setDoc(legacyRef, {
              credId: ADMIN_CRED_DOC_ID,
              username: account.username,
              passwordHash: account.passwordHash,
              passwordSalt: account.passwordSalt,
              isDefaultPassword: true,
              updatedByUid: adminUid || ADMIN_AUTH_ACCOUNT_KEY,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        } catch {
          // Ignore if caller is not Google-authenticated Admin
        }
      }

      return {
        credId: ADMIN_CRED_DOC_ID,
        username: account.username,
        passwordHash: account.passwordHash,
        passwordSalt: account.passwordSalt,
        isDefaultPassword: true,
        updatedByUid: account.ownerUid,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      };
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    } finally {
      adminSeedPromise = null;
    }
  })();
  return adminSeedPromise;
}

export function subscribeAdminCredentials(
  onData: (cred: AdminCredential | null) => void
): Unsubscribe {
  const path = `auth_accounts/${ADMIN_AUTH_ACCOUNT_KEY}`;
  return onSnapshot(
    doc(db, 'auth_accounts', ADMIN_AUTH_ACCOUNT_KEY),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const acc = snap.data() as AuthAccount;
      onData({
        credId: ADMIN_CRED_DOC_ID,
        username: acc.username,
        passwordHash: acc.passwordHash,
        passwordSalt: acc.passwordSalt,
        isDefaultPassword: acc.username === 'admin',
        updatedByUid: acc.ownerUid,
        createdAt: acc.createdAt,
        updatedAt: acc.updatedAt,
      });
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, path);
    }
  );
}

export async function updateAdminCredentials(params: {
  adminUid: string;
  actorName: string;
  currentPassword: string;
  newUsername: string;
  newPassword?: string;
  currentPoliceVaultKey?: string;
}): Promise<{ username: string }> {
  const path = `auth_accounts/${ADMIN_AUTH_ACCOUNT_KEY}`;
  const cleanUsername = params.newUsername.trim().slice(0, 60);
  if (!cleanUsername || !FIELD_LIMITS.USERNAME_PATTERN.test(cleanUsername)) {
    throw new Error('ዩዘርኔም የእንግሊዝኛ ፊደላት፣ ቁጥሮች ወይም (._-) ብቻ መያዝ አለበት።');
  }

  let authSnap = await getDoc(doc(db, 'auth_accounts', ADMIN_AUTH_ACCOUNT_KEY));
  if (!authSnap.exists()) {
    if (params.currentPassword === 'admin') {
      await bootstrapAdminAuthAccount('admin', 'admin', params.adminUid);
      authSnap = await getDoc(doc(db, 'auth_accounts', ADMIN_AUTH_ACCOUNT_KEY));
    } else {
      throw new Error('የአሁኑ የይለፍ ቃል ትክክል አይደለም።');
    }
  }

  const acc = authSnap.data() as AuthAccount;
  const currentOk = await verifyPassword(
    params.currentPassword,
    acc.passwordSalt,
    acc.passwordHash
  );
  if (!currentOk) {
    throw new Error('የገባው የአሁኑ የይለፍ ቃል ትክክል አይደለም።');
  }

  let policeVaultKey = params.currentPoliceVaultKey || '';
  try {
    const vault = await decryptVaultJson<AdminVaultPayload>(
      acc.encryptedVault,
      acc.vaultSalt,
      params.currentPassword
    );
    policeVaultKey = vault.policeVaultKey;
  } catch {
    if (!policeVaultKey) {
      policeVaultKey = generateVaultKey();
    }
  }

  const effectivePassword =
    params.newPassword && params.newPassword.length > 0
      ? params.newPassword
      : params.currentPassword;
  if (params.newPassword && params.newPassword.length > 0 && params.newPassword.length < 4) {
    throw new Error('አዲሱ የይለፍ ቃል ቢያንስ 4 ቁምፊ መሆን አለበት።');
  }

  const nextSalt = generateSalt();
  const nextHash = await hashPassword(effectivePassword, nextSalt);
  const { vaultSalt, encryptedVault } = await encryptVaultJson(
    { policeVaultKey } satisfies AdminVaultPayload,
    effectivePassword
  );

  try {
    await updateDoc(doc(db, 'auth_accounts', ADMIN_AUTH_ACCOUNT_KEY), {
      username: cleanUsername,
      passwordHash: nextHash,
      passwordSalt: nextSalt,
      vaultSalt,
      encryptedVault,
      ownerUid: params.adminUid || ADMIN_AUTH_ACCOUNT_KEY,
      updatedAt: serverTimestamp(),
    });

    // Best-effort sync to legacy admin_credentials if Google Admin is active
    if (auth.currentUser?.emailVerified) {
      try {
        const legacyRef = doc(db, 'admin_credentials', ADMIN_CRED_DOC_ID);
        const legacySnap = await getDoc(legacyRef);
        if (legacySnap.exists()) {
          await updateDoc(legacyRef, {
            username: cleanUsername,
            passwordHash: nextHash,
            passwordSalt: nextSalt,
            isDefaultPassword: false,
            updatedByUid: params.adminUid,
            updatedAt: serverTimestamp(),
          });
        }
      } catch {
        // Ignore if caller is not Google-authenticated Admin
      }
    }

    await logActivity({
      actorUid: params.adminUid || ADMIN_AUTH_ACCOUNT_KEY,
      actorRole: 'admin',
      actorName: params.actorName || 'ክልል ዋና አድሚን',
      actionType: 'admin_credentials_updated',
      subjectType: 'system',
      subjectId: ADMIN_CRED_DOC_ID,
      subjectName: cleanUsername,
      city: 'ቤኒሻንጉል ጉሙዝ',
      woreda: 'ክልል',
      kebele: 'ዋና ጽ/ቤት',
      details: `የአድሚን መግቢያ ዩዘርኔም (${cleanUsername}) እና የይለፍ ቃል በአድሚኑ ተስተካክሏል።`,
    });
    return { username: cleanUsername };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export function subscribeJurisdictions(
  onData: (items: Jurisdiction[]) => void
): Unsubscribe {
  const path = 'jurisdictions';
  return onSnapshot(
    query(collection(db, 'jurisdictions'), limit(500)),
    (snap) => {
      if (snap.empty) {
        onData(
          DEFAULT_JURISDICTIONS.map((j) => ({
            ...j,
            createdByUid: 'seed',
            createdAt: null,
          }))
        );
      } else {
        const list = snap.docs.map((d) => {
          const j = d.data() as Jurisdiction;
          return {
            ...j,
            region: j.region || DEFAULT_REGION_NAME,
            zone: j.zone || inferZoneForCity(j.city),
          };
        });
        onData(list);
      }
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export async function seedDefaultJurisdictionsIfEmpty(uid: string): Promise<void> {
  if (jurisdictionSeedPromise) return jurisdictionSeedPromise;
  jurisdictionSeedPromise = (async () => {
    const path = 'jurisdictions';
    try {
      const snap = await getDocs(query(collection(db, 'jurisdictions'), limit(500)));
      if (!snap.empty) return;
      await Promise.all(
        DEFAULT_JURISDICTIONS.map((j) =>
          setDoc(doc(db, 'jurisdictions', j.id), {
            id: j.id,
            region: j.region,
            zone: j.zone,
            city: j.city,
            woreda: j.woreda,
            kebele: j.kebele,
            createdByUid: uid || ADMIN_AUTH_ACCOUNT_KEY,
            createdAt: serverTimestamp(),
          })
        )
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    } finally {
      jurisdictionSeedPromise = null;
    }
  })();
  return jurisdictionSeedPromise;
}

export async function addJurisdiction(
  uid: string,
  input: {
    region: string;
    zone: string;
    city: string;
    woreda: string;
    kebele: string;
  }
): Promise<void> {
  const id = createValidId('jur');
  const path = `jurisdictions/${id}`;
  try {
    await setDoc(doc(db, 'jurisdictions', id), {
      id,
      region: (input.region || DEFAULT_REGION_NAME).trim().slice(0, 100),
      zone: (input.zone || inferZoneForCity(input.city)).trim().slice(0, 100),
      city: input.city.trim().slice(0, 100),
      woreda: input.woreda.trim().slice(0, 100),
      kebele: input.kebele.trim().slice(0, 100),
      createdByUid: uid || ADMIN_AUTH_ACCOUNT_KEY,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateJurisdiction(
  jurisdictionId: string,
  updates: {
    region: string;
    zone: string;
    city: string;
    woreda: string;
    kebele: string;
  }
): Promise<void> {
  const path = `jurisdictions/${jurisdictionId}`;
  try {
    await updateDoc(doc(db, 'jurisdictions', jurisdictionId), {
      region: (updates.region || DEFAULT_REGION_NAME).trim().slice(0, 100),
      zone: (updates.zone || inferZoneForCity(updates.city)).trim().slice(0, 100),
      city: updates.city.trim().slice(0, 100),
      woreda: updates.woreda.trim().slice(0, 100),
      kebele: updates.kebele.trim().slice(0, 100),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteJurisdiction(jurisdictionId: string): Promise<void> {
  const path = `jurisdictions/${jurisdictionId}`;
  try {
    await deleteDoc(doc(db, 'jurisdictions', jurisdictionId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function logActivity(params: {
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
  workspaceSecret?: string;
}): Promise<void> {
  const historyId = createValidId('hist');
  const path = `activity_history/${historyId}`;
  try {
    const payload: Record<string, unknown> = {
      historyId,
      actorUid: params.actorUid,
      actorRole: params.actorRole,
      actorName: params.actorName.slice(0, 150),
      actionType: params.actionType,
      subjectType: params.subjectType,
      subjectId: params.subjectId,
      subjectName: params.subjectName.slice(0, 150),
      city: (params.city || '-').slice(0, 100),
      woreda: (params.woreda || '-').slice(0, 100),
      kebele: (params.kebele || '-').slice(0, 100),
      details: params.details.slice(0, 1000),
      createdAt: serverTimestamp(),
    };
    if (params.subjectPhone) payload.subjectPhone = params.subjectPhone.slice(0, 30);
    if (params.subjectIdNumber) payload.subjectIdNumber = params.subjectIdNumber.slice(0, 60);

    await setDoc(doc(db, 'activity_history', historyId), payload);
    if (isValidVaultKeyClient(params.workspaceSecret)) {
      await setDoc(
        doc(db, 'landlord_workspaces', params.workspaceSecret, 'history', historyId),
        payload
      );
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function createPoliceOfficer(
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
  },
  policeVaultKey = ''
): Promise<PoliceOfficer> {
  const cleanUsername = input.username.trim().slice(0, 60);
  if (!cleanUsername || !FIELD_LIMITS.USERNAME_PATTERN.test(cleanUsername)) {
    throw new Error('ዩዘርኔም የእንግሊዝኛ ፊደላት፣ ቁጥሮች ወይም (._-) ብቻ መያዝ አለበት።');
  }

  const polAuthKey = await getPoliceAccountKey(cleanUsername);
  const existingAuth = await getDoc(doc(db, 'auth_accounts', polAuthKey));
  if (existingAuth.exists()) {
    throw new Error('ይህ የፖሊስ ዩዘርኔም አስቀድሞ ተይዟል። እባክዎ ሌላ ዩዘርኔም ይምረጡ።');
  }

  const officerId = createValidId('off');
  const salt = generateSalt();
  const passwordHash = await hashPassword(input.password, salt);
  const effectiveVaultKey = isValidVaultKeyClient(policeVaultKey)
    ? policeVaultKey
    : generateVaultKey();
  const { vaultSalt, encryptedVault } = await encryptVaultJson(
    { officerId, policeVaultKey: effectiveVaultKey } satisfies PoliceVaultPayload,
    input.password
  );

  const path = `police_officers/${officerId}`;
  try {
    const docData: Record<string, unknown> = {
      officerId,
      fullName: input.fullName.trim().slice(0, 150),
      rank: input.rank.trim().slice(0, 80),
      badgeNumber: input.badgeNumber.trim().slice(0, 60),
      phone: normalizePhone(input.phone).slice(0, 30),
      username: cleanUsername,
      passwordHash,
      passwordSalt: salt,
      jurisdictionLevel: input.jurisdictionLevel,
      city: input.city.trim().slice(0, 100),
      woreda: (input.woreda || '').trim().slice(0, 100),
      kebele: (input.kebele || '').trim().slice(0, 100),
      active: true,
      createdByUid: adminUid || ADMIN_AUTH_ACCOUNT_KEY,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const cleanEmail = (input.officerEmail || '').trim().toLowerCase();
    if (cleanEmail) {
      docData.officerEmail = cleanEmail.slice(0, 160);
      try {
        await setDoc(doc(db, 'police_emails', cleanEmail), {
          email: cleanEmail,
          officerId,
          active: true,
          createdByUid: adminUid,
          createdAt: serverTimestamp(),
        });
      } catch {
        // Optional when operating without Google Admin session
      }
    }

    await setDoc(doc(db, 'police_officers', officerId), docData);
    await setDoc(doc(db, 'auth_accounts', polAuthKey), {
      accountKey: polAuthKey,
      role: 'police',
      targetId: officerId,
      ownerUid: officerId,
      username: cleanUsername,
      passwordHash,
      passwordSalt: salt,
      vaultSalt,
      encryptedVault,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await logActivity({
      actorUid: adminUid || ADMIN_AUTH_ACCOUNT_KEY,
      actorRole: 'admin',
      actorName: 'ክልል ዋና አድሚን',
      actionType: 'officer_created',
      subjectType: 'officer',
      subjectId: officerId,
      subjectName: input.fullName,
      subjectPhone: input.phone,
      city: input.city,
      woreda: input.woreda || '-',
      kebele: input.kebele || '-',
      details: `አዲስ የፖሊስ መኮንን መለያ (${cleanUsername}) ለ ${input.city} ${input.woreda} ${input.kebele} ተከፍቷል።`,
    });
    return docData as unknown as PoliceOfficer;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function resetUserPassword(
  actorUid: string,
  actorRole: 'admin' | 'police',
  actorName: string,
  targetType: 'landlord' | 'officer',
  targetId: string,
  targetName: string,
  targetPhone: string,
  city: string,
  woreda: string,
  kebele: string,
  newPassword: string
): Promise<void> {
  const salt = generateSalt();
  const passwordHash = await hashPassword(newPassword, salt);
  const collectionName = targetType === 'landlord' ? 'landlords' : 'police_officers';
  const path = `${collectionName}/${targetId}`;
  try {
    await updateDoc(doc(db, collectionName, targetId), {
      passwordHash,
      passwordSalt: salt,
      updatedAt: serverTimestamp(),
    });
    await logActivity({
      actorUid,
      actorRole,
      actorName,
      actionType: 'password_reset',
      subjectType: targetType,
      subjectId: targetId,
      subjectName: targetName,
      subjectPhone: targetPhone,
      city,
      woreda,
      kebele,
      details: `የ ${targetName} (${targetPhone}) የይለፍ ቃል በ${actorName} ታድሷል፤ የቀድሞ ታሪክ እንዳለ ተጠብቋል።`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function updateOfficerCredentials(
  adminUid: string,
  actorName: string,
  officer: PoliceOfficer,
  updates: {
    newUsername: string;
    newPassword?: string;
    active?: boolean;
  },
  policeVaultKey = ''
): Promise<void> {
  const cleanUsername = updates.newUsername.trim().slice(0, 60);
  if (!cleanUsername || !FIELD_LIMITS.USERNAME_PATTERN.test(cleanUsername)) {
    throw new Error('ዩዘርኔም የእንግሊዝኛ ፊደላት፣ ቁጥሮች ወይም (._-) ብቻ መያዝ አለበት።');
  }
  const path = `police_officers/${officer.officerId}`;
  try {
    const nextActive = typeof updates.active === 'boolean' ? updates.active : officer.active;
    const patch: Record<string, unknown> = {
      username: cleanUsername,
      active: nextActive,
      updatedAt: serverTimestamp(),
    };

    let nextPasswordHash = officer.passwordHash;
    let nextPasswordSalt = officer.passwordSalt;
    if (updates.newPassword && updates.newPassword.length > 0) {
      if (updates.newPassword.length < 4) {
        throw new Error('አዲሱ የይለፍ ቃል ቢያንስ 4 ቁምፊ መሆን አለበት።');
      }
      nextPasswordSalt = generateSalt();
      nextPasswordHash = await hashPassword(updates.newPassword, nextPasswordSalt);
      patch.passwordSalt = nextPasswordSalt;
      patch.passwordHash = nextPasswordHash;
    }

    await updateDoc(doc(db, 'police_officers', officer.officerId), patch);

    const oldAuthKey = await getPoliceAccountKey(officer.username);
    const newAuthKey = await getPoliceAccountKey(cleanUsername);
    const oldAuthSnap = await getDoc(doc(db, 'auth_accounts', oldAuthKey));

    let vaultSalt = oldAuthSnap.exists() ? (oldAuthSnap.data() as AuthAccount).vaultSalt : '';
    let encryptedVault = oldAuthSnap.exists()
      ? (oldAuthSnap.data() as AuthAccount).encryptedVault
      : '';

    if (updates.newPassword && updates.newPassword.length > 0) {
      const effectiveVaultKey = isValidVaultKeyClient(policeVaultKey)
        ? policeVaultKey
        : generateVaultKey();
      const enc = await encryptVaultJson(
        { officerId: officer.officerId, policeVaultKey: effectiveVaultKey } satisfies PoliceVaultPayload,
        updates.newPassword
      );
      vaultSalt = enc.vaultSalt;
      encryptedVault = enc.encryptedVault;
    }

    if (vaultSalt && encryptedVault) {
      const newAuthSnap =
        newAuthKey === oldAuthKey ? oldAuthSnap : await getDoc(doc(db, 'auth_accounts', newAuthKey));
      if (newAuthSnap.exists()) {
        await updateDoc(doc(db, 'auth_accounts', newAuthKey), {
          targetId: officer.officerId,
          ownerUid: officer.officerId,
          username: cleanUsername,
          passwordHash: nextPasswordHash,
          passwordSalt: nextPasswordSalt,
          vaultSalt,
          encryptedVault,
          active: nextActive,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, 'auth_accounts', newAuthKey), {
          accountKey: newAuthKey,
          role: 'police',
          targetId: officer.officerId,
          ownerUid: officer.officerId,
          username: cleanUsername,
          passwordHash: nextPasswordHash,
          passwordSalt: nextPasswordSalt,
          vaultSalt,
          encryptedVault,
          active: nextActive,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      if (oldAuthKey !== newAuthKey && oldAuthSnap.exists()) {
        await deleteDoc(doc(db, 'auth_accounts', oldAuthKey)).catch(() => undefined);
      }
    }

    await logActivity({
      actorUid: adminUid || ADMIN_AUTH_ACCOUNT_KEY,
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
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

async function hydrateLandlordWorkspace(
  ownerUid: string,
  workspaceSecret: string
): Promise<void> {
  const [llSnap, tenSnap, histSnap] = await Promise.all([
    getDocs(query(collection(db, 'landlords'), where('ownerUid', '==', ownerUid), limit(500))),
    getDocs(query(collection(db, 'tenants'), where('landlordUid', '==', ownerUid), limit(1000))),
    getDocs(query(collection(db, 'activity_history'), where('actorUid', '==', ownerUid), limit(1000))),
  ]);

  await Promise.all([
    ...llSnap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return setDoc(
        doc(db, 'landlord_workspaces', workspaceSecret, 'properties', d.id),
        { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
      );
    }),
    ...tenSnap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return setDoc(
        doc(db, 'landlord_workspaces', workspaceSecret, 'tenants', d.id),
        { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
      );
    }),
    ...histSnap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return setDoc(
        doc(db, 'landlord_workspaces', workspaceSecret, 'history', d.id),
        { ...data, createdAt: serverTimestamp() }
      );
    }),
  ]);
}

export async function updateLandlordCredentials(
  actorUid: string,
  actorRole: 'admin' | 'police',
  actorName: string,
  landlord: Landlord,
  updates: {
    newPhone: string;
    newPassword?: string;
  }
): Promise<void> {
  const cleanPhone = normalizePhone(updates.newPhone).slice(0, 30);
  if (!cleanPhone) {
    throw new Error('እባክዎ ትክክለኛ ስልክ ቁጥር (ዩዘርኔም) ያስገቡ።');
  }
  const path = `landlords/${landlord.landlordId}`;
  try {
    const patch: Record<string, unknown> = {
      phone: cleanPhone,
      updatedAt: serverTimestamp(),
    };
    let nextHash = landlord.passwordHash;
    let nextSalt = landlord.passwordSalt;
    if (updates.newPassword && updates.newPassword.length > 0) {
      if (updates.newPassword.length < 4) {
        throw new Error('አዲሱ የይለፍ ቃል ቢያንስ 4 ቁምፊ መሆን አለበት።');
      }
      nextSalt = generateSalt();
      nextHash = await hashPassword(updates.newPassword, nextSalt);
      patch.passwordSalt = nextSalt;
      patch.passwordHash = nextHash;
    }
    await updateDoc(doc(db, 'landlords', landlord.landlordId), patch);

    const oldPhoneKey = await getLandlordPhoneAccountKey(landlord.phone);
    const newPhoneKey = await getLandlordPhoneAccountKey(cleanPhone);
    const oldAuthSnap = await getDoc(doc(db, 'auth_accounts', oldPhoneKey));
    const oldUsernameKey = landlord.username
      ? await getLandlordUsernameAccountKey(landlord.username)
      : '';

    let vaultSalt = oldAuthSnap.exists() ? (oldAuthSnap.data() as AuthAccount).vaultSalt : '';
    let encryptedVault = oldAuthSnap.exists()
      ? (oldAuthSnap.data() as AuthAccount).encryptedVault
      : '';

    if (updates.newPassword && updates.newPassword.length > 0) {
      // Admin/Police resetting a landlord password creates a hydrated cross-device workspace with the new password
      const newWorkspaceSecret = generateVaultKey();
      await hydrateLandlordWorkspace(landlord.ownerUid, newWorkspaceSecret);
      const enc = await encryptVaultJson(
        {
          ownerUid: landlord.ownerUid,
          workspaceSecret: newWorkspaceSecret,
          landlordId: landlord.landlordId,
        } satisfies LandlordVaultPayload,
        updates.newPassword
      );
      vaultSalt = enc.vaultSalt;
      encryptedVault = enc.encryptedVault;
    }

    if (vaultSalt && encryptedVault) {
      const targetSnap =
        newPhoneKey === oldPhoneKey ? oldAuthSnap : await getDoc(doc(db, 'auth_accounts', newPhoneKey));
      if (targetSnap.exists()) {
        await updateDoc(doc(db, 'auth_accounts', newPhoneKey), {
          targetId: landlord.landlordId,
          ownerUid: landlord.ownerUid,
          username: cleanPhone,
          passwordHash: nextHash,
          passwordSalt: nextSalt,
          vaultSalt,
          encryptedVault,
          active: landlord.status === 'active',
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, 'auth_accounts', newPhoneKey), {
          accountKey: newPhoneKey,
          role: 'landlord',
          targetId: landlord.landlordId,
          ownerUid: landlord.ownerUid,
          username: cleanPhone,
          passwordHash: nextHash,
          passwordSalt: nextSalt,
          vaultSalt,
          encryptedVault,
          active: landlord.status === 'active',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      if (oldPhoneKey !== newPhoneKey && oldAuthSnap.exists()) {
        await deleteDoc(doc(db, 'auth_accounts', oldPhoneKey)).catch(() => undefined);
      }

      if (oldUsernameKey) {
        const userAuthSnap = await getDoc(doc(db, 'auth_accounts', oldUsernameKey));
        if (userAuthSnap.exists()) {
          await updateDoc(doc(db, 'auth_accounts', oldUsernameKey), {
            passwordHash: nextHash,
            passwordSalt: nextSalt,
            vaultSalt,
            encryptedVault,
            updatedAt: serverTimestamp(),
          });
        }
      }
    }

    await logActivity({
      actorUid: actorUid || ADMIN_AUTH_ACCOUNT_KEY,
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
      details: `የአከራይ ${landlord.fullName} ዩዘርኔም/ስልክ (${cleanPhone}) እና የይለፍ ቃል በ${actorName} ተስተካክሏል።`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteOfficerAccount(
  adminUid: string,
  actorName: string,
  officer: PoliceOfficer
): Promise<void> {
  const path = `police_officers/${officer.officerId}`;
  try {
    if (officer.officerEmail) {
      await deleteDoc(doc(db, 'police_emails', officer.officerEmail.toLowerCase())).catch(() => undefined);
    }
    const polAuthKey = await getPoliceAccountKey(officer.username);
    await deleteDoc(doc(db, 'auth_accounts', polAuthKey)).catch(() => undefined);
    await deleteDoc(doc(db, 'police_officers', officer.officerId));
    await logActivity({
      actorUid: adminUid || ADMIN_AUTH_ACCOUNT_KEY,
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
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function deleteLandlordAccount(
  adminUid: string,
  actorName: string,
  landlord: Landlord
): Promise<void> {
  const path = `landlords/${landlord.landlordId}`;
  try {
    const phoneKey = await getLandlordPhoneAccountKey(landlord.phone);
    await deleteDoc(doc(db, 'auth_accounts', phoneKey)).catch(() => undefined);
    if (landlord.username) {
      const userKey = await getLandlordUsernameAccountKey(landlord.username);
      await deleteDoc(doc(db, 'auth_accounts', userKey)).catch(() => undefined);
    }
    await deleteDoc(doc(db, 'landlords', landlord.landlordId));
    await logActivity({
      actorUid: adminUid || ADMIN_AUTH_ACCOUNT_KEY,
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
      details: `የአከራይ ${landlord.fullName} (${landlord.phone}) መለያ በአድሚን ተሰርዟል።`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function registerLandlord(
  ownerUid: string,
  input: {
    fullName: string;
    phone: string;
    username?: string;
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
  actorName?: string,
  existingWorkspaceSecret?: string
): Promise<Landlord> {
  const cleanPhone = normalizePhone(input.phone).slice(0, 30);
  if (!cleanPhone) {
    throw new Error('እባክዎ ትክክለኛ ስልክ ቁጥር ያስገቡ።');
  }
  const cleanUsername = (input.username || '').trim().slice(0, 60);
  if (cleanUsername && !FIELD_LIMITS.USERNAME_PATTERN.test(cleanUsername)) {
    throw new Error('ዩዘርኔም የእንግሊዝኛ ፊደላት፣ ቁጥሮች ወይም (._-) ብቻ መያዝ አለበት።');
  }

  const isAddingProperty = Boolean(existingWorkspaceSecret);
  const phoneAuthKey = await getLandlordPhoneAccountKey(cleanPhone);
  const userAuthKey = cleanUsername ? await getLandlordUsernameAccountKey(cleanUsername) : '';

  if (!isAddingProperty) {
    const existingPhoneSnap = await getDoc(doc(db, 'auth_accounts', phoneAuthKey));
    if (existingPhoneSnap.exists()) {
      throw new Error('ይህ ስልክ ቁጥር አስቀድሞ ተመዝግቧል። እባክዎ ሎጊን ብለው ይግቡ።');
    }
    if (userAuthKey) {
      const existingUserSnap = await getDoc(doc(db, 'auth_accounts', userAuthKey));
      if (existingUserSnap.exists()) {
        throw new Error('ይህ ዩዘርኔም አስቀድሞ ተይዟል። እባክዎ ሌላ ዩዘርኔም ይምረጡ።');
      }
    }
  }

  const effectiveOwnerUid =
    ownerUid && FIELD_LIMITS.ID_PATTERN.test(ownerUid) ? ownerUid : createValidId('lluid');
  const workspaceSecret = isValidVaultKeyClient(existingWorkspaceSecret)
    ? existingWorkspaceSecret
    : generateVaultKey();
  const landlordId = createValidId('ll');
  const salt = generateSalt();
  const passwordHash = await hashPassword(input.password, salt);
  const path = `landlords/${landlordId}`;
  const safeFront = assertSafeImageDataUrl(input.idFrontImage, 350000, true);
  const safeBack = assertSafeImageDataUrl(input.idBackImage, 350000, true);

  try {
    const payload: Record<string, unknown> = {
      landlordId,
      ownerUid: effectiveOwnerUid,
      fullName: input.fullName.trim().slice(0, 150),
      phone: cleanPhone,
      region: (input.region || DEFAULT_REGION_NAME).trim().slice(0, 100),
      zone: (input.zone || inferZoneForCity(input.city)).trim().slice(0, 100),
      city: input.city.trim().slice(0, 100),
      woreda: input.woreda.trim().slice(0, 100),
      kebele: input.kebele.trim().slice(0, 100),
      houseNumber: input.houseNumber.trim().slice(0, 60),
      roomCount: Math.max(1, Math.min(500, Math.floor(input.roomCount))),
      faydaId: input.faydaId.trim().slice(0, 60),
      idFrontImage: safeFront,
      idBackImage: safeBack,
      passwordHash,
      passwordSalt: salt,
      status: 'active' as const,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (cleanUsername) {
      payload.username = cleanUsername;
    }

    await setDoc(doc(db, 'landlords', landlordId), payload);
    await setDoc(
      doc(db, 'landlord_workspaces', workspaceSecret, 'properties', landlordId),
      payload
    );

    if (!isAddingProperty) {
      const { vaultSalt, encryptedVault } = await encryptVaultJson(
        {
          ownerUid: effectiveOwnerUid,
          workspaceSecret,
          landlordId,
        } satisfies LandlordVaultPayload,
        input.password
      );

      await setDoc(doc(db, 'auth_accounts', phoneAuthKey), {
        accountKey: phoneAuthKey,
        role: 'landlord',
        targetId: landlordId,
        ownerUid: effectiveOwnerUid,
        username: cleanPhone,
        passwordHash,
        passwordSalt: salt,
        vaultSalt,
        encryptedVault,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (userAuthKey) {
        await setDoc(doc(db, 'auth_accounts', userAuthKey), {
          accountKey: userAuthKey,
          role: 'landlord',
          targetId: landlordId,
          ownerUid: effectiveOwnerUid,
          username: cleanUsername,
          passwordHash,
          passwordSalt: salt,
          vaultSalt,
          encryptedVault,
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    await logActivity({
      actorUid: effectiveOwnerUid,
      actorRole,
      actorName: actorName || input.fullName,
      actionType: 'landlord_registered',
      subjectType: 'landlord',
      subjectId: landlordId,
      subjectName: input.fullName,
      subjectPhone: cleanPhone,
      subjectIdNumber: input.faydaId.trim().slice(0, 60),
      city: payload.city as string,
      woreda: payload.woreda as string,
      kebele: payload.kebele as string,
      details: `አዲስ አከራይ ተመዝግቧል — ${payload.roomCount} ክፍሎች፣ የቤት ቁጥር ${payload.houseNumber} (${payload.region}, ${payload.zone}, ${payload.city}, ${payload.woreda}, ${payload.kebele})።`,
      workspaceSecret,
    });
    return payload as unknown as Landlord;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateLandlordAddress(
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
  },
  workspaceSecret?: string
): Promise<void> {
  const path = `landlords/${landlord.landlordId}`;
  const patch = {
    region: (updates.region || landlord.region || DEFAULT_REGION_NAME).trim().slice(0, 100),
    zone: (updates.zone || inferZoneForCity(updates.city)).trim().slice(0, 100),
    city: updates.city.trim().slice(0, 100),
    woreda: updates.woreda.trim().slice(0, 100),
    kebele: updates.kebele.trim().slice(0, 100),
    houseNumber: updates.houseNumber.trim().slice(0, 60),
    roomCount: Math.max(1, Math.min(500, Math.floor(updates.roomCount))),
    phone: normalizePhone(updates.phone).slice(0, 30),
    updatedAt: serverTimestamp(),
  };
  try {
    await updateDoc(doc(db, 'landlords', landlord.landlordId), patch);
    if (isValidVaultKeyClient(workspaceSecret)) {
      const wsRef = doc(db, 'landlord_workspaces', workspaceSecret, 'properties', landlord.landlordId);
      const wsSnap = await getDoc(wsRef);
      if (wsSnap.exists()) {
        await updateDoc(wsRef, patch);
      }
    }
    await logActivity({
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
      workspaceSecret,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function replaceLandlordOwner(
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
  },
  associatedTenants: Tenant[]
): Promise<void> {
  const path = `landlords/${oldLandlord.landlordId}`;
  const safeFront = assertSafeImageDataUrl(newOwner.idFrontImage, 350000, true);
  const safeBack = assertSafeImageDataUrl(newOwner.idBackImage, 350000, true);
  try {
    await updateDoc(doc(db, 'landlords', oldLandlord.landlordId), {
      fullName: newOwner.fullName.trim().slice(0, 150),
      phone: normalizePhone(newOwner.phone).slice(0, 30),
      faydaId: newOwner.faydaId.trim().slice(0, 60),
      idFrontImage: safeFront,
      idBackImage: safeBack,
      updatedAt: serverTimestamp(),
    });

    await Promise.all(
      associatedTenants.map((t) =>
        updateDoc(doc(db, 'tenants', t.tenantId), {
          landlordName: newOwner.fullName.trim().slice(0, 150),
          landlordPhone: normalizePhone(newOwner.phone).slice(0, 30),
          updatedAt: serverTimestamp(),
        })
      )
    );

    await logActivity({
      actorUid: actorUid || ADMIN_AUTH_ACCOUNT_KEY,
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
      details: `የንብረት አከራይ ስም ተቀይሯል፦ የቀድሞ አከራይ ${oldLandlord.fullName} (${oldLandlord.phone}, ፋይዳ ${oldLandlord.faydaId}) ወጥቶ በአዲስ አከራይ ${newOwner.fullName} (${newOwner.phone}, ፋይዳ ${newOwner.faydaId}) ተተክቷል።`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function registerTenant(
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
  actorRole: 'admin' | 'police' | 'landlord' = 'landlord',
  workspaceSecret?: string
): Promise<Tenant> {
  const tenantId = createValidId('ten');
  const path = `tenants/${tenantId}`;
  const isPoliceTenant = input.occupation.trim() === 'ፖሊስ' || input.idType === 'police_digital';
  const safeFront = assertSafeImageDataUrl(input.idFrontImage, 350000, true);
  const safeBack = assertSafeImageDataUrl(input.idBackImage, 350000, true);
  const safePortrait = input.portraitImage
    ? assertSafeImageDataUrl(input.portraitImage, 350000, true)
    : '';
  try {
    const payload: Record<string, unknown> = {
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
      idFrontImage: safeFront,
      idBackImage: safeBack,
      moveInDate: input.moveInDate.slice(0, 30),
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (safePortrait) {
      payload.portraitImage = safePortrait;
    }
    if (input.replacedTenant) {
      payload.replacedTenantId = input.replacedTenant.tenantId;
      payload.replacedTenantName = input.replacedTenant.fullName.slice(0, 150);
    }

    await setDoc(doc(db, 'tenants', tenantId), payload);

    if (isValidVaultKeyClient(workspaceSecret)) {
      await setDoc(
        doc(db, 'landlord_workspaces', workspaceSecret, 'tenants', tenantId),
        payload
      );
    }

    if (input.replacedTenant && input.replacedTenant.status === 'active') {
      await updateDoc(doc(db, 'tenants', input.replacedTenant.tenantId), {
        status: 'moved_out',
        updatedAt: serverTimestamp(),
      });
      if (isValidVaultKeyClient(workspaceSecret)) {
        const oldWsRef = doc(
          db,
          'landlord_workspaces',
          workspaceSecret,
          'tenants',
          input.replacedTenant.tenantId
        );
        const oldWsSnap = await getDoc(oldWsRef);
        if (oldWsSnap.exists()) {
          await updateDoc(oldWsRef, {
            status: 'moved_out',
            updatedAt: serverTimestamp(),
          });
        }
      }
    }

    const replacementNote = input.replacedTenant
      ? ` — በቀድሞ ተከራይ ${input.replacedTenant.fullName} ምትክ የገባ`
      : ' — አዲስ ቤት/ክፍል';

    await logActivity({
      actorUid,
      actorRole,
      actorName: landlord.fullName,
      actionType: 'tenant_registered',
      subjectType: 'tenant',
      subjectId: tenantId,
      subjectName: input.fullName,
      subjectPhone: normalizePhone(input.phone),
      subjectIdNumber: input.idNumber,
      city: landlord.city,
      woreda: landlord.woreda,
      kebele: landlord.kebele,
      details: `አዲስ ተከራይ ተመዝግቦ ለፖሊስ ተልኳል፦ ${input.fullName} (${input.occupation}${isPoliceTenant ? ' - የፖሊስ ዲጅታል መታወቂያ' : ''}, ቤት ${landlord.houseNumber}${replacementNote})።`,
      workspaceSecret,
    });
    return payload as unknown as Tenant;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function markTenantMovedOut(
  actorUid: string,
  actorRole: 'admin' | 'police' | 'landlord',
  actorName: string,
  tenant: Tenant,
  workspaceSecret?: string
): Promise<void> {
  const path = `tenants/${tenant.tenantId}`;
  try {
    await updateDoc(doc(db, 'tenants', tenant.tenantId), {
      status: 'moved_out',
      updatedAt: serverTimestamp(),
    });
    if (isValidVaultKeyClient(workspaceSecret)) {
      const wsRef = doc(
        db,
        'landlord_workspaces',
        workspaceSecret,
        'tenants',
        tenant.tenantId
      );
      const wsSnap = await getDoc(wsRef);
      if (wsSnap.exists()) {
        await updateDoc(wsRef, {
          status: 'moved_out',
          updatedAt: serverTimestamp(),
        });
      }
    }
    await logActivity({
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
      details: `ተከራይ ${tenant.fullName} ከአከራይ ${tenant.landlordName} ቤት (${tenant.city}/${tenant.woreda}/${tenant.kebele}) መልቀቁ ተመዝግቧል።`,
      workspaceSecret,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function createWantedPerson(
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
  },
  policeVaultKey = ''
): Promise<WantedPerson> {
  const wantedId = createValidId('want');
  const useVault = isValidVaultKeyClient(policeVaultKey);
  const path = useVault
    ? `police_vaults/${policeVaultKey}/wanted_persons/${wantedId}`
    : `wanted_persons/${wantedId}`;
  const safePhoto = input.photoImage
    ? assertSafeImageDataUrl(input.photoImage, 350000, true)
    : '';
  try {
    const payload: Record<string, unknown> = {
      wantedId,
      fullName: input.fullName.trim().slice(0, 150),
      phone: normalizePhone(input.phone).slice(0, 30),
      faydaId: input.faydaId.trim().slice(0, 60),
      reason: input.reason.trim().slice(0, 1000),
      caseNumber: input.caseNumber.trim().slice(0, 80),
      priority: input.priority,
      status: 'active',
      reportedByName: actorName.slice(0, 150),
      createdByUid: actorUid || ADMIN_AUTH_ACCOUNT_KEY,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (safePhoto) payload.photoImage = safePhoto;
    if (officerId) payload.reportedByOfficerId = officerId;

    if (useVault) {
      await setDoc(
        doc(db, 'police_vaults', policeVaultKey, 'wanted_persons', wantedId),
        payload
      );
    } else {
      await setDoc(doc(db, 'wanted_persons', wantedId), payload);
    }

    await logActivity({
      actorUid: actorUid || ADMIN_AUTH_ACCOUNT_KEY,
      actorRole: 'police',
      actorName,
      actionType: 'wanted_registered',
      subjectType: 'wanted',
      subjectId: wantedId,
      subjectName: input.fullName || input.phone || input.faydaId || 'ፎቶ የተመዘገበ ተፈላጊ',
      subjectPhone: normalizePhone(input.phone),
      subjectIdNumber: input.faydaId,
      city: input.city || 'ቤኒሻንጉል ጉሙዝ',
      woreda: input.woreda || '-',
      kebele: input.kebele || '-',
      details: `በህግ የሚፈለግ ግለሰብ በፖሊስ ምስጢራዊ መዝገብ ውስጥ ተመዝግቧል (መዝገብ ቁጥር ${input.caseNumber})።`,
    });
    return payload as unknown as WantedPerson;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateWantedStatus(
  wantedId: string,
  status: 'active' | 'captured' | 'closed',
  policeVaultKey = ''
): Promise<void> {
  const useVault = isValidVaultKeyClient(policeVaultKey);
  const path = useVault
    ? `police_vaults/${policeVaultKey}/wanted_persons/${wantedId}`
    : `wanted_persons/${wantedId}`;
  try {
    if (useVault) {
      const vaultRef = doc(db, 'police_vaults', policeVaultKey, 'wanted_persons', wantedId);
      const snap = await getDoc(vaultRef);
      if (snap.exists()) {
        await updateDoc(vaultRef, { status, updatedAt: serverTimestamp() });
        return;
      }
    }
    await updateDoc(doc(db, 'wanted_persons', wantedId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteWantedPerson(
  adminUid: string,
  actorName: string,
  wanted: WantedPerson,
  policeVaultKey = ''
): Promise<void> {
  const useVault = isValidVaultKeyClient(policeVaultKey);
  const path = useVault
    ? `police_vaults/${policeVaultKey}/wanted_persons/${wanted.wantedId}`
    : `wanted_persons/${wanted.wantedId}`;
  try {
    if (useVault) {
      await deleteDoc(
        doc(db, 'police_vaults', policeVaultKey, 'wanted_persons', wanted.wantedId)
      ).catch(() => undefined);
    }
    await deleteDoc(doc(db, 'wanted_persons', wanted.wantedId)).catch(() => undefined);
    await logActivity({
      actorUid: adminUid || ADMIN_AUTH_ACCOUNT_KEY,
      actorRole: 'admin',
      actorName,
      actionType: 'record_deleted',
      subjectType: 'wanted',
      subjectId: wanted.wantedId,
      subjectName: wanted.fullName || wanted.caseNumber,
      city: 'ቤኒሻንጉል ጉሙዝ',
      woreda: '-',
      kebele: '-',
      details: `በህግ የሚፈለግ መዝገብ (${wanted.fullName || wanted.caseNumber}) በአድሚን ተሰርዟል።`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function createWantedAlertIfMissing(
  actorUid: string,
  existingAlerts: WantedAlert[],
  wanted: WantedPerson,
  tenant: Tenant,
  matchType: string,
  policeVaultKey = ''
): Promise<void> {
  const alreadyExists = existingAlerts.some(
    (a) => a.wantedId === wanted.wantedId && a.tenantId === tenant.tenantId
  );
  if (alreadyExists) return;

  const alertId = `alt_${wanted.wantedId.slice(0, 16)}_${tenant.tenantId.slice(0, 16)}`;
  const useVault = isValidVaultKeyClient(policeVaultKey);
  const ref = useVault
    ? doc(db, 'police_vaults', policeVaultKey, 'wanted_alerts', alertId)
    : doc(db, 'wanted_alerts', alertId);
  const path = ref.path;
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) return;
    await setDoc(ref, {
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
      createdByUid: actorUid || ADMIN_AUTH_ACCOUNT_KEY,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateAlertStatus(
  alertId: string,
  status: 'unread' | 'acknowledged' | 'resolved',
  policeVaultKey = ''
): Promise<void> {
  const useVault = isValidVaultKeyClient(policeVaultKey);
  const path = useVault
    ? `police_vaults/${policeVaultKey}/wanted_alerts/${alertId}`
    : `wanted_alerts/${alertId}`;
  try {
    if (useVault) {
      const vaultRef = doc(db, 'police_vaults', policeVaultKey, 'wanted_alerts', alertId);
      const snap = await getDoc(vaultRef);
      if (snap.exists()) {
        await updateDoc(vaultRef, { status, updatedAt: serverTimestamp() });
        return;
      }
    }
    await updateDoc(doc(db, 'wanted_alerts', alertId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function createCriminalRecord(
  actorUid: string,
  actorName: string,
  officerId: string | undefined,
  input: {
    personName: string;
    phone?: string;
    faydaId?: string;
    photoImage?: string;
    recordType: 'arrested' | 'suspect' | 'convicted' | 'released';
    offenseTitle: string;
    description: string;
    city: string;
    woreda: string;
    kebele: string;
    stationName: string;
    incidentDate: string;
  },
  policeVaultKey = ''
): Promise<CriminalRecord> {
  const recordId = createValidId('crim');
  const useVault = isValidVaultKeyClient(policeVaultKey);
  const path = useVault
    ? `police_vaults/${policeVaultKey}/criminal_records/${recordId}`
    : `criminal_records/${recordId}`;
  const safePhoto = input.photoImage
    ? assertSafeImageDataUrl(input.photoImage, 350000, true)
    : '';
  try {
    const payload: Record<string, unknown> = {
      recordId,
      personName: input.personName.trim().slice(0, 150),
      recordType: input.recordType,
      offenseTitle: input.offenseTitle.trim().slice(0, 200),
      description: input.description.trim().slice(0, 2000),
      city: input.city.trim().slice(0, 100),
      woreda: input.woreda.trim().slice(0, 100),
      kebele: input.kebele.trim().slice(0, 100),
      stationName: input.stationName.trim().slice(0, 150),
      incidentDate: input.incidentDate.slice(0, 30),
      recordedByName: actorName.slice(0, 150),
      createdByUid: actorUid || ADMIN_AUTH_ACCOUNT_KEY,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (input.phone) payload.phone = normalizePhone(input.phone).slice(0, 30);
    if (input.faydaId) payload.faydaId = input.faydaId.trim().slice(0, 60);
    if (safePhoto) payload.photoImage = safePhoto;
    if (officerId) payload.recordedByOfficerId = officerId;

    if (useVault) {
      await setDoc(
        doc(db, 'police_vaults', policeVaultKey, 'criminal_records', recordId),
        payload
      );
    } else {
      await setDoc(doc(db, 'criminal_records', recordId), payload);
    }

    await logActivity({
      actorUid: actorUid || ADMIN_AUTH_ACCOUNT_KEY,
      actorRole: 'police',
      actorName,
      actionType: 'criminal_record_added',
      subjectType: 'criminal_record',
      subjectId: recordId,
      subjectName: input.personName,
      subjectPhone: input.phone ? normalizePhone(input.phone) : undefined,
      subjectIdNumber: input.faydaId,
      city: input.city,
      woreda: input.woreda,
      kebele: input.kebele,
      details: `የእስር/ወንጀል ሪከርድ ተመዝግቧል (${input.recordType}): ${input.offenseTitle} — ${input.stationName}።`,
    });
    return payload as unknown as CriminalRecord;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateCriminalRecordType(
  recordId: string,
  recordType: 'arrested' | 'suspect' | 'convicted' | 'released',
  policeVaultKey = ''
): Promise<void> {
  const useVault = isValidVaultKeyClient(policeVaultKey);
  const path = useVault
    ? `police_vaults/${policeVaultKey}/criminal_records/${recordId}`
    : `criminal_records/${recordId}`;
  try {
    if (useVault) {
      const vaultRef = doc(db, 'police_vaults', policeVaultKey, 'criminal_records', recordId);
      const snap = await getDoc(vaultRef);
      if (snap.exists()) {
        await updateDoc(vaultRef, { recordType, updatedAt: serverTimestamp() });
        return;
      }
    }
    await updateDoc(doc(db, 'criminal_records', recordId), {
      recordType,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function updateCriminalRecord(
  actorUid: string,
  actorName: string,
  recordId: string,
  updates: {
    personName: string;
    phone?: string;
    faydaId?: string;
    photoImage?: string;
    recordType: 'arrested' | 'suspect' | 'convicted' | 'released';
    offenseTitle: string;
    description: string;
    city: string;
    woreda: string;
    kebele: string;
    stationName: string;
    incidentDate: string;
  },
  policeVaultKey = ''
): Promise<void> {
  const useVault = isValidVaultKeyClient(policeVaultKey);
  const path = useVault
    ? `police_vaults/${policeVaultKey}/criminal_records/${recordId}`
    : `criminal_records/${recordId}`;
  const safePhoto = updates.photoImage
    ? assertSafeImageDataUrl(updates.photoImage, 350000, false)
    : '';
  try {
    const patch: Record<string, unknown> = {
      personName: updates.personName.trim().slice(0, 150),
      phone: updates.phone ? normalizePhone(updates.phone).slice(0, 30) : '',
      faydaId: updates.faydaId ? updates.faydaId.trim().slice(0, 60) : '',
      photoImage: safePhoto,
      recordType: updates.recordType,
      offenseTitle: updates.offenseTitle.trim().slice(0, 200),
      description: updates.description.trim().slice(0, 2000),
      city: updates.city.trim().slice(0, 100),
      woreda: updates.woreda.trim().slice(0, 100),
      kebele: updates.kebele.trim().slice(0, 100),
      stationName: updates.stationName.trim().slice(0, 150),
      incidentDate: updates.incidentDate.slice(0, 30),
      updatedAt: serverTimestamp(),
    };
    let updated = false;
    if (useVault) {
      const vaultRef = doc(db, 'police_vaults', policeVaultKey, 'criminal_records', recordId);
      const snap = await getDoc(vaultRef);
      if (snap.exists()) {
        await updateDoc(vaultRef, patch);
        updated = true;
      }
    }
    if (!updated) {
      await updateDoc(doc(db, 'criminal_records', recordId), patch);
    }

    await logActivity({
      actorUid: actorUid || ADMIN_AUTH_ACCOUNT_KEY,
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
      details: `የወንጀል/ተጠርጣሪ ሪከርድ (${updates.personName} - ${updates.recordType}: ${updates.offenseTitle}) ተስተካክሏል።`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteCriminalRecord(
  adminUid: string,
  actorName: string,
  record: CriminalRecord,
  policeVaultKey = ''
): Promise<void> {
  const useVault = isValidVaultKeyClient(policeVaultKey);
  const path = useVault
    ? `police_vaults/${policeVaultKey}/criminal_records/${record.recordId}`
    : `criminal_records/${record.recordId}`;
  try {
    if (useVault) {
      await deleteDoc(
        doc(db, 'police_vaults', policeVaultKey, 'criminal_records', record.recordId)
      ).catch(() => undefined);
    }
    await deleteDoc(doc(db, 'criminal_records', record.recordId)).catch(() => undefined);
    await logActivity({
      actorUid: adminUid || ADMIN_AUTH_ACCOUNT_KEY,
      actorRole: 'admin',
      actorName,
      actionType: 'record_deleted',
      subjectType: 'criminal_record',
      subjectId: record.recordId,
      subjectName: record.personName,
      city: record.city,
      woreda: record.woreda,
      kebele: record.kebele,
      details: `የወንጀል/ጥርጣሬ ሪከርድ (${record.personName} - ${record.offenseTitle}) በአድሚን ተሰርዟል።`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export function subscribePoliceData(
  onUpdate: (data: {
    officers: PoliceOfficer[];
    landlords: Landlord[];
    tenants: Tenant[];
    wantedPersons: WantedPerson[];
    wantedAlerts: WantedAlert[];
    criminalRecords: CriminalRecord[];
    history: ActivityHistory[];
  }) => void,
  options?: {
    policeVaultKey?: string;
    includeLegacyRootVault?: boolean;
  }
): Unsubscribe {
  const vaultKey = options?.policeVaultKey || '';
  const hasVault = isValidVaultKeyClient(vaultKey);
  const includeLegacy = Boolean(options?.includeLegacyRootVault);

  const state = {
    officers: [] as PoliceOfficer[],
    landlords: [] as Landlord[],
    tenants: [] as Tenant[],
    vaultWanted: [] as WantedPerson[],
    legacyWanted: [] as WantedPerson[],
    vaultAlerts: [] as WantedAlert[],
    legacyAlerts: [] as WantedAlert[],
    vaultCrimes: [] as CriminalRecord[],
    legacyCrimes: [] as CriminalRecord[],
    history: [] as ActivityHistory[],
  };

  const emit = () =>
    onUpdate({
      officers: state.officers,
      landlords: state.landlords,
      tenants: state.tenants,
      wantedPersons: mergeById(state.vaultWanted, state.legacyWanted, (w) => w.wantedId),
      wantedAlerts: mergeById(state.vaultAlerts, state.legacyAlerts, (a) => a.alertId),
      criminalRecords: mergeById(state.vaultCrimes, state.legacyCrimes, (c) => c.recordId),
      history: state.history,
    });

  const unsubs: Unsubscribe[] = [
    onSnapshot(
      query(collection(db, 'police_officers'), limit(1000)),
      (s) => {
        state.officers = s.docs.map((d) => d.data() as PoliceOfficer);
        emit();
      },
      (e) => handleFirestoreError(e, OperationType.LIST, 'police_officers')
    ),
    onSnapshot(
      query(collection(db, 'landlords'), limit(2000)),
      (s) => {
        state.landlords = s.docs.map((d) => d.data() as Landlord);
        emit();
      },
      (e) => handleFirestoreError(e, OperationType.LIST, 'landlords')
    ),
    onSnapshot(
      query(collection(db, 'tenants'), orderBy('createdAt', 'desc'), limit(2000)),
      (s) => {
        state.tenants = s.docs.map((d) => d.data() as Tenant);
        emit();
      },
      (e) => handleFirestoreError(e, OperationType.LIST, 'tenants')
    ),
    onSnapshot(
      query(collection(db, 'activity_history'), orderBy('createdAt', 'desc'), limit(2000)),
      (s) => {
        state.history = s.docs.map((d) => d.data() as ActivityHistory);
        emit();
      },
      (e) => handleFirestoreError(e, OperationType.LIST, 'activity_history')
    ),
  ];

  if (hasVault) {
    unsubs.push(
      onSnapshot(
        query(collection(db, 'police_vaults', vaultKey, 'wanted_persons'), orderBy('createdAt', 'desc')),
        (s) => {
          state.vaultWanted = s.docs.map((d) => d.data() as WantedPerson);
          emit();
        },
        (e) =>
          handleFirestoreError(
            e,
            OperationType.LIST,
            `police_vaults/${vaultKey}/wanted_persons`
          )
      ),
      onSnapshot(
        query(collection(db, 'police_vaults', vaultKey, 'wanted_alerts'), orderBy('createdAt', 'desc')),
        (s) => {
          state.vaultAlerts = s.docs.map((d) => d.data() as WantedAlert);
          emit();
        },
        (e) =>
          handleFirestoreError(
            e,
            OperationType.LIST,
            `police_vaults/${vaultKey}/wanted_alerts`
          )
      ),
      onSnapshot(
        query(
          collection(db, 'police_vaults', vaultKey, 'criminal_records'),
          orderBy('createdAt', 'desc')
        ),
        (s) => {
          state.vaultCrimes = s.docs.map((d) => d.data() as CriminalRecord);
          emit();
        },
        (e) =>
          handleFirestoreError(
            e,
            OperationType.LIST,
            `police_vaults/${vaultKey}/criminal_records`
          )
      )
    );
  }

  if (includeLegacy) {
    unsubs.push(
      onSnapshot(
        query(collection(db, 'wanted_persons'), orderBy('createdAt', 'desc')),
        (s) => {
          state.legacyWanted = s.docs.map((d) => d.data() as WantedPerson);
          emit();
        },
        (e) => handleFirestoreError(e, OperationType.LIST, 'wanted_persons')
      ),
      onSnapshot(
        query(collection(db, 'wanted_alerts'), orderBy('createdAt', 'desc')),
        (s) => {
          state.legacyAlerts = s.docs.map((d) => d.data() as WantedAlert);
          emit();
        },
        (e) => handleFirestoreError(e, OperationType.LIST, 'wanted_alerts')
      ),
      onSnapshot(
        query(collection(db, 'criminal_records'), orderBy('createdAt', 'desc')),
        (s) => {
          state.legacyCrimes = s.docs.map((d) => d.data() as CriminalRecord);
          emit();
        },
        (e) => handleFirestoreError(e, OperationType.LIST, 'criminal_records')
      )
    );
  }

  return () => {
    unsubs.forEach((u) => u());
  };
}

export function subscribeLandlordOwnData(
  ownerUid: string,
  workspaceSecret: string,
  onUpdate: (data: {
    landlords: Landlord[];
    tenants: Tenant[];
    history: ActivityHistory[];
  }) => void
): Unsubscribe {
  const state = {
    landlords: [] as Landlord[],
    tenants: [] as Tenant[],
    history: [] as ActivityHistory[],
  };
  const emit = () => onUpdate({ ...state });

  if (!isValidVaultKeyClient(workspaceSecret)) {
    // Safety guard: never query global collections for landlords without their isolated workspace key
    const unsubs = [
      onSnapshot(
        query(collection(db, 'landlords'), where('ownerUid', '==', ownerUid), limit(500)),
        (s) => {
          state.landlords = s.docs.map((d) => d.data() as Landlord);
          emit();
        },
        (e) => handleFirestoreError(e, OperationType.LIST, 'landlords')
      ),
      onSnapshot(
        query(collection(db, 'tenants'), where('landlordUid', '==', ownerUid), limit(1000)),
        (s) => {
          state.tenants = s.docs.map((d) => d.data() as Tenant);
          emit();
        },
        (e) => handleFirestoreError(e, OperationType.LIST, 'tenants')
      ),
      onSnapshot(
        query(collection(db, 'activity_history'), where('actorUid', '==', ownerUid), limit(1000)),
        (s) => {
          state.history = s.docs.map((d) => d.data() as ActivityHistory);
          emit();
        },
        (e) => handleFirestoreError(e, OperationType.LIST, 'activity_history')
      ),
    ];
    return () => {
      unsubs.forEach((u) => u());
    };
  }

  const unsubs = [
    onSnapshot(
      collection(db, 'landlord_workspaces', workspaceSecret, 'properties'),
      (s) => {
        state.landlords = s.docs
          .map((d) => d.data() as Landlord)
          .filter((l) => l.ownerUid === ownerUid);
        emit();
      },
      (e) =>
        handleFirestoreError(
          e,
          OperationType.LIST,
          `landlord_workspaces/${workspaceSecret}/properties`
        )
    ),
    onSnapshot(
      collection(db, 'landlord_workspaces', workspaceSecret, 'tenants'),
      (s) => {
        state.tenants = s.docs
          .map((d) => d.data() as Tenant)
          .filter((t) => t.landlordUid === ownerUid);
        emit();
      },
      (e) =>
        handleFirestoreError(
          e,
          OperationType.LIST,
          `landlord_workspaces/${workspaceSecret}/tenants`
        )
    ),
    onSnapshot(
      collection(db, 'landlord_workspaces', workspaceSecret, 'history'),
      (s) => {
        state.history = s.docs
          .map((d) => d.data() as ActivityHistory)
          .filter((h) => h.actorUid === ownerUid);
        emit();
      },
      (e) =>
        handleFirestoreError(
          e,
          OperationType.LIST,
          `landlord_workspaces/${workspaceSecret}/history`
        )
    ),
  ];

  return () => {
    unsubs.forEach((u) => u());
  };
}

export type CloudLoginResult =
  | {
      ok: true;
      session: ActivePortalSession;
      uid: string;
    }
  | {
      ok: false;
      reason: 'not_found' | 'invalid_password' | 'suspended';
    };

export async function verifyFirestoreAccountLogin(
  rawIdentifier: string,
  password: string
): Promise<CloudLoginResult> {
  const rawId = rawIdentifier.trim();
  if (!rawId || !password) {
    return { ok: false, reason: 'not_found' };
  }

  // 1. Admin Account Verification (works across every device/browser without Google OAuth)
  try {
    const admRef = doc(db, 'auth_accounts', ADMIN_AUTH_ACCOUNT_KEY);
    const admSnap = await getDoc(admRef);
    if (!admSnap.exists()) {
      if (rawId === 'admin' && password === 'admin') {
        const { policeVaultKey } = await bootstrapAdminAuthAccount('admin', 'admin');
        return {
          ok: true,
          uid: ADMIN_AUTH_ACCOUNT_KEY,
          session: {
            role: 'admin',
            displayName: 'ክልል ዋና አድሚን',
            email: 'admin@begu-rent.local',
            adminUsername: 'admin',
            policeVaultKey,
          },
        };
      }
    } else {
      const admAcc = admSnap.data() as AuthAccount;
      if (rawId === admAcc.username) {
        const passOk = await verifyPassword(password, admAcc.passwordSalt, admAcc.passwordHash);
        if (!passOk) {
          return { ok: false, reason: 'invalid_password' };
        }
        let policeVaultKey = '';
        try {
          const vault = await decryptVaultJson<AdminVaultPayload>(
            admAcc.encryptedVault,
            admAcc.vaultSalt,
            password
          );
          policeVaultKey = vault.policeVaultKey;
        } catch {
          policeVaultKey = generateVaultKey();
        }
        return {
          ok: true,
          uid: admAcc.ownerUid || ADMIN_AUTH_ACCOUNT_KEY,
          session: {
            role: 'admin',
            displayName: 'ክልል ዋና አድሚን',
            email: 'admin@begu-rent.local',
            adminUsername: admAcc.username,
            policeVaultKey,
          },
        };
      }
    }
  } catch {
    // Continue to Officer / Landlord check
  }

  // 2. Police Officer Account Verification (via auth_accounts or legacy police_officers)
  if (FIELD_LIMITS.USERNAME_PATTERN.test(rawId)) {
    const polAuthKey = await getPoliceAccountKey(rawId);
    const polAuthSnap = await getDoc(doc(db, 'auth_accounts', polAuthKey));
    if (polAuthSnap.exists()) {
      const polAcc = polAuthSnap.data() as AuthAccount;
      const passOk = await verifyPassword(password, polAcc.passwordSalt, polAcc.passwordHash);
      if (!passOk) {
        return { ok: false, reason: 'invalid_password' };
      }
      const offSnap = await getDoc(doc(db, 'police_officers', polAcc.targetId));
      if (!offSnap.exists()) {
        return { ok: false, reason: 'not_found' };
      }
      const officer = offSnap.data() as PoliceOfficer;
      if (!officer.active || !polAcc.active) {
        return { ok: false, reason: 'suspended' };
      }
      let policeVaultKey = '';
      try {
        const vault = await decryptVaultJson<PoliceVaultPayload>(
          polAcc.encryptedVault,
          polAcc.vaultSalt,
          password
        );
        policeVaultKey = vault.policeVaultKey;
      } catch {
        policeVaultKey = '';
      }
      return {
        ok: true,
        uid: officer.officerId,
        session: { role: 'police', officer, policeVaultKey },
      };
    }

    // Legacy officer repair check
    const legacyOffSnap = await getDocs(
      query(collection(db, 'police_officers'), where('username', '==', rawId), limit(10))
    );
    if (!legacyOffSnap.empty) {
      const officer = legacyOffSnap.docs[0].data() as PoliceOfficer;
      if (!officer.active) {
        return { ok: false, reason: 'suspended' };
      }
      const passOk = await verifyPassword(password, officer.passwordSalt, officer.passwordHash);
      if (!passOk) {
        return { ok: false, reason: 'invalid_password' };
      }
      return {
        ok: true,
        uid: officer.officerId,
        session: { role: 'police', officer, policeVaultKey: '' },
      };
    }
  }

  // 3. Landlord Account Verification (by Username OR Phone)
  const candidateKeys: string[] = [];
  if (FIELD_LIMITS.USERNAME_PATTERN.test(rawId)) {
    candidateKeys.push(await getLandlordUsernameAccountKey(rawId));
  }
  const normalizedPhone = normalizePhone(rawId);
  if (normalizedPhone && /\d/.test(normalizedPhone)) {
    candidateKeys.push(await getLandlordPhoneAccountKey(normalizedPhone));
  }

  for (const key of candidateKeys) {
    const llAuthSnap = await getDoc(doc(db, 'auth_accounts', key));
    if (!llAuthSnap.exists()) continue;

    const llAcc = llAuthSnap.data() as AuthAccount;
    const passOk = await verifyPassword(password, llAcc.passwordSalt, llAcc.passwordHash);
    if (!passOk) {
      return { ok: false, reason: 'invalid_password' };
    }

    const vault = await decryptVaultJson<LandlordVaultPayload>(
      llAcc.encryptedVault,
      llAcc.vaultSalt,
      password
    );

    let landlordData: Landlord | null = null;
    if (isValidVaultKeyClient(vault.workspaceSecret)) {
      const wsSnap = await getDoc(
        doc(db, 'landlord_workspaces', vault.workspaceSecret, 'properties', vault.landlordId)
      );
      if (wsSnap.exists()) {
        landlordData = wsSnap.data() as Landlord;
      }
    }
    if (!landlordData) {
      const rootSnap = await getDoc(doc(db, 'landlords', vault.landlordId));
      if (rootSnap.exists()) {
        landlordData = rootSnap.data() as Landlord;
        if (isValidVaultKeyClient(vault.workspaceSecret)) {
          await hydrateLandlordWorkspace(vault.ownerUid, vault.workspaceSecret).catch(
            () => undefined
          );
        }
      }
    }
    if (!landlordData) {
      return { ok: false, reason: 'not_found' };
    }
    if (landlordData.status === 'suspended' || !llAcc.active) {
      return { ok: false, reason: 'suspended' };
    }

    return {
      ok: true,
      uid: vault.ownerUid || landlordData.ownerUid,
      session: {
        role: 'landlord',
        landlord: landlordData,
        workspaceSecret: vault.workspaceSecret,
      },
    };
  }

  // Legacy Landlord migration check (for landlords registered in earlier versions before auth_accounts)
  if (normalizedPhone && /\d{6,}/.test(canonicalPhoneDigits(normalizedPhone) || normalizedPhone)) {
    const legacyLlSnap = await getDocs(
      query(collection(db, 'landlords'), where('status', '==', 'active'), limit(1000))
    );
    const matches = legacyLlSnap.docs
      .map((d) => d.data() as Landlord)
      .filter((l) => phonesMatch(l.phone, rawId));

    for (const ll of matches) {
      const passOk = await verifyPassword(password, ll.passwordSalt, ll.passwordHash);
      if (passOk) {
        const workspaceSecret = generateVaultKey();
        await hydrateLandlordWorkspace(ll.ownerUid, workspaceSecret).catch(() => undefined);
        const { vaultSalt, encryptedVault } = await encryptVaultJson(
          {
            ownerUid: ll.ownerUid,
            workspaceSecret,
            landlordId: ll.landlordId,
          } satisfies LandlordVaultPayload,
          password
        );
        const phoneKey = await getLandlordPhoneAccountKey(ll.phone);
        await setDoc(doc(db, 'auth_accounts', phoneKey), {
          accountKey: phoneKey,
          role: 'landlord',
          targetId: ll.landlordId,
          ownerUid: ll.ownerUid,
          username: ll.phone,
          passwordHash: ll.passwordHash,
          passwordSalt: ll.passwordSalt,
          vaultSalt,
          encryptedVault,
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }).catch(() => undefined);

        return {
          ok: true,
          uid: ll.ownerUid,
          session: { role: 'landlord', landlord: ll, workspaceSecret },
        };
      }
    }
    if (matches.length > 0) {
      return { ok: false, reason: 'invalid_password' };
    }
  }

  return { ok: false, reason: 'not_found' };
}

export function checkWantedMatch(wanted: WantedPerson, tenant: Tenant): string | null {
  const wFayda = normalizeText(wanted.faydaId || '');
  const tFayda = normalizeText(tenant.idNumber || '');
  if (wFayda && tFayda && wFayda === tFayda) {
    return 'የፋይዳ/መታወቂያ ቁጥር ተመሳሳይነት';
  }

  if (phonesMatch(wanted.phone || '', tenant.phone || '')) {
    return 'የስልክ ቁጥር ተመሳሳይነት';
  }

  const wName = normalizeText(wanted.fullName || '');
  const tName = normalizeText(tenant.fullName || '');
  if (wName && tName && wName.length >= 4 && (tName === wName || tName.includes(wName) || wName.includes(tName))) {
    return 'የሙሉ ስም ተመሳሳይነት';
  }

  for (const co of tenant.coResidents || []) {
    const cName = normalizeText(co);
    if (wName && cName && wName.length >= 4 && (cName === wName || cName.includes(wName))) {
      return `አብሮ የሚኖር ሰው ስም (${co})`;
    }
  }

  return null;
}

export async function syncFallbackRecordsToCloud(params: {
  uid: string;
  isAdmin: boolean;
  isPolice: boolean;
  policeVaultKey?: string;
}): Promise<{ syncedCount: number }> {
  const store = getFallbackSnapshot();
  if (!store) return { syncedCount: 0 };

  const syncedSet = new Set(store.syncedCloudIds || []);
  const newlySyncedIds: string[] = [];
  let syncedCount = 0;

  if (params.isAdmin) {
    for (const jur of store.jurisdictions) {
      if (jur.createdByUid === 'seed' || syncedSet.has(jur.id)) continue;
      try {
        const ref = doc(db, 'jurisdictions', jur.id);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          await setDoc(ref, {
            id: jur.id,
            region: (jur.region || DEFAULT_REGION_NAME).slice(0, 100),
            zone: (jur.zone || inferZoneForCity(jur.city)).slice(0, 100),
            city: jur.city.slice(0, 100),
            woreda: jur.woreda.slice(0, 100),
            kebele: jur.kebele.slice(0, 100),
            createdByUid: params.uid || ADMIN_AUTH_ACCOUNT_KEY,
            createdAt: serverTimestamp(),
          });
          syncedCount++;
        }
        newlySyncedIds.push(jur.id);
      } catch {
        // Defer retry until valid
      }
    }

    for (const off of store.officers) {
      if (syncedSet.has(off.officerId)) continue;
      if (!FIELD_LIMITS.USERNAME_PATTERN.test(off.username)) continue;
      try {
        const ref = doc(db, 'police_officers', off.officerId);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          const payload: Record<string, unknown> = {
            officerId: off.officerId,
            fullName: off.fullName.slice(0, 150),
            rank: off.rank.slice(0, 80),
            badgeNumber: off.badgeNumber.slice(0, 60),
            phone: off.phone.slice(0, 30),
            username: off.username.slice(0, 60),
            passwordHash: off.passwordHash,
            passwordSalt: off.passwordSalt,
            jurisdictionLevel: off.jurisdictionLevel,
            city: off.city.slice(0, 100),
            woreda: (off.woreda || '').slice(0, 100),
            kebele: (off.kebele || '').slice(0, 100),
            active: Boolean(off.active),
            createdByUid: params.uid || ADMIN_AUTH_ACCOUNT_KEY,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          const cleanEmail = (off.officerEmail || '').trim().toLowerCase();
          if (cleanEmail) {
            payload.officerEmail = cleanEmail.slice(0, 160);
          }
          await setDoc(ref, payload);
          syncedCount++;
        }
        newlySyncedIds.push(off.officerId);
      } catch {
        // Defer retry
      }
    }
  }

  for (const ll of store.landlords) {
    if (syncedSet.has(ll.landlordId)) continue;
    try {
      const ref = doc(db, 'landlords', ll.landlordId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        newlySyncedIds.push(ll.landlordId);
        continue;
      }
      const safeFront = sanitizeImageSrc(ll.idFrontImage);
      const safeBack = sanitizeImageSrc(ll.idBackImage);
      if (!safeFront || !safeBack || safeFront.length > 350000 || safeBack.length > 350000) {
        continue;
      }
      const resolvedOwnerUid =
        ll.ownerUid && FIELD_LIMITS.ID_PATTERN.test(ll.ownerUid)
          ? ll.ownerUid
          : params.uid || createValidId('lluid');

      await setDoc(ref, {
        landlordId: ll.landlordId,
        ownerUid: resolvedOwnerUid,
        fullName: ll.fullName.slice(0, 150),
        phone: ll.phone.slice(0, 30),
        region: (ll.region || DEFAULT_REGION_NAME).slice(0, 100),
        zone: (ll.zone || inferZoneForCity(ll.city)).slice(0, 100),
        city: ll.city.slice(0, 100),
        woreda: ll.woreda.slice(0, 100),
        kebele: ll.kebele.slice(0, 100),
        houseNumber: ll.houseNumber.slice(0, 60),
        roomCount: Math.max(1, Math.min(500, Math.floor(ll.roomCount || 1))),
        faydaId: ll.faydaId.slice(0, 60),
        idFrontImage: safeFront,
        idBackImage: safeBack,
        passwordHash: ll.passwordHash,
        passwordSalt: ll.passwordSalt,
        status: ll.status || 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      newlySyncedIds.push(ll.landlordId);
      syncedCount++;
    } catch {
      // Defer retry
    }
  }

  for (const ten of store.tenants) {
    if (syncedSet.has(ten.tenantId)) continue;
    try {
      const ref = doc(db, 'tenants', ten.tenantId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        newlySyncedIds.push(ten.tenantId);
        continue;
      }
      const llSnap = await getDoc(doc(db, 'landlords', ten.landlordId));
      if (!llSnap.exists()) continue;
      const llOwnerUid = (llSnap.data() as Landlord).ownerUid;

      const safeFront = sanitizeImageSrc(ten.idFrontImage);
      const safeBack = sanitizeImageSrc(ten.idBackImage);
      if (!safeFront || !safeBack || safeFront.length > 350000 || safeBack.length > 350000) {
        continue;
      }
      const payload: Record<string, unknown> = {
        tenantId: ten.tenantId,
        landlordId: ten.landlordId,
        landlordUid: llOwnerUid,
        landlordName: ten.landlordName.slice(0, 150),
        landlordPhone: ten.landlordPhone.slice(0, 30),
        region: (ten.region || DEFAULT_REGION_NAME).slice(0, 100),
        zone: (ten.zone || inferZoneForCity(ten.city)).slice(0, 100),
        city: ten.city.slice(0, 100),
        woreda: ten.woreda.slice(0, 100),
        kebele: ten.kebele.slice(0, 100),
        houseNumber: ten.houseNumber.slice(0, 60),
        roomLabel: (ten.roomLabel || 'ክፍል 1').slice(0, 60),
        fullName: ten.fullName.slice(0, 150),
        phone: ten.phone.slice(0, 30),
        maritalStatus: ten.maritalStatus,
        livingArrangement: ten.livingArrangement,
        coResidents: Array.isArray(ten.coResidents) ? ten.coResidents.slice(0, 20) : [],
        occupation: ten.occupation.slice(0, 120),
        isPoliceTenant: Boolean(ten.isPoliceTenant),
        idType: ten.isPoliceTenant ? 'police_digital' : 'fayda',
        idNumber: ten.idNumber.slice(0, 60),
        idFrontImage: safeFront,
        idBackImage: safeBack,
        moveInDate: ten.moveInDate.slice(0, 30),
        status: ten.status || 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      const safePortrait = ten.portraitImage ? sanitizeImageSrc(ten.portraitImage) : '';
      if (safePortrait && safePortrait.length <= 350000) {
        payload.portraitImage = safePortrait;
      }
      if (ten.replacedTenantId) payload.replacedTenantId = ten.replacedTenantId;
      if (ten.replacedTenantName) payload.replacedTenantName = ten.replacedTenantName.slice(0, 150);

      await setDoc(ref, payload);
      newlySyncedIds.push(ten.tenantId);
      syncedCount++;
    } catch {
      // Defer retry
    }
  }

  const vaultKey = params.policeVaultKey || '';
  if (params.isPolice && isValidVaultKeyClient(vaultKey)) {
    for (const w of store.wantedPersons) {
      if (syncedSet.has(w.wantedId)) continue;
      try {
        const ref = doc(db, 'police_vaults', vaultKey, 'wanted_persons', w.wantedId);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          const payload: Record<string, unknown> = {
            wantedId: w.wantedId,
            fullName: w.fullName.slice(0, 150),
            phone: w.phone.slice(0, 30),
            faydaId: w.faydaId.slice(0, 60),
            reason: w.reason.slice(0, 1000),
            caseNumber: w.caseNumber.slice(0, 80),
            priority: w.priority,
            status: w.status || 'active',
            reportedByName: w.reportedByName.slice(0, 150),
            createdByUid: params.uid || ADMIN_AUTH_ACCOUNT_KEY,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          const safePhoto = w.photoImage ? sanitizeImageSrc(w.photoImage) : '';
          if (safePhoto && safePhoto.length <= 350000) {
            payload.photoImage = safePhoto;
          }
          if (w.reportedByOfficerId) payload.reportedByOfficerId = w.reportedByOfficerId;
          await setDoc(ref, payload);
          syncedCount++;
        }
        newlySyncedIds.push(w.wantedId);
      } catch {
        // Defer retry
      }
    }

    for (const cr of store.criminalRecords) {
      if (syncedSet.has(cr.recordId)) continue;
      try {
        const ref = doc(db, 'police_vaults', vaultKey, 'criminal_records', cr.recordId);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          const payload: Record<string, unknown> = {
            recordId: cr.recordId,
            personName: cr.personName.slice(0, 150),
            recordType: cr.recordType,
            offenseTitle: cr.offenseTitle.slice(0, 200),
            description: cr.description.slice(0, 2000),
            city: cr.city.slice(0, 100),
            woreda: cr.woreda.slice(0, 100),
            kebele: cr.kebele.slice(0, 100),
            stationName: cr.stationName.slice(0, 150),
            incidentDate: cr.incidentDate.slice(0, 30),
            recordedByName: cr.recordedByName.slice(0, 150),
            createdByUid: params.uid || ADMIN_AUTH_ACCOUNT_KEY,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          if (cr.phone) payload.phone = cr.phone.slice(0, 30);
          if (cr.faydaId) payload.faydaId = cr.faydaId.slice(0, 60);
          const safePhoto = cr.photoImage ? sanitizeImageSrc(cr.photoImage) : '';
          if (safePhoto && safePhoto.length <= 350000) {
            payload.photoImage = safePhoto;
          }
          if (cr.recordedByOfficerId) payload.recordedByOfficerId = cr.recordedByOfficerId;
          await setDoc(ref, payload);
          syncedCount++;
        }
        newlySyncedIds.push(cr.recordId);
      } catch {
        // Defer retry
      }
    }
  }

  if (newlySyncedIds.length > 0) {
    await markFallbackIdsSynced(newlySyncedIds);
  }
  return { syncedCount };
}
