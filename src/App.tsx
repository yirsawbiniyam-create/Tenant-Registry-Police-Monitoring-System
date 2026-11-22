import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, googleProvider, ROOT_ADMIN_EMAIL } from './firebase';
import type { ActivePortalSession, BrandingSetting, Jurisdiction } from './types';
import {
  DEFAULT_COMMISSION_NAME,
  DEFAULT_COMMISSION_SUBTITLE,
  DEFAULT_ETHIOPIAN_FLAG_PATH,
  DEFAULT_JURISDICTIONS,
  DEFAULT_LOGO_PATH,
  DEFAULT_REGIONAL_FLAG_PATH,
} from './utils/seedData';
import {
  ensureAdminCredentialsSeeded,
  seedDefaultJurisdictionsIfEmpty,
  subscribeBranding,
  subscribeJurisdictions,
  syncFallbackRecordsToCloud,
} from './services/firestoreService';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginPortal } from './components/LoginPortal';
import { LandlordPortal } from './components/LandlordPortal';
import { PoliceAdminPortal } from './components/PoliceAdminPortal';
import { DICT, type Lang } from './i18n';

function AppContent() {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isFirebaseAdmin, setIsFirebaseAdmin] = useState(false);
  const [isFirebasePolice, setIsFirebasePolice] = useState(false);

  const [cloudBranding, setCloudBranding] = useState<BrandingSetting>({
    commissionName: DEFAULT_COMMISSION_NAME,
    subtitle: DEFAULT_COMMISSION_SUBTITLE,
    logoDataUrl: DEFAULT_LOGO_PATH,
    regionalFlagDataUrl: DEFAULT_REGIONAL_FLAG_PATH,
    ethiopianFlagDataUrl: DEFAULT_ETHIOPIAN_FLAG_PATH,
    updatedByUid: 'system',
    updatedAt: null,
  });

  const [cloudJurisdictions, setCloudJurisdictions] = useState<Jurisdiction[]>(
    DEFAULT_JURISDICTIONS.map((j) => ({ ...j, createdByUid: 'seed', createdAt: null }))
  );

  const [session, setSession] = useState<ActivePortalSession | null>(null);
  const [sessionUid, setSessionUid] = useState('');
  const [lang, setLang] = useState<Lang>('am');
  const toggleLang = () => setLang((prev) => (prev === 'am' ? 'en' : 'am'));

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    const unsubBrand = subscribeBranding(setCloudBranding);
    const unsubJur = subscribeJurisdictions(setCloudJurisdictions);

    // Seed default jurisdictions & sync any older browser-local records into Firestore
    void seedDefaultJurisdictionsIfEmpty('adm_primary').catch(() => undefined);
    void ensureAdminCredentialsSeeded('adm_primary').catch(() => undefined);
    void syncFallbackRecordsToCloud({
      uid: 'adm_primary',
      isAdmin: false,
      isPolice: false,
    }).catch(() => undefined);

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user && user.emailVerified) {
        const email = (user.email || '').toLowerCase();
        let admin = email === ROOT_ADMIN_EMAIL;
        if (!admin) {
          try {
            const adminSnap = await getDoc(doc(db, 'admins', user.uid));
            admin = adminSnap.exists();
          } catch {
            admin = false;
          }
        }
        let police = admin;
        if (!police && email) {
          try {
            const polSnap = await getDoc(doc(db, 'police_emails', email));
            police = polSnap.exists();
          } catch {
            police = false;
          }
        }
        setIsFirebaseAdmin(admin);
        setIsFirebasePolice(police);
        if (admin) {
          void seedDefaultJurisdictionsIfEmpty(user.uid).catch(() => undefined);
          void ensureAdminCredentialsSeeded(user.uid).catch(() => undefined);
        }
        void syncFallbackRecordsToCloud({
          uid: user.uid,
          isAdmin: admin,
          isPolice: police,
        }).catch(() => undefined);
      } else {
        setIsFirebaseAdmin(false);
        setIsFirebasePolice(false);
      }
      setAuthReady(true);
    });

    return () => {
      unsubBrand();
      unsubJur();
      unsubAuth();
    };
  }, []);

  const [signingIn, setSigningIn] = useState(false);

  async function handleSignInGoogle(): Promise<{
    ok: boolean;
    user?: User;
    unauthorizedDomain?: boolean;
    error?: string;
  }> {
    if (signingIn) {
      return { ok: false, error: 'የGoogle መግቢያ መስኮት አስቀድሞ ተከፍቷል። እባክዎ ይጨርሱ ወይም ይዝጉት።' };
    }
    setSigningIn(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      return { ok: true, user: cred.user };
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      const msg = err instanceof Error ? err.message : '';
      if (code === 'auth/unauthorized-domain' || msg.includes('unauthorized-domain')) {
        return { ok: false, unauthorizedDomain: true };
      }
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'በGoogle መግባት አልተቻለም።',
      };
    } finally {
      setSigningIn(false);
    }
  }

  async function handleSignOutGoogle() {
    setSession(null);
    setSessionUid('');
    if (firebaseUser) {
      await signOut(auth);
    }
  }

  function handleEnterSession(nextSession: ActivePortalSession, userUid?: string) {
    const resolvedUid =
      userUid ||
      (nextSession.role === 'landlord'
        ? nextSession.landlord.ownerUid
        : nextSession.role === 'police'
          ? nextSession.officer.officerId
          : 'adm_primary');
    setSessionUid(resolvedUid);
    setSession(nextSession);

    void syncFallbackRecordsToCloud({
      uid: resolvedUid,
      isAdmin: nextSession.role === 'admin',
      isPolice: nextSession.role === 'admin' || nextSession.role === 'police',
      policeVaultKey: nextSession.role !== 'landlord' ? nextSession.policeVaultKey : undefined,
    }).catch(() => undefined);
  }

  // Firestore Cloud is always enabled directly across all browsers, phones, and computers
  const isCloudConnected = true;

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-2 border-slate-900 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-600">{DICT[lang].loadingSystem}</p>
        </div>
      </div>
    );
  }

  if (session) {
    const activeUid =
      session.role === 'landlord'
        ? session.landlord.ownerUid || sessionUid
        : sessionUid ||
          (session.role === 'police' ? session.officer.officerId : 'adm_primary');

    if (session.role === 'landlord') {
      return (
        <LandlordPortal
          isCloudConnected={isCloudConnected}
          firebaseUid={activeUid}
          workspaceSecret={session.workspaceSecret}
          initialLandlord={session.landlord}
          branding={cloudBranding}
          jurisdictions={cloudJurisdictions}
          lang={lang}
          onToggleLang={toggleLang}
          onLogout={() => {
            setSession(null);
            setSessionUid('');
          }}
        />
      );
    }

    if (session.role === 'police') {
      return (
        <PoliceAdminPortal
          isCloudConnected={isCloudConnected}
          firebaseUid={activeUid}
          policeVaultKey={session.policeVaultKey}
          isFirebasePolice={isFirebasePolice}
          mode="police"
          actorName={`${session.officer.rank} ${session.officer.fullName}`}
          officer={session.officer}
          branding={cloudBranding}
          jurisdictions={cloudJurisdictions}
          lang={lang}
          onToggleLang={toggleLang}
          onLogout={() => {
            setSession(null);
            setSessionUid('');
          }}
        />
      );
    }

    if (session.role === 'admin') {
      return (
        <PoliceAdminPortal
          isCloudConnected={isCloudConnected}
          firebaseUid={activeUid}
          policeVaultKey={session.policeVaultKey}
          isFirebasePolice={isFirebasePolice || isFirebaseAdmin}
          mode="admin"
          actorName={session.displayName}
          actorEmail={session.email}
          adminUsername={session.adminUsername}
          branding={cloudBranding}
          jurisdictions={cloudJurisdictions}
          lang={lang}
          onToggleLang={toggleLang}
          onLogout={() => {
            setSession(null);
            setSessionUid('');
          }}
        />
      );
    }
  }

  return (
    <LoginPortal
      firebaseUser={firebaseUser}
      isFirebaseAdmin={isFirebaseAdmin}
      isFirebasePolice={isFirebasePolice}
      domainFallbackActive={false}
      branding={cloudBranding}
      jurisdictions={cloudJurisdictions}
      lang={lang}
      onToggleLang={toggleLang}
      onSignInGoogle={handleSignInGoogle}
      onSignOutGoogle={handleSignOutGoogle}
      onEnterSession={handleEnterSession}
    />
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
