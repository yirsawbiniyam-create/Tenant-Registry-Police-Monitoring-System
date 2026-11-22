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
import {
  ensureFallbackInitialized,
  subscribeFallbackStore,
  type FallbackStoreState,
} from './utils/localFallback';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginPortal } from './components/LoginPortal';
import { LandlordPortal } from './components/LandlordPortal';
import { PoliceAdminPortal } from './components/PoliceAdminPortal';
import { DICT, type Lang } from './i18n';

function getDomainFallbackKey(): string {
  const host = typeof window !== 'undefined' ? window.location.hostname : 'local';
  return `bg_domain_fallback_${host}`;
}

function readStoredDomainFallback(): boolean {
  try {
    return window.sessionStorage.getItem(getDomainFallbackKey()) === '1';
  } catch {
    return false;
  }
}

function writeStoredDomainFallback(active: boolean) {
  try {
    if (active) {
      window.sessionStorage.setItem(getDomainFallbackKey(), '1');
    } else {
      window.sessionStorage.removeItem(getDomainFallbackKey());
    }
  } catch {
    // Ignore sessionStorage access restrictions
  }
}

function AppContent() {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isFirebaseAdmin, setIsFirebaseAdmin] = useState(false);
  const [isFirebasePolice, setIsFirebasePolice] = useState(false);

  const [domainFallbackActive, setDomainFallbackActiveState] = useState<boolean>(() =>
    readStoredDomainFallback()
  );
  const [fallbackUid, setFallbackUid] = useState('');
  const [fallbackStore, setFallbackStore] = useState<FallbackStoreState | null>(null);

  const setDomainFallbackActive = (active: boolean) => {
    writeStoredDomainFallback(active);
    setDomainFallbackActiveState(active);
  };

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
  const [lang, setLang] = useState<Lang>('am');
  const toggleLang = () => setLang((prev) => (prev === 'am' ? 'en' : 'am'));

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    const unsubBrand = subscribeBranding(setCloudBranding);
    const unsubJur = subscribeJurisdictions(setCloudJurisdictions);
    const unsubFallback = subscribeFallbackStore(setFallbackStore);

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
        setDomainFallbackActive(false);
        setFallbackUid('');
        if (admin) {
          void seedDefaultJurisdictionsIfEmpty(user.uid).catch((err) => {
            console.warn('Jurisdiction seed skipped:', err);
          });
          void ensureAdminCredentialsSeeded(user.uid).catch((err) => {
            console.warn('Admin credentials seed deferred:', err);
          });
        }
        void syncFallbackRecordsToCloud({
          uid: user.uid,
          isAdmin: admin,
          isPolice: police,
        }).catch((err) => {
          console.warn('Fallback sync skipped:', err);
        });
      } else {
        setIsFirebaseAdmin(false);
        setIsFirebasePolice(false);
        setSession((prev) => (fallbackUid ? prev : null));
      }
      setAuthReady(true);
    });

    return () => {
      unsubBrand();
      unsubJur();
      unsubFallback();
      unsubAuth();
    };
  }, [fallbackUid]);

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
      setDomainFallbackActive(false);
      return { ok: true, user: cred.user };
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      const msg = err instanceof Error ? err.message : '';
      if (code === 'auth/unauthorized-domain' || msg.includes('unauthorized-domain')) {
        await ensureFallbackInitialized();
        setDomainFallbackActive(true);
        return {
          ok: false,
          unauthorizedDomain: true,
          error:
            'ይህ ዶሜይን በFirebase Console Authorized Domains ላይ ስላልተመዘገበ በአካባቢያዊ አስተማማኝ መግቢያ (Fallback Mode) ተከፍቷል።',
        };
      }
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return {
          ok: false,
          error: 'የGoogle መግቢያ መስኮቱ ሳይጠናቀቅ ተዘግቷል። እባክዎ እንደገና ሞክረው Google መለያዎን ይምረጡ።',
        };
      }
      if (code === 'auth/popup-blocked') {
        await ensureFallbackInitialized();
        setDomainFallbackActive(true);
        return {
          ok: false,
          unauthorizedDomain: true,
          error:
            'የብራውዘሩ Pop-up ስለታገደ በአካባቢያዊ አስተማማኝ መግቢያ ተከፍቷል። ለFirestore Cloud Pop-up ይፍቀዱ።',
        };
      }
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'በGoogle መግባት አልተቻለም።',
      };
    } finally {
      setSigningIn(false);
    }
  }

  async function handleRetryCloudConnect() {
    setDomainFallbackActive(false);
    return handleSignInGoogle();
  }

  async function handleSignOutGoogle() {
    setSession(null);
    setFallbackUid('');
    if (firebaseUser) {
      await signOut(auth);
    }
  }

  function handleEnterSession(nextSession: ActivePortalSession, localFallbackUserUid?: string) {
    if (localFallbackUserUid) {
      setDomainFallbackActive(true);
      setFallbackUid(localFallbackUserUid);
    } else {
      setFallbackUid('');
    }
    setSession(nextSession);
  }

  const isCloudConnected = Boolean(firebaseUser && firebaseUser.emailVerified);
  const branding =
    domainFallbackActive && fallbackStore ? fallbackStore.branding : cloudBranding;
  const jurisdictions =
    domainFallbackActive && fallbackStore ? fallbackStore.jurisdictions : cloudJurisdictions;

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

  if (session && (isCloudConnected || (domainFallbackActive && fallbackUid))) {
    const activeUid = isCloudConnected && firebaseUser ? firebaseUser.uid : fallbackUid;

    if (session.role === 'landlord') {
      return (
        <LandlordPortal
          isCloudConnected={isCloudConnected}
          firebaseUid={activeUid}
          initialLandlord={session.landlord}
          branding={branding}
          jurisdictions={jurisdictions}
          lang={lang}
          onToggleLang={toggleLang}
          onRetryCloudConnect={handleRetryCloudConnect}
          onLogout={() => {
            setSession(null);
            setFallbackUid('');
          }}
        />
      );
    }

    if (session.role === 'police') {
      return (
        <PoliceAdminPortal
          isCloudConnected={isCloudConnected}
          firebaseUid={activeUid}
          mode="police"
          actorName={`${session.officer.rank} ${session.officer.fullName}`}
          officer={session.officer}
          branding={branding}
          jurisdictions={jurisdictions}
          lang={lang}
          onToggleLang={toggleLang}
          onRetryCloudConnect={handleRetryCloudConnect}
          onLogout={() => {
            setSession(null);
            setFallbackUid('');
          }}
        />
      );
    }

    if (session.role === 'admin' && (isFirebaseAdmin || domainFallbackActive)) {
      return (
        <PoliceAdminPortal
          isCloudConnected={isCloudConnected}
          firebaseUid={activeUid}
          mode="admin"
          actorName={session.displayName}
          actorEmail={session.email}
          adminUsername={session.adminUsername}
          branding={branding}
          jurisdictions={jurisdictions}
          lang={lang}
          onToggleLang={toggleLang}
          onRetryCloudConnect={handleRetryCloudConnect}
          onLogout={() => {
            setSession(null);
            setFallbackUid('');
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
      domainFallbackActive={domainFallbackActive}
      branding={branding}
      jurisdictions={jurisdictions}
      lang={lang}
      onToggleLang={toggleLang}
      onSignInGoogle={handleSignInGoogle}
      onRetryCloudConnect={handleRetryCloudConnect}
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
