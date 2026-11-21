import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  ActivityActionType,
  ActivityHistory,
  AdminCredential,
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
  createValidId,
  generateSalt,
  hashPassword,
  normalizePhone,
  normalizeText,
  verifyPassword,
} from '../utils/crypto';
import {
  DEFAULT_COMMISSION_NAME,
  DEFAULT_COMMISSION_SUBTITLE,
  DEFAULT_JURISDICTIONS,
  DEFAULT_LOGO_PATH,
} from '../utils/seedData';

export function subscribeBranding(
  onData: (branding: BrandingSetting) => void
): Unsubscribe {
  const path = 'system_settings/branding';
  return onSnapshot(
    doc(db, 'system_settings', 'branding'),
    (snap) => {
      if (snap.exists()) {
        onData(snap.data() as BrandingSetting);
      } else {
        onData({
          commissionName: DEFAULT_COMMISSION_NAME,
          subtitle: DEFAULT_COMMISSION_SUBTITLE,
          logoDataUrl: DEFAULT_LOGO_PATH,
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
  payload: { commissionName: string; subtitle: string; logoDataUrl: string }
): Promise<void> {
  const path = 'system_settings/branding';
  try {
    const ref = doc(db, 'system_settings', 'branding');
    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      await updateDoc(ref, {
        commissionName: payload.commissionName.slice(0, 200),
        subtitle: payload.subtitle.slice(0, 200),
        logoDataUrl: payload.logoDataUrl.slice(0, 450000),
        updatedByUid: uid,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        commissionName: payload.commissionName.slice(0, 200),
        subtitle: payload.subtitle.slice(0, 200),
        logoDataUrl: payload.logoDataUrl.slice(0, 450000),
        updatedByUid: uid,
        updatedAt: serverTimestamp(),
      });
    }
    await logActivity({
      actorUid: uid,
      actorRole: 'admin',
      actorName: 'ክልል ዋና አድሚን',
      actionType: 'logo_updated',
      subjectType: 'system',
      subjectId: 'branding',
      subjectName: payload.commissionName,
      city: 'ቤኒሻንጉል ጉሙዝ',
      woreda: 'ክልል',
      kebele: 'ዋና ጽ/ቤት',
      details: 'የፖሊስ ኮሚሽን ሎጎ እና መጠሪያ ተዘምኗል።',
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

const ADMIN_CRED_DOC_ID = 'primary';

export async function ensureAdminCredentialsSeeded(adminUid: string): Promise<AdminCredential> {
  const path = `admin_credentials/${ADMIN_CRED_DOC_ID}`;
  try {
    const ref = doc(db, 'admin_credentials', ADMIN_CRED_DOC_ID);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data() as AdminCredential;
    }
    const salt = generateSalt();
    const initialSecret = 'admin';
    const passwordHash = await hashPassword(initialSecret, salt);
    const payload: Record<string, unknown> = {
      credId: ADMIN_CRED_DOC_ID,
      username: 'admin',
      passwordHash,
      passwordSalt: salt,
      isDefaultPassword: true,
      updatedByUid: adminUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, payload);
    const freshSnap = await getDoc(ref);
    return (freshSnap.exists() ? freshSnap.data() : payload) as AdminCredential;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export function subscribeAdminCredentials(
  onData: (cred: AdminCredential | null) => void
): Unsubscribe {
  const path = `admin_credentials/${ADMIN_CRED_DOC_ID}`;
  return onSnapshot(
    doc(db, 'admin_credentials', ADMIN_CRED_DOC_ID),
    (snap) => {
      onData(snap.exists() ? (snap.data() as AdminCredential) : null);
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
}): Promise<{ username: string }> {
  const path = `admin_credentials/${ADMIN_CRED_DOC_ID}`;
  const cleanUsername = params.newUsername.trim().slice(0, 60);
  if (!cleanUsername || !FIELD_LIMITS.USERNAME_PATTERN.test(cleanUsername)) {
    throw new Error('ዩዘርኔም የእንግሊዝኛ ፊደላት፣ ቁጥሮች ወይም (._-) ብቻ መያዝ አለበት።');
  }

  const existingCred = await ensureAdminCredentialsSeeded(params.adminUid);
  const currentOk = await verifyPassword(
    params.currentPassword,
    existingCred.passwordSalt,
    existingCred.passwordHash
  );
  if (!currentOk) {
    throw new Error('የገባው የአሁኑ የይለፍ ቃል ትክክል አይደለም።');
  }

  let nextSalt = existingCred.passwordSalt;
  let nextHash = existingCred.passwordHash;
  if (params.newPassword && params.newPassword.length > 0) {
    if (params.newPassword.length < 4) {
      throw new Error('አዲሱ የይለፍ ቃል ቢያንስ 4 ቁምፊ መሆን አለበት።');
    }
    nextSalt = generateSalt();
    nextHash = await hashPassword(params.newPassword, nextSalt);
  }

  try {
    await updateDoc(doc(db, 'admin_credentials', ADMIN_CRED_DOC_ID), {
      username: cleanUsername,
      passwordHash: nextHash,
      passwordSalt: nextSalt,
      isDefaultPassword: false,
      updatedByUid: params.adminUid,
      updatedAt: serverTimestamp(),
    });
    await logActivity({
      actorUid: params.adminUid,
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
    collection(db, 'jurisdictions'),
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
        const list = snap.docs.map((d) => d.data() as Jurisdiction);
        onData(list);
      }
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export async function seedDefaultJurisdictionsIfEmpty(uid: string): Promise<void> {
  const path = 'jurisdictions';
  try {
    const snap = await getDocs(collection(db, 'jurisdictions'));
    if (!snap.empty) return;
    await Promise.all(
      DEFAULT_JURISDICTIONS.map((j) =>
        setDoc(doc(db, 'jurisdictions', j.id), {
          id: j.id,
          city: j.city,
          woreda: j.woreda,
          kebele: j.kebele,
          createdByUid: uid,
          createdAt: serverTimestamp(),
        })
      )
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function addJurisdiction(
  uid: string,
  city: string,
  woreda: string,
  kebele: string
): Promise<void> {
  const id = createValidId('jur');
  const path = `jurisdictions/${id}`;
  try {
    await setDoc(doc(db, 'jurisdictions', id), {
      id,
      city: city.trim().slice(0, 100),
      woreda: woreda.trim().slice(0, 100),
      kebele: kebele.trim().slice(0, 100),
      createdByUid: uid,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
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
  }
): Promise<PoliceOfficer> {
  const officerId = createValidId('off');
  const salt = generateSalt();
  const passwordHash = await hashPassword(input.password, salt);
  const path = `police_officers/${officerId}`;
  try {
    const docData: Record<string, unknown> = {
      officerId,
      fullName: input.fullName.trim().slice(0, 150),
      rank: input.rank.trim().slice(0, 80),
      badgeNumber: input.badgeNumber.trim().slice(0, 60),
      phone: normalizePhone(input.phone).slice(0, 30),
      username: input.username.trim().slice(0, 60),
      passwordHash,
      passwordSalt: salt,
      jurisdictionLevel: input.jurisdictionLevel,
      city: input.city.trim().slice(0, 100),
      woreda: (input.woreda || '').trim().slice(0, 100),
      kebele: (input.kebele || '').trim().slice(0, 100),
      active: true,
      createdByUid: adminUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const cleanEmail = (input.officerEmail || '').trim().toLowerCase();
    if (cleanEmail) {
      docData.officerEmail = cleanEmail.slice(0, 160);
      await setDoc(doc(db, 'police_emails', cleanEmail), {
        email: cleanEmail,
        officerId,
        active: true,
        createdByUid: adminUid,
        createdAt: serverTimestamp(),
      });
    }
    await setDoc(doc(db, 'police_officers', officerId), docData);
    await logActivity({
      actorUid: adminUid,
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
      details: `አዲስ የፖሊስ መኮንን መለያ (${input.username}) ለ ${input.city} ${input.woreda} ${input.kebele} ተከፍቷል።`,
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
  }
): Promise<void> {
  const cleanUsername = updates.newUsername.trim().slice(0, 60);
  if (!cleanUsername || !FIELD_LIMITS.USERNAME_PATTERN.test(cleanUsername)) {
    throw new Error('ዩዘርኔም የእንግሊዝኛ ፊደላት፣ ቁጥሮች ወይም (._-) ብቻ መያዝ አለበት።');
  }
  const path = `police_officers/${officer.officerId}`;
  try {
    const patch: Record<string, unknown> = {
      username: cleanUsername,
      active: typeof updates.active === 'boolean' ? updates.active : officer.active,
      updatedAt: serverTimestamp(),
    };
    if (updates.newPassword && updates.newPassword.length > 0) {
      if (updates.newPassword.length < 4) {
        throw new Error('አዲሱ የይለፍ ቃል ቢያንስ 4 ቁምፊ መሆን አለበት።');
      }
      const salt = generateSalt();
      patch.passwordSalt = salt;
      patch.passwordHash = await hashPassword(updates.newPassword, salt);
    }
    await updateDoc(doc(db, 'police_officers', officer.officerId), patch);
    await logActivity({
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
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
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
    if (updates.newPassword && updates.newPassword.length > 0) {
      if (updates.newPassword.length < 4) {
        throw new Error('አዲሱ የይለፍ ቃል ቢያንስ 4 ቁምፊ መሆን አለበት።');
      }
      const salt = generateSalt();
      patch.passwordSalt = salt;
      patch.passwordHash = await hashPassword(updates.newPassword, salt);
    }
    await updateDoc(doc(db, 'landlords', landlord.landlordId), patch);
    await logActivity({
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
    await deleteDoc(doc(db, 'police_officers', officer.officerId));
    await logActivity({
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
    await deleteDoc(doc(db, 'landlords', landlord.landlordId));
    await logActivity({
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
  const landlordId = createValidId('ll');
  const salt = generateSalt();
  const passwordHash = await hashPassword(input.password, salt);
  const path = `landlords/${landlordId}`;
  try {
    const payload = {
      landlordId,
      ownerUid,
      fullName: input.fullName.trim().slice(0, 150),
      phone: normalizePhone(input.phone).slice(0, 30),
      city: input.city.trim().slice(0, 100),
      woreda: input.woreda.trim().slice(0, 100),
      kebele: input.kebele.trim().slice(0, 100),
      houseNumber: input.houseNumber.trim().slice(0, 60),
      roomCount: Math.max(1, Math.min(500, Math.floor(input.roomCount))),
      faydaId: input.faydaId.trim().slice(0, 60),
      idFrontImage: input.idFrontImage.slice(0, 350000),
      idBackImage: input.idBackImage.slice(0, 350000),
      passwordHash,
      passwordSalt: salt,
      status: 'active' as const,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'landlords', landlordId), payload);
    await logActivity({
      actorUid: ownerUid,
      actorRole,
      actorName: actorName || input.fullName,
      actionType: 'landlord_registered',
      subjectType: 'landlord',
      subjectId: landlordId,
      subjectName: input.fullName,
      subjectPhone: payload.phone,
      subjectIdNumber: payload.faydaId,
      city: payload.city,
      woreda: payload.woreda,
      kebele: payload.kebele,
      details: `አዲስ አከራይ ተመዝግቧል — ${payload.roomCount} ክፍሎች፣ የቤት ቁጥር ${payload.houseNumber} (${payload.city}, ${payload.woreda}, ${payload.kebele})።`,
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
    city: string;
    woreda: string;
    kebele: string;
    houseNumber: string;
    roomCount: number;
    phone: string;
  }
): Promise<void> {
  const path = `landlords/${landlord.landlordId}`;
  try {
    await updateDoc(doc(db, 'landlords', landlord.landlordId), {
      city: updates.city.trim().slice(0, 100),
      woreda: updates.woreda.trim().slice(0, 100),
      kebele: updates.kebele.trim().slice(0, 100),
      houseNumber: updates.houseNumber.trim().slice(0, 60),
      roomCount: Math.max(1, Math.min(500, Math.floor(updates.roomCount))),
      phone: normalizePhone(updates.phone).slice(0, 30),
      updatedAt: serverTimestamp(),
    });
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
  try {
    await updateDoc(doc(db, 'landlords', oldLandlord.landlordId), {
      fullName: newOwner.fullName.trim().slice(0, 150),
      phone: normalizePhone(newOwner.phone).slice(0, 30),
      faydaId: newOwner.faydaId.trim().slice(0, 60),
      idFrontImage: newOwner.idFrontImage.slice(0, 350000),
      idBackImage: newOwner.idBackImage.slice(0, 350000),
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
  actorRole: 'admin' | 'police' | 'landlord' = 'landlord'
): Promise<Tenant> {
  const tenantId = createValidId('ten');
  const path = `tenants/${tenantId}`;
  const isPoliceTenant = input.occupation.trim() === 'ፖሊስ' || input.idType === 'police_digital';
  try {
    const payload: Record<string, unknown> = {
      tenantId,
      landlordId: landlord.landlordId,
      landlordUid: landlord.ownerUid,
      landlordName: landlord.fullName.slice(0, 150),
      landlordPhone: landlord.phone.slice(0, 30),
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
      idFrontImage: input.idFrontImage.slice(0, 350000),
      idBackImage: input.idBackImage.slice(0, 350000),
      moveInDate: input.moveInDate.slice(0, 30),
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (input.portraitImage) {
      payload.portraitImage = input.portraitImage.slice(0, 350000);
    }
    if (input.replacedTenant) {
      payload.replacedTenantId = input.replacedTenant.tenantId;
      payload.replacedTenantName = input.replacedTenant.fullName.slice(0, 150);
    }

    await setDoc(doc(db, 'tenants', tenantId), payload);

    if (input.replacedTenant && input.replacedTenant.status === 'active') {
      await updateDoc(doc(db, 'tenants', input.replacedTenant.tenantId), {
        status: 'moved_out',
        updatedAt: serverTimestamp(),
      });
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
  tenant: Tenant
): Promise<void> {
  const path = `tenants/${tenant.tenantId}`;
  try {
    await updateDoc(doc(db, 'tenants', tenant.tenantId), {
      status: 'moved_out',
      updatedAt: serverTimestamp(),
    });
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
  }
): Promise<WantedPerson> {
  const wantedId = createValidId('want');
  const path = `wanted_persons/${wantedId}`;
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
      createdByUid: actorUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (input.photoImage) payload.photoImage = input.photoImage.slice(0, 350000);
    if (officerId) payload.reportedByOfficerId = officerId;

    await setDoc(doc(db, 'wanted_persons', wantedId), payload);
    await logActivity({
      actorUid,
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
  status: 'active' | 'captured' | 'closed'
): Promise<void> {
  const path = `wanted_persons/${wantedId}`;
  try {
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
  wanted: WantedPerson
): Promise<void> {
  const path = `wanted_persons/${wanted.wantedId}`;
  try {
    await deleteDoc(doc(db, 'wanted_persons', wanted.wantedId));
    await logActivity({
      actorUid: adminUid,
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
  matchType: string
): Promise<void> {
  const alreadyExists = existingAlerts.some(
    (a) => a.wantedId === wanted.wantedId && a.tenantId === tenant.tenantId
  );
  if (alreadyExists) return;

  const alertId = `alt_${wanted.wantedId.slice(0, 16)}_${tenant.tenantId.slice(0, 16)}`;
  const path = `wanted_alerts/${alertId}`;
  try {
    const snap = await getDoc(doc(db, 'wanted_alerts', alertId));
    if (snap.exists()) return;
    await setDoc(doc(db, 'wanted_alerts', alertId), {
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
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateAlertStatus(
  alertId: string,
  status: 'unread' | 'acknowledged' | 'resolved'
): Promise<void> {
  const path = `wanted_alerts/${alertId}`;
  try {
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
  }
): Promise<CriminalRecord> {
  const recordId = createValidId('crim');
  const path = `criminal_records/${recordId}`;
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
      createdByUid: actorUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (input.phone) payload.phone = normalizePhone(input.phone).slice(0, 30);
    if (input.faydaId) payload.faydaId = input.faydaId.trim().slice(0, 60);
    if (input.photoImage) payload.photoImage = input.photoImage.slice(0, 350000);
    if (officerId) payload.recordedByOfficerId = officerId;

    await setDoc(doc(db, 'criminal_records', recordId), payload);
    await logActivity({
      actorUid,
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
  recordType: 'arrested' | 'suspect' | 'convicted' | 'released'
): Promise<void> {
  const path = `criminal_records/${recordId}`;
  try {
    await updateDoc(doc(db, 'criminal_records', recordId), {
      recordType,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteCriminalRecord(
  adminUid: string,
  actorName: string,
  record: CriminalRecord
): Promise<void> {
  const path = `criminal_records/${record.recordId}`;
  try {
    await deleteDoc(doc(db, 'criminal_records', record.recordId));
    await logActivity({
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
  }) => void
): Unsubscribe {
  const state = {
    officers: [] as PoliceOfficer[],
    landlords: [] as Landlord[],
    tenants: [] as Tenant[],
    wantedPersons: [] as WantedPerson[],
    wantedAlerts: [] as WantedAlert[],
    criminalRecords: [] as CriminalRecord[],
    history: [] as ActivityHistory[],
  };

  const emit = () => onUpdate({ ...state });

  const unsubs = [
    onSnapshot(
      collection(db, 'police_officers'),
      (s) => {
        state.officers = s.docs.map((d) => d.data() as PoliceOfficer);
        emit();
      },
      (e) => handleFirestoreError(e, OperationType.LIST, 'police_officers')
    ),
    onSnapshot(
      collection(db, 'landlords'),
      (s) => {
        state.landlords = s.docs.map((d) => d.data() as Landlord);
        emit();
      },
      (e) => handleFirestoreError(e, OperationType.LIST, 'landlords')
    ),
    onSnapshot(
      query(collection(db, 'tenants'), orderBy('createdAt', 'desc')),
      (s) => {
        state.tenants = s.docs.map((d) => d.data() as Tenant);
        emit();
      },
      (e) => handleFirestoreError(e, OperationType.LIST, 'tenants')
    ),
    onSnapshot(
      query(collection(db, 'wanted_persons'), orderBy('createdAt', 'desc')),
      (s) => {
        state.wantedPersons = s.docs.map((d) => d.data() as WantedPerson);
        emit();
      },
      (e) => handleFirestoreError(e, OperationType.LIST, 'wanted_persons')
    ),
    onSnapshot(
      query(collection(db, 'wanted_alerts'), orderBy('createdAt', 'desc')),
      (s) => {
        state.wantedAlerts = s.docs.map((d) => d.data() as WantedAlert);
        emit();
      },
      (e) => handleFirestoreError(e, OperationType.LIST, 'wanted_alerts')
    ),
    onSnapshot(
      query(collection(db, 'criminal_records'), orderBy('createdAt', 'desc')),
      (s) => {
        state.criminalRecords = s.docs.map((d) => d.data() as CriminalRecord);
        emit();
      },
      (e) => handleFirestoreError(e, OperationType.LIST, 'criminal_records')
    ),
    onSnapshot(
      query(collection(db, 'activity_history'), orderBy('createdAt', 'desc')),
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

export function subscribeLandlordOwnData(
  ownerUid: string,
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

  const unsubs = [
    onSnapshot(
      query(collection(db, 'landlords'), where('ownerUid', '==', ownerUid)),
      (s) => {
        state.landlords = s.docs.map((d) => d.data() as Landlord);
        emit();
      },
      (e) => handleFirestoreError(e, OperationType.LIST, 'landlords')
    ),
    onSnapshot(
      query(collection(db, 'tenants'), where('landlordUid', '==', ownerUid)),
      (s) => {
        state.tenants = s.docs.map((d) => d.data() as Tenant);
        emit();
      },
      (e) => handleFirestoreError(e, OperationType.LIST, 'tenants')
    ),
    onSnapshot(
      query(collection(db, 'activity_history'), where('actorUid', '==', ownerUid)),
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

export function checkWantedMatch(wanted: WantedPerson, tenant: Tenant): string | null {
  const wFayda = normalizeText(wanted.faydaId || '');
  const tFayda = normalizeText(tenant.idNumber || '');
  if (wFayda && tFayda && wFayda === tFayda) {
    return 'የፋይዳ/መታወቂያ ቁጥር ተመሳሳይነት';
  }

  const wPhone = normalizePhone(wanted.phone || '');
  const tPhone = normalizePhone(tenant.phone || '');
  if (wPhone && tPhone && wPhone.length >= 9 && wPhone === tPhone) {
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
