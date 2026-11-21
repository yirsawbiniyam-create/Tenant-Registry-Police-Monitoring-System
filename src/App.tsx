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

  const [branding, setBranding] = useState<BrandingSetting>({
    commissionName: DEFAULT_COMMISSION_NAME,
    subtitle: DEFAULT_COMMISSION_SUBTITLE,
    logoDataUrl: DEFAULT_LOGO_PATH,
    regionalFlagDataUrl: DEFAULT_REGIONAL_FLAG_PATH,
    ethiopianFlagDataUrl: DEFAULT_ETHIOPIAN_FLAG_PATH,
    updatedByUid: 'system',
    updatedAt: null,
  });

  const [jurisdictions, setJurisdictions] = useState<Jurisdiction[]>(
    DEFAULT_JURISDICTIONS.map((j) => ({ ...j, createdByUid: 'seed', createdAt: null }))
  );

  const [session, setSession] = useState<ActivePortalSession | null>(null);
  const [lang, setLang] = useState<Lang>('am');
  const toggleLang = () => setLang((prev) => (prev === 'am' ? 'en' : 'am'));

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    const unsubBrand = subscribeBranding(setBranding);
    const unsubJur = subscribeJurisdictions(setJurisdictions);

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
          void seedDefaultJurisdictionsIfEmpty(user.uid).catch((err) => {
            console.warn('Jurisdiction seed skipped:', err);
          });
          void ensureAdminCredentialsSeeded(user.uid).catch((err) => {
            console.warn('Admin credentials seed deferred:', err);
          });
        }
      } else {
        setIsFirebaseAdmin(false);
        setIsFirebasePolice(false);
        setSession(null);
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

  async function handleSignInGoogle(): Promise<{ ok: boolean; user?: User; error?: string }> {
    if (signingIn) {
      return { ok: false, error: 'የGoogle መግቢያ መስኮት አስቀድሞ ተከፍቷል። እባክዎ ይጨርሱ ወይም ይዝጉት።' };
    }
    setSigningIn(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      return { ok: true, user: cred.user };
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return {
          ok: false,
          error: 'የGoogle መግቢያ መስኮቱ ሳይጠናቀቅ ተዘግቷል። እባክዎ እንደገና ሞክረው Google መለያዎን ይምረጡ።',
        };
      }
      if (code === 'auth/popup-blocked') {
        return {
          ok: false,
          error: 'የGoogle መግቢያ መስኮት በብራውዘርዎ ታግዷል። እባክዎ Pop-up ይፍቀዱና እንደገና ይሞክሩ።',
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

  async function handleSignOutGoogle() {
    setSession(null);
    await signOut(auth);
  }

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

  if (session && firebaseUser) {
    if (session.role === 'landlord') {
      return (
        <LandlordPortal
          firebaseUid={firebaseUser.uid}
          initialLandlord={session.landlord}
          branding={branding}
          jurisdictions={jurisdictions}
          lang={lang}
          onToggleLang={toggleLang}
          onLogout={() => setSession(null)}
        />
      );
    }

    if (session.role === 'police') {
      return (
        <PoliceAdminPortal
          firebaseUid={firebaseUser.uid}
          mode="police"
          actorName={`${session.officer.rank} ${session.officer.fullName}`}
          officer={session.officer}
          branding={branding}
          jurisdictions={jurisdictions}
          lang={lang}
          onToggleLang={toggleLang}
          onLogout={() => setSession(null)}
        />
      );
    }

    if (session.role === 'admin' && isFirebaseAdmin) {
      return (
        <PoliceAdminPortal
          firebaseUid={firebaseUser.uid}
          mode="admin"
          actorName={session.displayName}
          actorEmail={session.email}
          adminUsername={session.adminUsername}
          branding={branding}
          jurisdictions={jurisdictions}
          lang={lang}
          onToggleLang={toggleLang}
          onLogout={() => setSession(null)}
        />
      );
    }
  }

  return (
    <LoginPortal
      firebaseUser={firebaseUser}
      isFirebaseAdmin={isFirebaseAdmin}
      isFirebasePolice={isFirebasePolice}
      branding={branding}
      jurisdictions={jurisdictions}
      lang={lang}
      onToggleLang={toggleLang}
      onSignInGoogle={handleSignInGoogle}
      onSignOutGoogle={handleSignOutGoogle}
      onEnterSession={setSession}
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
