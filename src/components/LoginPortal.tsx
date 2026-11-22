import React, { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowLeft,
  Building2,
  Eye,
  EyeOff,
  Globe,
  Lock,
  UserPlus,
} from 'lucide-react';
import type {
  ActivePortalSession,
  BrandingSetting,
  Jurisdiction,
} from '../types';
import {
  registerLandlord,
  verifyFirestoreAccountLogin,
} from '../services/firestoreService';
import { registerFallbackLandlord, verifyFallbackLogin } from '../utils/localFallback';
import {
  DEFAULT_REGION_NAME,
  LOGIN_SEA_MOUNTAINS_BG_PATH,
  inferZoneForCity,
  resolveEthiopianFlagSrc,
  resolveRegionalFlagSrc,
} from '../utils/seedData';
import { BrandingImage } from './BrandingImage';
import { SmartPhotoInput } from './SmartPhotoInput';
import { DICT, type Lang } from '../i18n';

const MetallicFlagpole: React.FC<{ idPrefix: string; flipHalyard?: boolean }> = ({
  idPrefix,
  flipHalyard = false,
}) => {
  const gradId = `chromeMast_${idPrefix}`;
  const goldId = `goldFinial_${idPrefix}`;
  const darkId = `steelBase_${idPrefix}`;
  const waterId = `seaRipple_${idPrefix}`;

  return (
    <svg
      viewBox="0 0 72 520"
      aria-hidden="true"
      className="w-10 h-60 sm:w-14 sm:h-[420px] md:h-[490px] shrink-0 drop-shadow-[0_8px_16px_rgba(0,0,0,0.8)]"
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="20%" stopColor="#cbd5e1" />
          <stop offset="45%" stopColor="#ffffff" />
          <stop offset="72%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
        <linearGradient id={goldId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef9c3" />
          <stop offset="38%" stopColor="#facc15" />
          <stop offset="72%" stopColor="#ca8a04" />
          <stop offset="100%" stopColor="#713f12" />
        </linearGradient>
        <linearGradient id={darkId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#0f172a" />
          <stop offset="50%" stopColor="#64748b" />
          <stop offset="100%" stopColor="#020617" />
        </linearGradient>
        <radialGradient id={waterId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.65" />
          <stop offset="60%" stopColor="#0284c7" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#0369a1" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Concentric Ocean / Sea Surface Ripples around the underwater steel foundation */}
      <ellipse cx="36" cy="498" rx="34" ry="12" fill={`url(#${waterId})`} />
      <ellipse
        cx="36"
        cy="498"
        rx="29"
        ry="9"
        fill="none"
        stroke="#7dd3fc"
        strokeWidth="1.2"
        strokeOpacity="0.55"
      />
      <ellipse
        cx="36"
        cy="498"
        rx="20"
        ry="5.5"
        fill="none"
        stroke="#bae6fd"
        strokeWidth="1.4"
        strokeOpacity="0.7"
      />

      {/* Heavy Marine Steel Pier Base rising directly out of the sea */}
      <path
        d="M 18 498 L 54 498 L 49 480 L 23 480 Z"
        fill={`url(#${darkId})`}
        stroke="#94a3b8"
        strokeWidth="0.9"
      />
      <rect
        x="24.5"
        y="466"
        width="23"
        height="14"
        rx="2"
        fill={`url(#${gradId})`}
        stroke="#334155"
        strokeWidth="0.8"
      />
      <circle cx="25.5" cy="489" r="1.8" fill="#cbd5e1" />
      <circle cx="36" cy="489" r="1.8" fill="#cbd5e1" />
      <circle cx="46.5" cy="489" r="1.8" fill="#cbd5e1" />

      {/* Tall Heavy-Gauge Brushed Stainless Steel Mast */}
      <polygon points="31.5,38 40.5,38 44,466 28,466" fill={`url(#${gradId})`} />

      {/* Reinforced Structural Steel Flange Collars along the tall pole */}
      <rect x="28.5" y="362" width="15" height="5" rx="1.5" fill={`url(#${darkId})`} stroke="#94a3b8" strokeWidth="0.4" />
      <rect x="29.5" y="255" width="13" height="5" rx="1.5" fill={`url(#${darkId})`} stroke="#94a3b8" strokeWidth="0.4" />
      <rect x="30.2" y="148" width="11.6" height="4.5" rx="1.5" fill={`url(#${darkId})`} stroke="#94a3b8" strokeWidth="0.4" />

      {/* Metallic Halyard Cable + Marine Cleat */}
      <line
        x1={flipHalyard ? 28.5 : 43.5}
        y1="42"
        x2={flipHalyard ? 26.5 : 45.5}
        y2="425"
        stroke="#e2e8f0"
        strokeWidth="1.3"
        strokeDasharray="3 1"
        strokeOpacity="0.92"
      />
      <path
        d={flipHalyard ? 'M 30 416 L 21 422 L 30 428' : 'M 42 416 L 51 422 L 42 428'}
        fill="none"
        stroke="#cbd5e1"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Gold Pulley Crown & Flag Hoist Rings */}
      <rect x="29.5" y="34" width="13" height="6" rx="2" fill={`url(#${goldId})`} />
      <circle
        cx={flipHalyard ? 28.5 : 43.5}
        cy="54"
        r="3"
        fill="none"
        stroke={`url(#${goldId})`}
        strokeWidth="1.6"
      />
      <circle
        cx={flipHalyard ? 28.5 : 43.5}
        cy="176"
        r="3"
        fill="none"
        stroke={`url(#${goldId})`}
        strokeWidth="1.6"
      />

      {/* Ornate Gold Orb & Spear Finial at Summit */}
      <circle
        cx="36"
        cy="25"
        r="7.2"
        fill={`url(#${goldId})`}
        stroke="#fef9c3"
        strokeWidth="0.8"
      />
      <polygon
        points="36,3 41.5,18.5 30.5,18.5"
        fill={`url(#${goldId})`}
        stroke="#fef08a"
        strokeWidth="0.6"
      />
      <circle cx="33.8" cy="22.8" r="1.9" fill="#ffffff" fillOpacity="0.75" />
    </svg>
  );
};

interface LoginPortalProps {
  lang: Lang;
  onToggleLang: () => void;
  firebaseUser: User | null;
  isFirebaseAdmin: boolean;
  isFirebasePolice: boolean;
  domainFallbackActive: boolean;
  branding: BrandingSetting;
  jurisdictions: Jurisdiction[];
  onSignInGoogle: () => Promise<{
    ok: boolean;
    user?: User;
    unauthorizedDomain?: boolean;
    error?: string;
  }>;
  onRetryCloudConnect?: () => Promise<{
    ok: boolean;
    user?: User;
    unauthorizedDomain?: boolean;
    error?: string;
  }>;
  onSignOutGoogle: () => Promise<void>;
  onEnterSession: (session: ActivePortalSession, localFallbackUserUid?: string) => void;
}

type AuthMode = 'login' | 'register';

export const LoginPortal: React.FC<LoginPortalProps> = ({
  lang,
  onToggleLang,
  branding,
  jurisdictions,
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

  // Landlord Self-Registration State (Region -> Zone -> City -> Woreda -> Kebele)
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regRegion, setRegRegion] = useState(DEFAULT_REGION_NAME);
  const [regZone, setRegZone] = useState('');
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

  const regions = useMemo(
    () =>
      Array.from(
        new Set(jurisdictions.map((j) => (j.region || DEFAULT_REGION_NAME).trim()).filter(Boolean))
      ),
    [jurisdictions]
  );

  useEffect(() => {
    if (regions.length > 0 && !regions.includes(regRegion)) {
      setRegRegion(regions[0]);
    }
  }, [regions, regRegion]);

  const zones = useMemo(
    () =>
      Array.from(
        new Set(
          jurisdictions
            .filter((j) => !regRegion || (j.region || DEFAULT_REGION_NAME) === regRegion)
            .map((j) => (j.zone || inferZoneForCity(j.city)).trim())
            .filter(Boolean)
        )
      ),
    [jurisdictions, regRegion]
  );

  const cities = useMemo(
    () =>
      Array.from(
        new Set(
          jurisdictions
            .filter(
              (j) =>
                (!regRegion || (j.region || DEFAULT_REGION_NAME) === regRegion) &&
                (!regZone || (j.zone || inferZoneForCity(j.city)) === regZone)
            )
            .map((j) => j.city)
        )
      ),
    [jurisdictions, regRegion, regZone]
  );

  const woredas = useMemo(
    () =>
      Array.from(
        new Set(
          jurisdictions
            .filter(
              (j) =>
                (!regRegion || (j.region || DEFAULT_REGION_NAME) === regRegion) &&
                (!regZone || (j.zone || inferZoneForCity(j.city)) === regZone) &&
                (!regCity || j.city === regCity)
            )
            .map((j) => j.woreda)
        )
      ),
    [jurisdictions, regRegion, regZone, regCity]
  );

  const kebeles = useMemo(
    () =>
      Array.from(
        new Set(
          jurisdictions
            .filter(
              (j) =>
                (!regRegion || (j.region || DEFAULT_REGION_NAME) === regRegion) &&
                (!regZone || (j.zone || inferZoneForCity(j.city)) === regZone) &&
                (!regCity || j.city === regCity) &&
                (!regWoreda || j.woreda === regWoreda)
            )
            .map((j) => j.kebele)
        )
      ),
    [jurisdictions, regRegion, regZone, regCity, regWoreda]
  );

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
      const cloudRes = await verifyFirestoreAccountLogin(rawId, password);
      if (cloudRes.ok) {
        setFailedAttempts(0);
        setLockoutUntilMs(0);
        onEnterSession(cloudRes.session, cloudRes.uid);
        return;
      }
      if (cloudRes.reason === 'suspended') {
        setErrorMsg(
          lang === 'am'
            ? 'ይህ መለያ ታግዷል። እባክዎ አድሚንን ያነጋግሩ።'
            : 'This account is suspended. Please contact Admin.'
        );
        return;
      }
      if (cloudRes.reason === 'invalid_password') {
        registerFailedLoginAttempt(
          lang === 'am'
            ? 'የገባው የይለፍ ቃል ትክክል አይደለም። የይለፍ ቃል ከጠፋብዎ ፖሊስ ወይም አድሚንን ያነጋግሩ።'
            : 'Incorrect password.'
        );
        return;
      }

      // Check local fallback cache only if not yet present in Firestore
      const fbCheck = await verifyFallbackLogin(rawId, password);
      if (fbCheck.ok) {
        setFailedAttempts(0);
        setLockoutUntilMs(0);
        onEnterSession(fbCheck.session, fbCheck.uid);
        return;
      }
      if (fbCheck.reason === 'invalid_password') {
        registerFailedLoginAttempt(
          lang === 'am' ? 'የገባው የይለፍ ቃል ትክክል አይደለም።' : 'Incorrect password.'
        );
        return;
      }

      registerFailedLoginAttempt(
        lang === 'am'
          ? 'በዚህ ዩዘርኔም ወይም ስልክ ቁጥር የተመዘገበ መለያ አልተገኘም። አዲስ አከራይ ከሆኑ መጀመሪያ ይመዝገቡ።'
          : 'No matching account found. If you are a new landlord, please register first.'
      );
    } catch (err) {
      const fbCheck = await verifyFallbackLogin(rawId, password).catch(() => null);
      if (fbCheck && fbCheck.ok) {
        setFailedAttempts(0);
        setLockoutUntilMs(0);
        onEnterSession(fbCheck.session, fbCheck.uid);
        return;
      }
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
      !regRegion ||
      !regZone ||
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
          ? 'እባክዎ ክልል፣ ዞን፣ ከተማ፣ ወረዳ፣ ቀበሌ እና የፋይዳ መታወቂያ ፎቶዎችን ጨምሮ ሁሉንም ይሙሉ።'
          : 'Please complete region, zone, city, woreda, kebele, all required fields, and Fayda ID photos.'
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
      const regPayload = {
        fullName: regName,
        phone: regPhone,
        username: regUsername.trim() || undefined,
        region: regRegion,
        zone: regZone,
        city: regCity,
        woreda: regWoreda,
        kebele: regKebele,
        houseNumber: regHouseNo,
        roomCount: Number(regRoomCount) || 1,
        faydaId: regFaydaId,
        idFrontImage: regIdFront,
        idBackImage: regIdBack,
        password: regPassword,
      };

      try {
        await registerLandlord('', regPayload);
      } catch (cloudErr) {
        const msg = cloudErr instanceof Error ? cloudErr.message : String(cloudErr);
        // If offline / network failure, save locally so user isn't blocked; duplicate phone/username errors bubble directly
        if (msg.includes('offline') || msg.includes('network')) {
          await registerFallbackLandlord('', regPayload);
        } else {
          throw cloudErr;
        }
      }

      setIdentifier(regUsername.trim() || regPhone);
      setPassword('');
      setRegName('');
      setRegPhone('');
      setRegUsername('');
      setRegHouseNo('');
      setRegFaydaId('');
      setRegIdFront('');
      setRegIdBack('');
      setRegPassword('');
      setRegConfirmPassword('');
      setMode('login');
      setSuccessMsg(
        lang === 'am'
          ? 'የአከራይ ምዝገባዎ በFirestore Cloud ላይ በተሳካ ሁኔታ ተመዝግቧል። አሁን በማንኛውም ስልክ ወይም ኮምፒውተር በዩዘርኔም/ስልክ ቁጥርዎ እና በይለፍ ቃልዎ ሎጊን ብለው ይግቡ።'
          : 'Landlord registration saved to Firestore Cloud. You can now log in from any phone or computer with your username/phone and password.'
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ምዝገባው አልተሳካም');
    } finally {
      setBusy(false);
    }
  }

  const regionalFlagSrc = resolveRegionalFlagSrc(branding.regionalFlagDataUrl);
  const ethiopianFlagSrc = resolveEthiopianFlagSrc(branding.ethiopianFlagDataUrl);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-between py-3 px-3 sm:py-6 sm:px-6 relative overflow-hidden">
      {/* FULL-LOGIN SCENIC SEA WATERMARK & SEA-PLANTED MONUMENTAL FLAGPOLES */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none"
      >
        {/* Serene Deep-Blue Sea & Mountains Landscape */}
        <img
          src={LOGIN_SEA_MOUNTAINS_BG_PATH}
          alt=""
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover object-center scale-[1.01]"
        />

        {/* Subtle translucent atmosphere veil so watermarks, sea flags & colored typography stay clear */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/35 via-slate-950/10 to-slate-950/45" />

        {/* LEFT SEA-PLANTED TALL STEEL POLE: Admin-Configured Regional Flag */}
        <div className="absolute left-[1%] sm:left-[4%] md:left-[7%] bottom-[5%] sm:bottom-[6%] flex items-start">
          <MetallicFlagpole idPrefix="leftSeaPole" />
          <div className="mt-6 sm:mt-11 -ml-3 sm:-ml-4 origin-left animate-flag-breeze">
            <BrandingImage
              src={regionalFlagSrc}
              alt="Benishangul-Gumuz Regional Flag"
              className="w-20 h-13 sm:w-44 sm:h-28 md:w-52 md:h-32 object-contain drop-shadow-[0_12px_22px_rgba(0,0,0,0.65)]"
            />
          </div>
        </div>

        {/* RIGHT SEA-PLANTED TALL STEEL POLE: Admin-Configured Ethiopian Flag (Upright un-mirrored) */}
        <div className="absolute right-[1%] sm:right-[4%] md:right-[7%] bottom-[5%] sm:bottom-[6%] flex flex-row-reverse items-start">
          <MetallicFlagpole idPrefix="rightSeaPole" flipHalyard />
          <div className="mt-6 sm:mt-11 -mr-3 sm:-mr-4 origin-right animate-flag-breeze">
            <BrandingImage
              src={ethiopianFlagSrc}
              alt="Ethiopian National Flag"
              className="w-20 h-13 sm:w-44 sm:h-28 md:w-52 md:h-32 object-contain drop-shadow-[0_12px_22px_rgba(0,0,0,0.65)]"
            />
          </div>
        </div>

        {/* CENTER SEA-FLOATING POLICE LOGO WATERMARK */}
        <div className="absolute inset-0 flex items-center justify-center translate-y-8 sm:translate-y-12">
          <div className="relative flex flex-col items-center animate-sea-float">
            <div className="absolute inset-0 -m-6 sm:-m-10 rounded-full bg-cyan-300/20 blur-2xl" />
            <BrandingImage
              src={branding.logoDataUrl}
              alt=""
              className="relative w-56 h-56 sm:w-[380px] sm:h-[380px] rounded-full object-cover opacity-45 ring-4 ring-amber-200/35 shadow-[0_0_90px_rgba(56,189,248,0.45)]"
            />
            <div className="w-44 sm:w-72 h-5 sm:h-7 mt-3 rounded-full bg-gradient-to-r from-transparent via-cyan-200/40 to-transparent blur-md" />
          </div>
        </div>
      </div>

      {/* FOREGROUND CONTENT */}
      <div className="relative z-10 max-w-xl w-full mx-auto space-y-3.5 sm:space-y-5 flex-1 flex flex-col justify-between pt-2 sm:pt-0">
        {/* Top Language Switcher */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onToggleLang}
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-lg bg-slate-950/55 hover:bg-slate-950/75 backdrop-blur-xs text-cyan-200 border border-cyan-300/50 text-xs font-extrabold transition-colors whitespace-nowrap shadow-sm"
          >
            <Globe className="w-3.5 h-3.5 text-amber-300" />
            {t.langToggle}
          </button>
        </div>

        {/* 1. Dynamic Police Logo + Commission Name + Vibrant Bold System Title */}
        <section className="bg-transparent px-2 py-1 sm:px-4 sm:py-2 text-center">
          <div className="flex flex-col items-center space-y-2 sm:space-y-2.5">
            <div className="p-1 sm:p-1.5 rounded-full bg-gradient-to-tr from-amber-500 via-yellow-300 to-emerald-400 shadow-lg">
              <BrandingImage
                src={branding.logoDataUrl}
                alt={branding.commissionName}
                className="w-18 h-18 sm:w-24 sm:h-24 rounded-full object-cover bg-white/95 p-1"
              />
            </div>

            <div className="space-y-0.5 sm:space-y-1">
              <h2 className="text-base sm:text-2xl font-extrabold tracking-tight text-amber-300 drop-shadow-[0_2px_10px_rgba(0,0,0,0.98)]">
                {branding.commissionName || 'የቤኒሻንጉል ጉሙዝ ክልል ፖሊስ ኮሚሽን'}
              </h2>
              <p className="text-[11px] sm:text-sm font-extrabold tracking-wider uppercase text-cyan-300 drop-shadow-[0_2px_8px_rgba(0,0,0,0.98)]">
                {t.commissionEn}
              </p>
            </div>

            <div className="w-32 sm:w-44 h-0.5 bg-gradient-to-r from-cyan-400/70 via-amber-300 to-emerald-400/70 rounded-full" />

            <div className="drop-shadow-[0_3px_12px_rgba(2,6,23,0.98)]">
              <h1 className="text-lg sm:text-3xl md:text-4xl font-black tracking-tight bg-gradient-to-r from-amber-300 via-yellow-200 to-emerald-300 bg-clip-text text-transparent leading-snug text-balance">
                {t.systemTitle}
              </h1>
            </div>
          </div>
        </section>

        {/* 2. Transparent Login & Register Controls (does not obscure scenic sea/watermark/flags) */}
        <section className="bg-slate-950/25 backdrop-blur-[2px] border border-cyan-300/25 rounded-2xl p-3.5 sm:p-6 space-y-4 shadow-xl">

          {errorMsg && (
            <div className="p-3.5 bg-red-950/85 border border-red-400/60 rounded-xl text-xs sm:text-sm text-rose-200 font-bold shadow-md">
              {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="p-3.5 bg-emerald-950/85 border border-emerald-400/60 rounded-xl text-xs sm:text-sm text-emerald-200 font-bold shadow-md">
              {successMsg}
            </div>
          )}

          {/* MODE 1: UNIFIED SINGLE-LINE LOGIN (ADMIN, POLICE, OR REGISTERED LANDLORD) */}
          {mode === 'login' && (
            <form onSubmit={handleUnifiedLogin} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
                <div>
                  <label className="block text-xs sm:text-sm font-bold text-amber-200 drop-shadow-[0_1px_6px_rgba(0,0,0,0.98)] mb-1.5">
                    {t.usernameOrPhoneLabel}
                  </label>
                  <input
                    type="text"
                    required
                    autoComplete="username"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={t.usernameOrPhonePlaceholder}
                    className="w-full px-3.5 py-3 min-h-[46px] border border-cyan-200/35 rounded-xl text-sm font-semibold text-slate-50 placeholder:text-slate-300/70 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-300 bg-slate-950/65 focus:bg-slate-950/80 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-bold text-amber-200 drop-shadow-[0_1px_6px_rgba(0,0,0,0.98)] mb-1.5">
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
                      className="w-full pl-3.5 pr-12 py-3 min-h-[46px] border border-cyan-200/35 rounded-xl text-sm font-semibold text-slate-50 placeholder:text-slate-300/70 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-300 bg-slate-950/65 focus:bg-slate-950/80 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label="Toggle password visibility"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2.5 min-w-[40px] min-h-[40px] flex items-center justify-center text-amber-300 hover:text-cyan-200 rounded-lg"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={busy || remainingLockSeconds > 0}
                className="w-full py-3.5 px-4 min-h-[48px] bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 hover:from-slate-800 hover:to-blue-900 border border-amber-300/65 disabled:opacity-60 text-amber-300 font-extrabold text-sm sm:text-base rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <Lock className="w-4 h-4 text-emerald-300" />
                {remainingLockSeconds > 0
                  ? lang === 'am'
                    ? `ተቆልፏል (${remainingLockSeconds} ሰከንድ)`
                    : `Locked (${remainingLockSeconds}s)`
                  : busy
                    ? t.verifyingButton
                    : t.loginButton}
              </button>

              <div className="pt-2 border-t border-white/15 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs sm:text-sm">
                <span className="font-semibold text-cyan-200 drop-shadow-[0_1px_6px_rgba(0,0,0,0.98)] text-center sm:text-left">
                  {t.newLandlordPrompt}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setErrorMsg('');
                  }}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-gradient-to-r from-amber-400 to-yellow-300 hover:from-amber-300 hover:to-yellow-200 border border-amber-200 text-slate-950 font-extrabold text-xs sm:text-sm transition-colors w-full sm:w-auto shadow-md whitespace-nowrap"
                >
                  <UserPlus className="w-4 h-4 shrink-0" />
                  {t.registerLink}
                </button>
              </div>
            </form>
          )}

          {/* MODE 2: NEW LANDLORD REGISTRATION */}
          {mode === 'register' && (
            <form onSubmit={handleLandlordRegister} className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/15">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-300 text-slate-950 flex items-center justify-center shrink-0 shadow">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-extrabold text-amber-300 drop-shadow-[0_1px_6px_rgba(0,0,0,0.98)]">
                      {t.registerHeading}
                    </h3>
                    <p className="text-xs font-semibold text-cyan-200 drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]">
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
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[42px] rounded-xl bg-slate-950/75 hover:bg-slate-900 border border-cyan-200/35 text-cyan-200 text-xs font-bold transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  {t.loginTab}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-amber-200 drop-shadow-[0_1px_5px_rgba(0,0,0,0.98)] mb-1.5">
                    {t.fullNameLabel}
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={150}
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder={lang === 'am' ? 'ስም / የአባት ስም / የአያት ስም' : 'First / Middle / Last Name'}
                    className="w-full px-3.5 py-2.5 min-h-[46px] border border-cyan-200/35 bg-slate-950/65 text-slate-50 font-semibold placeholder:text-slate-300/70 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-amber-200 drop-shadow-[0_1px_5px_rgba(0,0,0,0.98)] mb-1.5">
                    {t.phoneUsernameLabel}
                  </label>
                  <input
                    type="tel"
                    required
                    maxLength={30}
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="09..."
                    className="w-full px-3.5 py-2.5 min-h-[46px] border border-cyan-200/35 bg-slate-950/65 text-slate-50 font-semibold placeholder:text-slate-300/70 rounded-xl text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-amber-200 drop-shadow-[0_1px_5px_rgba(0,0,0,0.98)] mb-1.5">
                    {t.usernameOptionalLabel}
                  </label>
                  <input
                    type="text"
                    maxLength={60}
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    placeholder={t.usernameOptionalPlaceholder}
                    className="w-full px-3.5 py-2.5 min-h-[46px] border border-cyan-200/35 bg-slate-950/65 text-slate-50 font-semibold placeholder:text-slate-300/70 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-300"
                  />
                </div>
              </div>

              {/* 5-Level Cascading Location: Region -> Zone -> City -> Woreda -> Kebele */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-amber-200 drop-shadow-[0_1px_5px_rgba(0,0,0,0.98)] mb-1.5">
                    {t.regionLabel}
                  </label>
                  <select
                    required
                    value={regRegion}
                    onChange={(e) => {
                      setRegRegion(e.target.value);
                      setRegZone('');
                      setRegCity('');
                      setRegWoreda('');
                      setRegKebele('');
                    }}
                    className="w-full px-3 py-2.5 min-h-[46px] border border-cyan-200/35 rounded-xl text-sm font-semibold bg-slate-950/65 text-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-300"
                  >
                    <option value="" className="bg-slate-900 text-slate-300">
                      {t.selectRegion}
                    </option>
                    {regions.map((r) => (
                      <option key={r} value={r} className="bg-slate-900 text-white">
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-amber-200 drop-shadow-[0_1px_5px_rgba(0,0,0,0.98)] mb-1.5">
                    {t.zoneLabel}
                  </label>
                  <select
                    required
                    value={regZone}
                    onChange={(e) => {
                      setRegZone(e.target.value);
                      setRegCity('');
                      setRegWoreda('');
                      setRegKebele('');
                    }}
                    className="w-full px-3 py-2.5 min-h-[46px] border border-cyan-200/35 rounded-xl text-sm font-semibold bg-slate-950/65 text-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-300"
                  >
                    <option value="" className="bg-slate-900 text-slate-300">
                      {t.selectZone}
                    </option>
                    {zones.map((z) => (
                      <option key={z} value={z} className="bg-slate-900 text-white">
                        {z}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-amber-200 drop-shadow-[0_1px_5px_rgba(0,0,0,0.98)] mb-1.5">
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
                    className="w-full px-3 py-2.5 min-h-[46px] border border-cyan-200/35 rounded-xl text-sm font-semibold bg-slate-950/65 text-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-300"
                  >
                    <option value="" className="bg-slate-900 text-slate-300">
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
                  <label className="block text-xs font-bold text-amber-200 drop-shadow-[0_1px_5px_rgba(0,0,0,0.98)] mb-1.5">
                    {t.woredaLabel}
                  </label>
                  <select
                    required
                    value={regWoreda}
                    onChange={(e) => {
                      setRegWoreda(e.target.value);
                      setRegKebele('');
                    }}
                    className="w-full px-3 py-2.5 min-h-[46px] border border-cyan-200/35 rounded-xl text-sm font-semibold bg-slate-950/65 text-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-300"
                  >
                    <option value="" className="bg-slate-900 text-slate-300">
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
                  <label className="block text-xs font-bold text-amber-200 drop-shadow-[0_1px_5px_rgba(0,0,0,0.98)] mb-1.5">
                    {t.kebeleLabel}
                  </label>
                  <select
                    required
                    value={regKebele}
                    onChange={(e) => setRegKebele(e.target.value)}
                    className="w-full px-3 py-2.5 min-h-[46px] border border-cyan-200/35 rounded-xl text-sm font-semibold bg-slate-950/65 text-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-300"
                  >
                    <option value="" className="bg-slate-900 text-slate-300">
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
                  <label className="block text-xs font-bold text-amber-200 drop-shadow-[0_1px_5px_rgba(0,0,0,0.98)] mb-1.5">
                    {t.houseNoLabel}
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={60}
                    value={regHouseNo}
                    onChange={(e) => setRegHouseNo(e.target.value)}
                    placeholder="104"
                    className="w-full px-3 py-2.5 min-h-[46px] border border-cyan-200/35 bg-slate-950/65 text-slate-50 font-semibold placeholder:text-slate-300/70 rounded-xl text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-amber-200 drop-shadow-[0_1px_5px_rgba(0,0,0,0.98)] mb-1.5">
                    {t.roomCountLabel}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    required
                    value={regRoomCount}
                    onChange={(e) => setRegRoomCount(e.target.value)}
                    className="w-full px-3 py-2.5 min-h-[46px] border border-cyan-200/35 bg-slate-950/65 text-slate-50 font-semibold rounded-xl text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-amber-200 drop-shadow-[0_1px_5px_rgba(0,0,0,0.98)] mb-1.5">
                    {t.faydaIdLabel}
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={60}
                    value={regFaydaId}
                    onChange={(e) => setRegFaydaId(e.target.value)}
                    placeholder="Fayda FIN / FAN"
                    className="w-full px-3 py-2.5 min-h-[46px] border border-cyan-200/35 bg-slate-950/65 text-slate-50 font-semibold placeholder:text-slate-300/70 rounded-xl text-sm font-mono-tabular focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-300"
                  />
                </div>
              </div>

              {/* Fayda Front & Back Uploads with Camera + Gallery + Auto-Crop */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SmartPhotoInput
                  label={t.faydaFrontLabel}
                  value={regIdFront}
                  onChange={setRegIdFront}
                  cropMode="id_card"
                  cameraFacing="environment"
                  theme="dark"
                  lang={lang}
                  previewAlt="Fayda Front"
                />

                <SmartPhotoInput
                  label={t.faydaBackLabel}
                  value={regIdBack}
                  onChange={setRegIdBack}
                  cropMode="id_card"
                  cameraFacing="environment"
                  theme="dark"
                  lang={lang}
                  previewAlt="Fayda Back"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-amber-200 drop-shadow-[0_1px_5px_rgba(0,0,0,0.98)] mb-1.5">
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
                    className="w-full px-3.5 py-2.5 min-h-[46px] border border-cyan-200/35 bg-slate-950/65 text-slate-50 font-semibold placeholder:text-slate-300/70 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-amber-200 drop-shadow-[0_1px_5px_rgba(0,0,0,0.98)] mb-1.5">
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
                    className="w-full px-3.5 py-2.5 min-h-[46px] border border-cyan-200/35 bg-slate-950/65 text-slate-50 font-semibold placeholder:text-slate-300/70 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-300"
                  />
                </div>
              </div>

              <div className="space-y-2.5 pt-1">
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-3.5 px-4 min-h-[48px] bg-gradient-to-r from-amber-500 to-yellow-300 hover:from-amber-400 hover:to-yellow-200 disabled:opacity-60 text-slate-950 font-extrabold text-sm sm:text-base rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                >
                  <Building2 className="w-4 h-4" />
                  {busy ? t.registeringBtn : t.registerSubmitBtn}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setErrorMsg('');
                  }}
                  className="w-full py-2.5 px-4 min-h-[44px] rounded-xl bg-slate-950/70 hover:bg-slate-900 border border-cyan-200/30 text-cyan-200 font-bold text-xs sm:text-sm transition-colors"
                >
                  {t.backToLogin}
                </button>
              </div>
            </form>
          )}

        </section>

        {/* 3. Motto & Attribution Footer (bold multi-colored typography, clear lower sea) */}
        <footer className="bg-transparent px-4 py-2 sm:px-6 sm:py-3 text-center space-y-1.5">
          <p className="text-base sm:text-2xl font-extrabold tracking-wide text-amber-300 drop-shadow-[0_2px_10px_rgba(0,0,0,0.98)]">
            {t.motto}
          </p>
          <p className="text-xs sm:text-sm font-extrabold text-emerald-300 drop-shadow-[0_2px_8px_rgba(0,0,0,0.98)]">
            {t.footerAttribution}
          </p>
        </footer>
      </div>
    </div>
  );
};
