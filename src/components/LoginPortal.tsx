import React, { useMemo, useState } from 'react';
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
import { compressImageFile, normalizePhone, verifyPassword } from '../utils/crypto';
import { ensureAdminCredentialsSeeded, registerLandlord } from '../services/firestoreService';
import { BrandingImage } from './BrandingImage';
import { DICT, type Lang } from '../i18n';

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

  // Unified Single-Row Login State
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

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
              onEnterSession({
                role: 'admin',
                displayName: activeUser.displayName || 'ክልል ዋና አድሚን',
                email: activeUser.email || ROOT_ADMIN_EMAIL,
                adminUsername: cred.username,
              });
              return;
            }
            setErrorMsg(
              lang === 'am'
                ? 'የገባው የይለፍ ቃል ትክክል አይደለም።'
                : 'Incorrect password.'
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
            onEnterSession({ role: 'police', officer });
            return;
          }
          setErrorMsg(
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
            onEnterSession({ role: 'landlord', landlord });
            return;
          }
        }
        if (candidates.length > 0) {
          setErrorMsg(
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

      setErrorMsg(
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

    if (regPassword.length < 4) {
      setErrorMsg(
        lang === 'am'
          ? 'የይለፍ ቃል ቢያንስ 4 ቁምፊ መሆን አለበት።'
          : 'Password must be at least 4 characters.'
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 flex flex-col justify-between py-6 px-4 sm:px-6 relative overflow-hidden">
      {/* Subtle architectural background grid */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-15"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 20%, rgba(251, 191, 36, 0.28), transparent 40%), radial-gradient(circle at 80% 70%, rgba(37, 99, 235, 0.35), transparent 45%)',
        }}
      />

      <div className="relative z-10 max-w-3xl w-full mx-auto space-y-6">
        {/* Top Language Switcher */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onToggleLang}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-amber-200 border border-amber-400/30 text-xs font-semibold transition-colors whitespace-nowrap"
          >
            <Globe className="w-3.5 h-3.5" />
            {t.langToggle}
          </button>
        </div>

        {/* 1. Dynamic Police Logo + 2. Commission Name (Amharic & English) + 3. Large System Title */}
        <section className="bg-slate-950/75 backdrop-blur-md text-white rounded-2xl border border-amber-400/40 px-6 py-8 text-center shadow-2xl">
          <div className="flex flex-col items-center space-y-4">
            <div className="p-1.5 rounded-full bg-gradient-to-tr from-amber-600 via-amber-300 to-amber-500 shadow-lg">
              <BrandingImage
                src={branding.logoDataUrl}
                alt={branding.commissionName}
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover bg-white p-1"
              />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-amber-300">
                {branding.commissionName || 'ቤኒሻንጉል ጉሙዝ ፖሊስ ኮሚሽን'}
              </h2>
              <p className="text-xs sm:text-sm font-semibold tracking-wider uppercase text-slate-200">
                {t.commissionEn}
              </p>
            </div>

            <div className="w-36 h-px bg-gradient-to-r from-transparent via-amber-400/80 to-transparent" />

            <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-amber-200 to-white leading-snug text-balance">
              {t.systemTitle}
            </h1>
          </div>
        </section>

        {/* 4. Clean Login & Register Card */}
        <section className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-5">
          {errorMsg && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-medium">
              {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-medium">
              {successMsg}
            </div>
          )}

          {/* MODE 1: UNIFIED SINGLE-LINE LOGIN (ADMIN, POLICE, OR REGISTERED LANDLORD) */}
          {mode === 'login' && (
            <form onSubmit={handleUnifiedLogin} className="space-y-5">

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    {t.usernameOrPhoneLabel}
                  </label>
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={t.usernameOrPhonePlaceholder}
                    className="w-full px-3.5 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-slate-50 focus:bg-white transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    {t.passwordLabel}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t.passwordPlaceholder}
                      className="w-full pl-3.5 pr-10 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-slate-50 focus:bg-white transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label="Toggle password visibility"
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-700"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 hover:from-slate-800 hover:to-blue-900 disabled:opacity-60 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
              >
                <Lock className="w-4 h-4 text-amber-300" />
                {busy ? t.verifyingButton : t.loginButton}
              </button>

              <div className="pt-1 flex flex-col sm:flex-row items-center justify-center gap-2 text-xs text-slate-600">
                <span>{t.newLandlordPrompt}</span>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setErrorMsg('');
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-950 font-bold transition-colors"
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
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-900 flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">{t.registerHeading}</h3>
                    <p className="text-xs text-slate-500">{t.registerSubtitle}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setErrorMsg('');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  {t.loginTab}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {t.fullNameLabel}
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={150}
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder={lang === 'am' ? 'ስም / የአባት ስም / የአያት ስም' : 'First / Middle / Last Name'}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {t.phoneUsernameLabel}
                  </label>
                  <input
                    type="tel"
                    required
                    maxLength={30}
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="09..."
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">{t.cityLabel}</label>
                  <select
                    required
                    value={regCity}
                    onChange={(e) => {
                      setRegCity(e.target.value);
                      setRegWoreda('');
                      setRegKebele('');
                    }}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    <option value="">{t.selectCity}</option>
                    {cities.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">{t.woredaLabel}</label>
                  <select
                    required
                    value={regWoreda}
                    onChange={(e) => {
                      setRegWoreda(e.target.value);
                      setRegKebele('');
                    }}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    <option value="">{t.selectWoreda}</option>
                    {woredas.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">{t.kebeleLabel}</label>
                  <select
                    required
                    value={regKebele}
                    onChange={(e) => setRegKebele(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    <option value="">{t.selectKebele}</option>
                    {kebeles.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">{t.houseNoLabel}</label>
                  <input
                    type="text"
                    required
                    maxLength={60}
                    value={regHouseNo}
                    onChange={(e) => setRegHouseNo(e.target.value)}
                    placeholder="104"
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {t.roomCountLabel}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    required
                    value={regRoomCount}
                    onChange={(e) => setRegRoomCount(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {t.faydaIdLabel}
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={60}
                    value={regFaydaId}
                    onChange={(e) => setRegFaydaId(e.target.value)}
                    placeholder="Fayda FIN / FAN"
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm font-mono-tabular focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>

              {/* Fayda Front & Back Uploads */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    {t.faydaFrontLabel}
                  </label>
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl p-3 cursor-pointer hover:bg-slate-50 transition-colors">
                    {regIdFront ? (
                      <img
                        src={regIdFront}
                        alt="Fayda Front"
                        className="h-24 w-full object-contain rounded"
                      />
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-slate-600 py-4">
                        <Upload className="w-4 h-4" />
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
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    {t.faydaBackLabel}
                  </label>
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl p-3 cursor-pointer hover:bg-slate-50 transition-colors">
                    {regIdBack ? (
                      <img
                        src={regIdBack}
                        alt="Fayda Back"
                        className="h-24 w-full object-contain rounded"
                      />
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-slate-600 py-4">
                        <Upload className="w-4 h-4" />
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
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {t.passwordLabel} *
                  </label>
                  <input
                    type="password"
                    required
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder={lang === 'am' ? 'ቢያንስ 4 ቁምፊ' : 'Min 4 characters'}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {t.confirmPasswordLabel}
                  </label>
                  <input
                    type="password"
                    required
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    placeholder={lang === 'am' ? 'በድጋሚ ያስገቡ' : 'Re-enter password'}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:opacity-60 text-slate-950 font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
              >
                <Building2 className="w-4 h-4" />
                {busy ? t.registeringBtn : t.registerSubmitBtn}
              </button>

              <p className="text-xs text-slate-500 text-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setErrorMsg('');
                  }}
                  className="text-slate-900 font-bold underline hover:text-blue-900"
                >
                  {t.backToLogin}
                </button>
              </p>
            </form>
          )}
        </section>

        {/* 5. Motto & 6. Attribution Footer */}
        <footer className="bg-slate-950/80 backdrop-blur-md border border-amber-400/35 rounded-2xl px-6 py-6 text-center space-y-2 shadow-xl">
          <p className="text-lg sm:text-2xl font-bold tracking-wide text-amber-300">
            {t.motto}
          </p>
          <p className="text-xs sm:text-sm font-semibold text-slate-200">
            {t.footerAttribution}
          </p>
        </footer>
      </div>
    </div>
  );
};
