import React, { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import {
  ArrowLeft,
  Building2,
  Eye,
  EyeOff,
  Globe,
  Lock,
  Upload,
  UserPlus,
} from 'lucide-react';
import { db, ROOT_ADMIN_EMAIL } from '../firebase';
import type {
  ActivePortalSession,
  BrandingSetting,
  Jurisdiction,
  Landlord,
  PoliceOfficer,
} from '../types';
import {
  compressImageFile,
  normalizePhone,
  sanitizeImageSrc,
  verifyPassword,
} from '../utils/crypto';
import { ensureAdminCredentialsSeeded, registerLandlord } from '../services/firestoreService';
import {
  DEFAULT_ETHIOPIAN_FLAG_PATH,
  DEFAULT_REGIONAL_FLAG_PATH,
  LOGIN_SEA_MOUNTAINS_BG_PATH,
  resolveEthiopianFlagSrc,
  resolveRegionalFlagSrc,
} from '../utils/seedData';
import { BrandingImage } from './BrandingImage';
import { DICT, type Lang } from '../i18n';

const MetallicFlagpole: React.FC<{ side: 'left' | 'right' }> = ({ side }) => {
  const gradId = side === 'left' ? 'chromeMastL' : 'chromeMastR';
  const goldId = side === 'left' ? 'goldFinialL' : 'goldFinialR';
  const darkId = side === 'left' ? 'steelBaseL' : 'steelBaseR';

  return (
    <svg
      viewBox="0 0 40 260"
      aria-hidden="true"
      className="w-6 h-36 sm:w-9 sm:h-60 shrink-0 drop-shadow-[0_4px_10px_rgba(0,0,0,0.65)]"
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#334155" />
          <stop offset="22%" stopColor="#cbd5e1" />
          <stop offset="45%" stopColor="#ffffff" />
          <stop offset="70%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#1e293b" />
        </linearGradient>
        <linearGradient id={goldId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef9c3" />
          <stop offset="38%" stopColor="#facc15" />
          <stop offset="72%" stopColor="#ca8a04" />
          <stop offset="100%" stopColor="#713f12" />
        </linearGradient>
        <linearGradient id={darkId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="50%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
      </defs>

      {/* Mountain-summit rock contact shadow */}
      <ellipse cx="20" cy="252" rx="14" ry="4" fill="#020617" fillOpacity="0.55" />

      {/* Heavy bolted steel anchor pedestal */}
      <path d="M 8 251 L 32 251 L 29 243 L 11 243 Z" fill={`url(#${darkId})`} stroke="#cbd5e1" strokeWidth="0.6" />
      <rect x="13" y="236" width="14" height="7" rx="1.5" fill={`url(#${gradId})`} stroke="#334155" strokeWidth="0.5" />
      <circle cx="12" cy="248" r="1.2" fill="#e2e8f0" />
      <circle cx="28" cy="248" r="1.2" fill="#e2e8f0" />

      {/* Tapered brushed stainless-steel mast */}
      <polygon
        points="17.4,28 22.6,28 24.4,236 15.6,236"
        fill={`url(#${gradId})`}
      />

      {/* Structural steel joint collars */}
      <rect x="16.2" y="166" width="7.6" height="3.2" rx="1" fill={`url(#${darkId})`} />
      <rect x="16.7" y="98" width="6.6" height="3" rx="1" fill={`url(#${darkId})`} />

      {/* Steel rope cleat & braided metallic halyard */}
      <line
        x1={side === 'left' ? 23.2 : 16.8}
        y1="30"
        x2={side === 'left' ? 24.5 : 15.5}
        y2="205"
        stroke="#f1f5f9"
        strokeWidth="1.1"
        strokeDasharray="2 0.6"
        strokeOpacity="0.88"
      />
      <path
        d={side === 'left' ? 'M 22 198 L 28 202 L 22 206' : 'M 18 198 L 12 202 L 18 206'}
        fill="none"
        stroke="#cbd5e1"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Gold pulley truck collar + top clasp rings */}
      <rect x="15.5" y="26" width="9" height="4.5" rx="1.5" fill={`url(#${goldId})`} />
      <circle
        cx={side === 'left' ? 24 : 16}
        cy="39"
        r="2.4"
        fill="none"
        stroke={`url(#${goldId})`}
        strokeWidth="1.4"
      />
      <circle
        cx={side === 'left' ? 24 : 16}
        cy="104"
        r="2.4"
        fill="none"
        stroke={`url(#${goldId})`}
        strokeWidth="1.4"
      />

      {/* Ornate gold spear-and-orb finial at peak */}
      <circle cx="20" cy="19" r="5.5" fill={`url(#${goldId})`} stroke="#fef9c3" strokeWidth="0.6" />
      <polygon points="20,2 23.8,14 16.2,14" fill={`url(#${goldId})`} stroke="#fef08a" strokeWidth="0.5" />
      <circle cx="18.3" cy="17.2" r="1.4" fill="#ffffff" fillOpacity="0.7" />
    </svg>
  );
};

interface LoginPortalProps {
  lang: Lang;
  onToggleLang: () => void;
  firebaseUser: User | null;
  isFirebaseAdmin: boolean;
  isFirebasePolice: boolean;
  branding: BrandingSetting;
  jurisdictions: Jurisdiction[];
  onSignInGoogle: () => Promise<{ ok: boolean; user?: User; error?: string }>;
  onSignOutGoogle: () => Promise<void>;
  onEnterSession: (session: ActivePortalSession) => void;
}

type AuthMode = 'login' | 'register';

export const LoginPortal: React.FC<LoginPortalProps> = ({
  lang,
  onToggleLang,
  firebaseUser,
  isFirebaseAdmin,
  isFirebasePolice,
  branding,
  jurisdictions,
  onSignInGoogle,
  onEnterSession,
}) => {
  const t = DICT[lang];
  const [mode, setMode] = useState<AuthMode>('login');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Unified Single-Row Login State + Brute-Force Protection
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntilMs, setLockoutUntilMs] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (lockoutUntilMs <= Date.now()) return;
    const timer = window.setInterval(() => {
      const cur = Date.now();
      setNowMs(cur);
      if (cur >= lockoutUntilMs) {
        setLockoutUntilMs(0);
        setFailedAttempts(0);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lockoutUntilMs]);

  const remainingLockSeconds =
    lockoutUntilMs > nowMs ? Math.ceil((lockoutUntilMs - nowMs) / 1000) : 0;

  function registerFailedLoginAttempt(baseMsg: string) {
    const next = failedAttempts + 1;
    if (next >= 5) {
      const until = Date.now() + 60_000;
      setFailedAttempts(0);
      setLockoutUntilMs(until);
      setNowMs(Date.now());
      setErrorMsg(
        lang === 'am'
          ? 'ተደጋጋሚ የተሳሳተ ሙከራ ስለተደረገ ለደህንነት ሲባል ለ60 ሰከንድ ታግዷል። እባክዎ ትንሽ ቆይተው ይሞክሩ።'
          : 'Too many failed attempts. Sign-in is locked for 60 seconds for security.'
      );
    } else {
      setFailedAttempts(next);
      setErrorMsg(baseMsg);
    }
  }

  // Landlord Self-Registration State
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regCity, setRegCity] = useState('');
  const [regWoreda, setRegWoreda] = useState('');
  const [regKebele, setRegKebele] = useState('');
  const [regHouseNo, setRegHouseNo] = useState('');
  const [regRoomCount, setRegRoomCount] = useState('1');
  const [regFaydaId, setRegFaydaId] = useState('');
  const [regIdFront, setRegIdFront] = useState('');
  const [regIdBack, setRegIdBack] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');

  const cities = useMemo(
    () => Array.from(new Set(jurisdictions.map((j) => j.city))),
    [jurisdictions]
  );

  const woredas = useMemo(
    () =>
      Array.from(
        new Set(
          jurisdictions
            .filter((j) => !regCity || j.city === regCity)
            .map((j) => j.woreda)
        )
      ),
    [jurisdictions, regCity]
  );

  const kebeles = useMemo(
    () =>
      Array.from(
        new Set(
          jurisdictions
            .filter((j) => (!regCity || j.city === regCity) && (!regWoreda || j.woreda === regWoreda))
            .map((j) => j.kebele)
        )
      ),
    [jurisdictions, regCity, regWoreda]
  );

  async function handleFileSelect(
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (val: string) => void
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg('');
    try {
      const compressed = await compressImageFile(file, 760, 0.68, 250000);
      setter(compressed);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ምስሉን ማስገባት አልተቻለም');
    }
  }

  async function resolveAccountPrivileges(user: User): Promise<{ isAdmin: boolean; isPolice: boolean }> {
    const email = (user.email || '').toLowerCase();
    let isAdmin = isFirebaseAdmin || (user.emailVerified && email === ROOT_ADMIN_EMAIL);
    if (!isAdmin && user.emailVerified) {
      try {
        const adminSnap = await getDoc(doc(db, 'admins', user.uid));
        isAdmin = adminSnap.exists();
      } catch {
        isAdmin = false;
      }
    }
    let isPolice = isAdmin || isFirebasePolice;
    if (!isPolice && user.emailVerified && email) {
      try {
        const polSnap = await getDoc(doc(db, 'police_emails', email));
        isPolice = polSnap.exists();
      } catch {
        isPolice = false;
      }
    }
    return { isAdmin, isPolice };
  }

  async function handleUnifiedLogin(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    if (remainingLockSeconds > 0) {
      setErrorMsg(
        lang === 'am'
          ? `ለደህንነት ሲባል እባክዎ ${remainingLockSeconds} ሰከንድ ይጠብቁ እና እንደገና ይሞክሩ።`
          : `Please wait ${remainingLockSeconds} seconds before trying again.`
      );
      return;
    }
    const rawId = identifier.trim();
    if (!rawId || !password) {
      setErrorMsg(
        lang === 'am'
          ? 'እባክዎ ዩዘርኔም/ስልክ ቁጥር እና የይለፍ ቃል ያስገቡ።'
          : 'Please enter your username or phone number and password.'
      );
      return;
    }

    setBusy(true);
    try {
      let activeUser = firebaseUser;
      if (!activeUser || !activeUser.emailVerified) {
        const res = await onSignInGoogle();
        if (!res.ok || !res.user) {
          setErrorMsg(
            res.error ||
              (lang === 'am'
                ? 'መግባት አልተጠናቀቀም። እባክዎ እንደገና ይሞክሩ።'
                : 'Sign-in was not completed. Please try again.')
          );
          return;
        }
        activeUser = res.user;
      }

      let { isAdmin, isPolice } = await resolveAccountPrivileges(activeUser);

      // 1. Check Admin Credentials (if user has admin privileges)
      if (isAdmin) {
        try {
          const cred = await ensureAdminCredentialsSeeded(activeUser.uid);
          if (rawId === cred.username) {
            const passOk = await verifyPassword(password, cred.passwordSalt, cred.passwordHash);
            if (passOk) {
              setFailedAttempts(0);
              setLockoutUntilMs(0);
              onEnterSession({
                role: 'admin',
                displayName: activeUser.displayName || 'ክልል ዋና አድሚን',
                email: activeUser.email || ROOT_ADMIN_EMAIL,
                adminUsername: cred.username,
              });
              return;
            }
            registerFailedLoginAttempt(
              lang === 'am' ? 'የገባው የይለፍ ቃል ትክክል አይደለም።' : 'Incorrect password.'
            );
            return;
          }
        } catch {
          // Continue to officer/landlord resolution
        }
      }

      // 2. Check Police Officer Credentials (if user has police/admin privileges)
      if (isPolice) {
        const officerSnap = await getDocs(
          query(collection(db, 'police_officers'), where('username', '==', rawId))
        );
        if (!officerSnap.empty) {
          const officer = officerSnap.docs[0].data() as PoliceOfficer;
          if (!officer.active) {
            setErrorMsg(
              lang === 'am'
                ? 'ይህ የፖሊስ መለያ ታግዷል። እባክዎ አድሚንን ያነጋግሩ።'
                : 'This police account is suspended.'
            );
            return;
          }
          const ok = await verifyPassword(password, officer.passwordSalt, officer.passwordHash);
          if (ok) {
            setFailedAttempts(0);
            setLockoutUntilMs(0);
            onEnterSession({ role: 'police', officer });
            return;
          }
          registerFailedLoginAttempt(
            lang === 'am' ? 'የገባው የይለፍ ቃል ትክክል አይደለም።' : 'Incorrect password.'
          );
          return;
        }
      }

      // 3. Check Landlord Credentials (by phone / username)
      const phone = normalizePhone(rawId);
      if (phone) {
        const landlordSnap = await getDocs(
          isPolice
            ? query(collection(db, 'landlords'), where('phone', '==', phone))
            : query(collection(db, 'landlords'), where('ownerUid', '==', activeUser.uid))
        );
        const candidates = landlordSnap.docs
          .map((d) => d.data() as Landlord)
          .filter((l) => normalizePhone(l.phone) === phone && l.status === 'active');

        for (const landlord of candidates) {
          const ok = await verifyPassword(password, landlord.passwordSalt, landlord.passwordHash);
          if (ok) {
            setFailedAttempts(0);
            setLockoutUntilMs(0);
            onEnterSession({ role: 'landlord', landlord });
            return;
          }
        }
        if (candidates.length > 0) {
          registerFailedLoginAttempt(
            lang === 'am'
              ? 'የገባው የይለፍ ቃል ትክክል አይደለም። የይለፍ ቃል ከጠፋብዎ ፖሊስ ወይም አድሚንን ያነጋግሩ።'
              : 'Incorrect password. Please contact Police or Admin if you forgot your password.'
          );
          return;
        }
      }

      // 4. Fallback if someone typed a non-phone username (like 'admin' or police username) under a different browser session
      if (!isAdmin && rawId === 'admin') {
        const reauth = await onSignInGoogle();
        if (reauth.ok && reauth.user) {
          const nextPrivs = await resolveAccountPrivileges(reauth.user);
          isAdmin = nextPrivs.isAdmin;
          isPolice = nextPrivs.isPolice;
          if (isAdmin) {
            const cred = await ensureAdminCredentialsSeeded(reauth.user.uid);
            const passOk = await verifyPassword(password, cred.passwordSalt, cred.passwordHash);
            if (rawId === cred.username && passOk) {
              setFailedAttempts(0);
              setLockoutUntilMs(0);
              onEnterSession({
                role: 'admin',
                displayName: reauth.user.displayName || 'ክልል ዋና አድሚን',
                email: reauth.user.email || ROOT_ADMIN_EMAIL,
                adminUsername: cred.username,
              });
              return;
            }
          }
        }
      }

      registerFailedLoginAttempt(
        lang === 'am'
          ? 'በዚህ ዩዘርኔም ወይም ስልክ ቁጥር የተመዘገበ መለያ አልተገኘም። አዲስ አከራይ ከሆኑ መጀመሪያ ይመዝገቡ።'
          : 'No matching account found. If you are a new landlord, please register first.'
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'መግባት አልተቻለም');
    } finally {
      setBusy(false);
    }
  }

  async function handleLandlordRegister(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (
      !regName.trim() ||
      !regPhone.trim() ||
      !regCity ||
      !regWoreda ||
      !regKebele ||
      !regHouseNo.trim() ||
      !regFaydaId.trim() ||
      !regIdFront ||
      !regIdBack ||
      !regPassword
    ) {
      setErrorMsg(
        lang === 'am'
          ? 'እባክዎ ሁሉንም አስፈላጊ መረጃዎች እና የፋይዳ መታወቂያ የፊትና የኋላ ፎቶዎች ይሙሉ።'
          : 'Please complete all required fields and upload both front and back Fayda ID photos.'
      );
      return;
    }

    if (regPassword.length < 6) {
      setErrorMsg(
        lang === 'am'
          ? 'ለጠንካራ ደህንነት የይለፍ ቃል ቢያንስ 6 ቁምፊ መሆን አለበት።'
          : 'For stronger security, password must be at least 6 characters.'
      );
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setErrorMsg(
        lang === 'am' ? 'የገቡት ሁለቱ የይለፍ ቃሎች አይመሳሰሉም።' : 'Passwords do not match.'
      );
      return;
    }

    setBusy(true);
    try {
      let activeUser = firebaseUser;
      if (!activeUser || !activeUser.emailVerified) {
        const res = await onSignInGoogle();
        if (!res.ok || !res.user) {
          setErrorMsg(
            res.error ||
              (lang === 'am'
                ? 'ምዝገባውን ማጠናቀቅ አልተቻለም። እባክዎ እንደገና ይሞክሩ።'
                : 'Could not complete registration. Please try again.')
          );
          return;
        }
        activeUser = res.user;
      }

      await registerLandlord(activeUser.uid, {
        fullName: regName,
        phone: regPhone,
        city: regCity,
        woreda: regWoreda,
        kebele: regKebele,
        houseNumber: regHouseNo,
        roomCount: Number(regRoomCount) || 1,
        faydaId: regFaydaId,
        idFrontImage: regIdFront,
        idBackImage: regIdBack,
        password: regPassword,
      });
      setIdentifier(regPhone);
      setPassword('');
      setRegName('');
      setRegPhone('');
      setRegHouseNo('');
      setRegFaydaId('');
      setRegIdFront('');
      setRegIdBack('');
      setRegPassword('');
      setRegConfirmPassword('');
      setMode('login');
      setSuccessMsg(
        lang === 'am'
          ? 'የአከራይ ምዝገባዎ በተሳካ ሁኔታ ተጠናቋል። አሁን በስልክ ቁጥርዎና በይለፍ ቃልዎ ሎጊን ብለው ይግቡ።'
          : 'Landlord registration completed. Please sign in using your phone number and password.'
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ምዝገባው አልተሳካም');
    } finally {
      setBusy(false);
    }
  }

  const regionalFlagSrc = resolveRegionalFlagSrc(branding.regionalFlagDataUrl);
  const ethiopianFlagSrc = resolveEthiopianFlagSrc(branding.ethiopianFlagDataUrl);
  const isDefaultEthiopianSvg = ethiopianFlagSrc === DEFAULT_ETHIOPIAN_FLAG_PATH;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-between py-3 px-3 sm:py-6 sm:px-6 relative overflow-hidden">
      {/* FULL-LOGIN SCENIC SEA & MOUNTAIN PEAKS WATERMARK BACKDROP */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none"
      >
        {/* Serene Deep-Blue Sea & Left/Right Mountain Peaks Landscape */}
        <img
          src={LOGIN_SEA_MOUNTAINS_BG_PATH}
          alt=""
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover object-center scale-[1.02]"
        />

        {/* Light atmospheric veil only at extreme edges to keep text legible without hiding the scenery */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/25 via-transparent to-slate-950/40" />

        {/* LEFT MOUNTAIN PEAK BRUSHED-STEEL FLAGPOLE: Benishangul-Gumuz Regional Flag (Main Background Behind Flag) */}
        <div className="absolute left-[2%] sm:left-[9%] top-[4%] sm:top-[6%] flex items-start">
          <MetallicFlagpole side="left" />
          <div className="mt-5 sm:mt-8 -ml-2.5 sm:-ml-3.5 origin-left animate-flag-breeze">
            <BrandingImage
              src={regionalFlagSrc}
              alt="Benishangul-Gumuz Regional Flag"
              className="w-24 h-15 sm:w-44 sm:h-28 object-contain drop-shadow-[0_12px_18px_rgba(0,0,0,0.48)]"
            />
          </div>
        </div>

        {/* RIGHT MOUNTAIN PEAK BRUSHED-STEEL FLAGPOLE: Ethiopian National Flag (Main Background Behind Flag) */}
        <div className="absolute right-[2%] sm:right-[6%] top-[4%] sm:top-[6%] flex flex-row-reverse items-start">
          <MetallicFlagpole side="right" />
          <div className="mt-5 sm:mt-8 -mr-2.5 sm:-mr-3.5 origin-right animate-flag-breeze">
            <BrandingImage
              src={ethiopianFlagSrc}
              alt="Ethiopian National Flag"
              className={`w-24 h-15 sm:w-44 sm:h-28 object-contain drop-shadow-[0_12px_18px_rgba(0,0,0,0.48)] ${
                isDefaultEthiopianSvg ? '-scale-x-100' : ''
              }`}
            />
          </div>
        </div>

        {/* CENTER SEA-FLOATING POLICE LOGO WATERMARK */}
        <div className="absolute inset-0 flex items-center justify-center translate-y-6 sm:translate-y-10">
          <div className="relative flex flex-col items-center animate-sea-float">
            <div className="absolute inset-0 -m-6 sm:-m-10 rounded-full bg-cyan-300/20 blur-2xl" />
            <BrandingImage
              src={branding.logoDataUrl}
              alt=""
              className="relative w-60 h-60 sm:w-[400px] sm:h-[400px] rounded-full object-cover opacity-50 ring-4 ring-amber-200/40 shadow-[0_0_90px_rgba(56,189,248,0.45)]"
            />
            <div className="w-48 sm:w-80 h-5 sm:h-7 mt-3 rounded-full bg-gradient-to-r from-transparent via-cyan-200/40 to-transparent blur-md" />
          </div>
        </div>
      </div>

      <div className="relative z-10 max-w-2xl w-full mx-auto space-y-4 sm:space-y-6 flex-1 flex flex-col justify-between">
        {/* Top Language Switcher */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onToggleLang}
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-lg bg-slate-950/30 hover:bg-slate-950/50 backdrop-blur-[2px] text-amber-200 border border-amber-300/40 text-xs font-semibold transition-colors whitespace-nowrap shadow-sm"
          >
            <Globe className="w-3.5 h-3.5" />
            {t.langToggle}
          </button>
        </div>

        {/* 1. Dynamic Police Logo + 2. Commission Name (Amharic & English) + 3. Large System Title */}
        <section className="bg-transparent text-white px-2 py-2 sm:px-4 sm:py-3 text-center">
          <div className="flex flex-col items-center space-y-2.5 sm:space-y-3">
            <div className="p-1 sm:p-1.5 rounded-full bg-gradient-to-tr from-amber-600 via-amber-300 to-amber-500 shadow-lg">
              <BrandingImage
                src={branding.logoDataUrl}
                alt={branding.commissionName}
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover bg-white/95 p-1"
              />
            </div>

            <div className="space-y-1">
              <h2 className="text-lg sm:text-2xl font-bold tracking-tight text-amber-300 drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)]">
                {branding.commissionName || 'ቤኒሻንጉል ጉሙዝ ፖሊስ ኮሚሽን'}
              </h2>
              <p className="text-[11px] sm:text-sm font-semibold tracking-wider uppercase text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)]">
                {t.commissionEn}
              </p>
            </div>

            <div className="w-28 sm:w-36 h-px bg-gradient-to-r from-transparent via-amber-300/80 to-transparent" />

            <h1 className="text-xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-white drop-shadow-[0_3px_14px_rgba(0,0,0,0.98)] leading-snug text-balance">
              {t.systemTitle}
            </h1>
          </div>
        </section>

        {/* 4. Transparent Login & Register Area (does not cover scenic sea/watermark) */}
        <section className="bg-transparent border border-white/20 rounded-2xl p-4 sm:p-6 space-y-4">
          {errorMsg && (
            <div className="p-3.5 bg-red-950/80 border border-red-400/60 rounded-xl text-sm text-red-100 font-medium shadow-md">
              {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="p-3.5 bg-emerald-950/80 border border-emerald-400/60 rounded-xl text-sm text-emerald-100 font-medium shadow-md">
              {successMsg}
            </div>
          )}

          {/* MODE 1: UNIFIED SINGLE-LINE LOGIN (ADMIN, POLICE, OR REGISTERED LANDLORD) */}
          {mode === 'login' && (
            <form onSubmit={handleUnifiedLogin} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
                <div>
                  <label className="block text-xs font-bold text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.95)] mb-1.5">
                    {t.usernameOrPhoneLabel}
                  </label>
                  <input
                    type="text"
                    required
                    autoComplete="username"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={t.usernameOrPhonePlaceholder}
                    className="w-full px-3.5 py-3 min-h-[44px] border border-white/40 rounded-xl text-sm text-white placeholder:text-slate-200/75 focus:outline-none focus:ring-2 focus:ring-amber-300 bg-slate-950/45 focus:bg-slate-950/65 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.95)] mb-1.5">
                    {t.passwordLabel}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t.passwordPlaceholder}
                      className="w-full pl-3.5 pr-11 py-3 min-h-[44px] border border-white/40 rounded-xl text-sm text-white placeholder:text-slate-200/75 focus:outline-none focus:ring-2 focus:ring-amber-300 bg-slate-950/45 focus:bg-slate-950/65 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label="Toggle password visibility"
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-amber-200 hover:text-white"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={busy || remainingLockSeconds > 0}
                className="w-full py-3.5 px-4 min-h-[48px] bg-gradient-to-r from-slate-900/90 via-blue-950/90 to-slate-900/90 hover:from-slate-800 hover:to-blue-900 border border-amber-300/40 disabled:opacity-60 text-white font-bold text-sm rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <Lock className="w-4 h-4 text-amber-300" />
                {remainingLockSeconds > 0
                  ? (lang === 'am'
                      ? `ተቆልፏል (${remainingLockSeconds} ሰከንድ)`
                      : `Locked (${remainingLockSeconds}s)`)
                  : busy
                    ? t.verifyingButton
                    : t.loginButton}
              </button>

              <div className="pt-1 flex flex-col sm:flex-row items-center justify-center gap-2 text-xs text-white text-center">
                <span className="font-medium drop-shadow-[0_1px_6px_rgba(0,0,0,0.95)]">
                  {t.newLandlordPrompt}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setErrorMsg('');
                  }}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-[40px] rounded-lg bg-amber-400/90 hover:bg-amber-300 border border-amber-200 text-slate-950 font-bold transition-colors w-full sm:w-auto shadow-md"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  {t.registerLink}
                </button>
              </div>
            </form>
          )}

          {/* MODE 2: NEW LANDLORD REGISTRATION */}
          {mode === 'register' && (
            <form onSubmit={handleLandlordRegister} className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/25">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-amber-400/90 text-slate-950 flex items-center justify-center shrink-0 shadow">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.95)]">
                      {t.registerHeading}
                    </h3>
                    <p className="text-xs text-slate-100 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
                      {t.registerSubtitle}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setErrorMsg('');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950/55 hover:bg-slate-950/75 border border-white/30 text-white text-xs font-semibold transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  {t.loginTab}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-white drop-shadow-[0_1px_5px_rgba(0,0,0,0.95)] mb-1">
                    {t.fullNameLabel}
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={150}
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder={lang === 'am' ? 'ስም / የአባት ስም / የአያት ስም' : 'First / Middle / Last Name'}
                    className="w-full px-3 py-2.5 border border-white/40 bg-slate-950/45 text-white placeholder:text-slate-200/75 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-white drop-shadow-[0_1px_5px_rgba(0,0,0,0.95)] mb-1">
                    {t.phoneUsernameLabel}
                  </label>
                  <input
                    type="tel"
                    required
                    maxLength={30}
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="09..."
                    className="w-full px-3 py-2.5 border border-white/40 bg-slate-950/45 text-white placeholder:text-slate-200/75 rounded-xl text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-white drop-shadow-[0_1px_5px_rgba(0,0,0,0.95)] mb-1">
                    {t.cityLabel}
                  </label>
                  <select
                    required
                    value={regCity}
                    onChange={(e) => {
                      setRegCity(e.target.value);
                      setRegWoreda('');
                      setRegKebele('');
                    }}
                    className="w-full px-3 py-2.5 border border-white/40 rounded-xl text-sm bg-slate-950/55 text-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                  >
                    <option value="" className="bg-slate-900 text-white">
                      {t.selectCity}
                    </option>
                    {cities.map((c) => (
                      <option key={c} value={c} className="bg-slate-900 text-white">
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-white drop-shadow-[0_1px_5px_rgba(0,0,0,0.95)] mb-1">
                    {t.woredaLabel}
                  </label>
                  <select
                    required
                    value={regWoreda}
                    onChange={(e) => {
                      setRegWoreda(e.target.value);
                      setRegKebele('');
                    }}
                    className="w-full px-3 py-2.5 border border-white/40 rounded-xl text-sm bg-slate-950/55 text-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                  >
                    <option value="" className="bg-slate-900 text-white">
                      {t.selectWoreda}
                    </option>
                    {woredas.map((w) => (
                      <option key={w} value={w} className="bg-slate-900 text-white">
                        {w}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-white drop-shadow-[0_1px_5px_rgba(0,0,0,0.95)] mb-1">
                    {t.kebeleLabel}
                  </label>
                  <select
                    required
                    value={regKebele}
                    onChange={(e) => setRegKebele(e.target.value)}
                    className="w-full px-3 py-2.5 border border-white/40 rounded-xl text-sm bg-slate-950/55 text-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                  >
                    <option value="" className="bg-slate-900 text-white">
                      {t.selectKebele}
                    </option>
                    {kebeles.map((k) => (
                      <option key={k} value={k} className="bg-slate-900 text-white">
                        {k}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-white drop-shadow-[0_1px_5px_rgba(0,0,0,0.95)] mb-1">
                    {t.houseNoLabel}
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={60}
                    value={regHouseNo}
                    onChange={(e) => setRegHouseNo(e.target.value)}
                    placeholder="104"
                    className="w-full px-3 py-2.5 border border-white/40 bg-slate-950/45 text-white placeholder:text-slate-200/75 rounded-xl text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-white drop-shadow-[0_1px_5px_rgba(0,0,0,0.95)] mb-1">
                    {t.roomCountLabel}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    required
                    value={regRoomCount}
                    onChange={(e) => setRegRoomCount(e.target.value)}
                    className="w-full px-3 py-2.5 border border-white/40 bg-slate-950/45 text-white rounded-xl text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-white drop-shadow-[0_1px_5px_rgba(0,0,0,0.95)] mb-1">
                    {t.faydaIdLabel}
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={60}
                    value={regFaydaId}
                    onChange={(e) => setRegFaydaId(e.target.value)}
                    placeholder="Fayda FIN / FAN"
                    className="w-full px-3 py-2.5 border border-white/40 bg-slate-950/45 text-white placeholder:text-slate-200/75 rounded-xl text-sm font-mono-tabular focus:outline-none focus:ring-2 focus:ring-amber-300"
                  />
                </div>
              </div>

              {/* Fayda Front & Back Uploads */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-white drop-shadow-[0_1px_5px_rgba(0,0,0,0.95)] mb-1.5">
                    {t.faydaFrontLabel}
                  </label>
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-white/45 bg-slate-950/35 rounded-xl p-3 cursor-pointer hover:bg-slate-950/55 transition-colors">
                    {sanitizeImageSrc(regIdFront) ? (
                      <img
                        src={sanitizeImageSrc(regIdFront)}
                        alt="Fayda Front"
                        className="h-24 w-full object-contain rounded"
                      />
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-white py-4">
                        <Upload className="w-4 h-4 text-amber-300" />
                        <span>{t.uploadFront}</span>
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => void handleFileSelect(e, setRegIdFront)}
                    />
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-bold text-white drop-shadow-[0_1px_5px_rgba(0,0,0,0.95)] mb-1.5">
                    {t.faydaBackLabel}
                  </label>
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-white/45 bg-slate-950/35 rounded-xl p-3 cursor-pointer hover:bg-slate-950/55 transition-colors">
                    {sanitizeImageSrc(regIdBack) ? (
                      <img
                        src={sanitizeImageSrc(regIdBack)}
                        alt="Fayda Back"
                        className="h-24 w-full object-contain rounded"
                      />
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-white py-4">
                        <Upload className="w-4 h-4 text-amber-300" />
                        <span>{t.uploadBack}</span>
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => void handleFileSelect(e, setRegIdBack)}
                    />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-white drop-shadow-[0_1px_5px_rgba(0,0,0,0.95)] mb-1">
                    {t.passwordLabel} *
                  </label>
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    minLength={6}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder={lang === 'am' ? 'ቢያንስ 6 ቁምፊ' : 'Min 6 characters'}
                    className="w-full px-3 py-2.5 min-h-[44px] border border-white/40 bg-slate-950/45 text-white placeholder:text-slate-200/75 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-white drop-shadow-[0_1px_5px_rgba(0,0,0,0.95)] mb-1">
                    {t.confirmPasswordLabel}
                  </label>
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    minLength={6}
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    placeholder={lang === 'am' ? 'በድጋሚ ያስገቡ' : 'Re-enter password'}
                    className="w-full px-3 py-2.5 min-h-[44px] border border-white/40 bg-slate-950/45 text-white placeholder:text-slate-200/75 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full py-3.5 px-4 min-h-[48px] bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 disabled:opacity-60 text-slate-950 font-bold text-sm rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <Building2 className="w-4 h-4" />
                {busy ? t.registeringBtn : t.registerSubmitBtn}
              </button>

              <p className="text-xs text-white text-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setErrorMsg('');
                  }}
                  className="text-amber-200 font-bold underline hover:text-white py-1.5 drop-shadow-[0_1px_5px_rgba(0,0,0,0.95)]"
                >
                  {t.backToLogin}
                </button>
              </p>
            </form>
          )}
        </section>

        {/* 5. Motto & 6. Attribution Footer (transparent so lower sea remains clear) */}
        <footer className="bg-transparent px-4 py-2 sm:px-6 sm:py-3 text-center space-y-1.5">
          <p className="text-base sm:text-2xl font-bold tracking-wide text-amber-300 drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)]">
            {t.motto}
          </p>
          <p className="text-xs sm:text-sm font-semibold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)]">
            {t.footerAttribution}
          </p>
        </footer>
      </div>
    </div>
  );
};
