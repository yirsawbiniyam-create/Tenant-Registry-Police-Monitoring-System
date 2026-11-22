import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertOctagon,
  BarChart3,
  Camera,
  CheckCircle2,
  ChevronRight,
  Edit3,
  FileWarning,
  Folder,
  FolderOpen,
  Globe,
  History,
  KeyRound,
  LogOut,
  Printer,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserCog,
  UserPlus,
} from 'lucide-react';
import type {
  ActivityHistory,
  AdminCredential,
  BrandingSetting,
  CriminalRecord,
  Jurisdiction,
  JurisdictionLevel,
  Landlord,
  PoliceOfficer,
  RecordType,
  Tenant,
  WantedAlert,
  WantedPerson,
} from '../types';
import {
  formatDateAm,
  normalizePhone,
  normalizeText,
  sanitizeImageSrc,
  toJsDate,
} from '../utils/crypto';
import {
  addJurisdiction,
  checkWantedMatch,
  createCriminalRecord,
  createPoliceOfficer,
  createWantedAlertIfMissing,
  createWantedPerson,
  deleteCriminalRecord,
  deleteJurisdiction,
  deleteLandlordAccount,
  deleteOfficerAccount,
  deleteWantedPerson,
  ensureAdminCredentialsSeeded,
  replaceLandlordOwner,
  saveBranding,
  seedDefaultJurisdictionsIfEmpty,
  subscribeAdminCredentials,
  subscribePoliceData,
  updateAdminCredentials,
  updateAlertStatus,
  updateCriminalRecord,
  updateCriminalRecordType,
  updateJurisdiction,
  updateLandlordCredentials,
  updateOfficerCredentials,
  updateWantedStatus,
} from '../services/firestoreService';
import {
  addFallbackJurisdiction,
  createFallbackCriminalRecord,
  createFallbackPoliceOfficer,
  createFallbackWantedAlertIfMissing,
  createFallbackWantedPerson,
  deleteFallbackCriminalRecord,
  deleteFallbackJurisdiction,
  deleteFallbackLandlordAccount,
  deleteFallbackOfficerAccount,
  deleteFallbackWantedPerson,
  replaceFallbackLandlordOwner,
  saveFallbackBranding,
  subscribeFallbackStore,
  updateFallbackAdminCredentials,
  updateFallbackAlertStatus,
  updateFallbackCriminalRecord,
  updateFallbackCriminalRecordType,
  updateFallbackJurisdiction,
  updateFallbackLandlordCredentials,
  updateFallbackOfficerCredentials,
  updateFallbackWantedStatus,
} from '../utils/localFallback';
import {
  DEFAULT_ETHIOPIAN_FLAG_PATH,
  DEFAULT_REGION_NAME,
  DEFAULT_REGIONAL_FLAG_PATH,
  inferZoneForCity,
  resolveEthiopianFlagSrc,
  resolveRegionalFlagSrc,
} from '../utils/seedData';
import { BrandingImage } from './BrandingImage';
import { SmartPhotoInput } from './SmartPhotoInput';
import {
  computeRepeatOffendersCount,
  StatisticsReportsView,
} from './StatisticsReportsView';
import { DICT, type Lang } from '../i18n';

interface PoliceAdminPortalProps {
  isCloudConnected: boolean;
  lang: Lang;
  onToggleLang: () => void;
  firebaseUid: string;
  mode: 'admin' | 'police';
  actorName: string;
  actorEmail?: string;
  adminUsername?: string;
  officer?: PoliceOfficer;
  branding: BrandingSetting;
  jurisdictions: Jurisdiction[];
  onRetryCloudConnect?: () => Promise<{ ok: boolean; error?: string }>;
  onLogout: () => void;
}

type NavSection =
  | 'folders'
  | 'search'
  | 'wanted'
  | 'suspects'
  | 'criminal_records'
  | 'statistics'
  | 'history'
  | 'account_actions'
  | 'admin_setup';

interface DossierTarget {
  fullName: string;
  phone: string;
  idNumber: string;
  roleLabel: string;
  address: string;
  idFrontImage?: string;
  idBackImage?: string;
  portraitImage?: string;
}

interface PhotoMatchResult {
  id: string;
  confidence: number;
  samePersonLikely: boolean;
  reasonAmharic: string;
  label: string;
  category: string;
  imageBase64: string;
  personName: string;
  phone: string;
  idNumber: string;
  address: string;
}

export const PoliceAdminPortal: React.FC<PoliceAdminPortalProps> = ({
  isCloudConnected,
  lang,
  onToggleLang,
  firebaseUid,
  mode,
  actorName,
  adminUsername,
  officer,
  branding,
  jurisdictions,
  onLogout,
}) => {
  const t = DICT[lang];
  const isAdmin = mode === 'admin';
  const [section, setSection] = useState<NavSection>('folders');

  const [officers, setOfficers] = useState<PoliceOfficer[]>([]);
  const [landlords, setLandlords] = useState<Landlord[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [wantedPersons, setWantedPersons] = useState<WantedPerson[]>([]);
  const [wantedAlerts, setWantedAlerts] = useState<WantedAlert[]>([]);
  const [criminalRecords, setCriminalRecords] = useState<CriminalRecord[]>([]);
  const [history, setHistory] = useState<ActivityHistory[]>([]);

  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Folder Navigation State
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [selectedWoreda, setSelectedWoreda] = useState<string>('');
  const [selectedKebele, setSelectedKebele] = useState<string>('');
  const [policeTenantsOnly, setPoliceTenantsOnly] = useState(false);
  const [folderViewTab, setFolderViewTab] = useState<'tenants' | 'landlords'>('tenants');

  // Universal Search & Photo Match
  const [searchQuery, setSearchQuery] = useState('');
  const [photoQueryImg, setPhotoQueryImg] = useState('');
  const [photoMatches, setPhotoMatches] = useState<PhotoMatchResult[]>([]);
  const [photoSearching, setPhotoSearching] = useState(false);

  // Dossier Modal
  const [dossier, setDossier] = useState<DossierTarget | null>(null);

  // Wanted Person Form
  const [wName, setWName] = useState('');
  const [wPhone, setWPhone] = useState('');
  const [wFayda, setWFayda] = useState('');
  const [wPhoto, setWPhoto] = useState('');
  const [wCaseNo, setWCaseNo] = useState('');
  const [wPriority, setWPriority] = useState<'critical' | 'high' | 'medium'>('high');
  const [wReason, setWReason] = useState('');

  // Suspect Form (Dedicated)
  const [susName, setSusName] = useState('');
  const [susPhone, setSusPhone] = useState('');
  const [susFayda, setSusFayda] = useState('');
  const [susPhoto, setSusPhoto] = useState('');
  const [susOffense, setSusOffense] = useState('');
  const [susDesc, setSusDesc] = useState('');
  const [susCity, setSusCity] = useState(officer?.city || 'አሶሳ ከተማ');
  const [susWoreda, setSusWoreda] = useState(officer?.woreda || 'ወረዳ 1');
  const [susKebele, setSusKebele] = useState(officer?.kebele || 'ቀበሌ 01');
  const [susStation, setSusStation] = useState(
    officer ? `${officer.city} ${officer.woreda} ፖሊስ ጣቢያ` : 'አሶሳ ከተማ ፖሊስ መምሪያ'
  );
  const [susDate, setSusDate] = useState(new Date().toISOString().slice(0, 10));

  // Criminal / Arrest Record Form & Search/Filter
  const [crName, setCrName] = useState('');
  const [crPhone, setCrPhone] = useState('');
  const [crFayda, setCrFayda] = useState('');
  const [crPhoto, setCrPhoto] = useState('');
  const [crType, setCrType] = useState<RecordType>('arrested');
  const [crOffense, setCrOffense] = useState('');
  const [crDesc, setCrDesc] = useState('');
  const [crCity, setCrCity] = useState(officer?.city || 'አሶሳ ከተማ');
  const [crWoreda, setCrWoreda] = useState(officer?.woreda || 'ወረዳ 1');
  const [crKebele, setCrKebele] = useState(officer?.kebele || 'ቀበሌ 01');
  const [crStation, setCrStation] = useState(
    officer ? `${officer.city} ${officer.woreda} ፖሊስ ጣቢያ` : 'አሶሳ ከተማ ፖሊስ መምሪያ'
  );
  const [crDate, setCrDate] = useState(new Date().toISOString().slice(0, 10));
  const [editingCriminalRecordId, setEditingCriminalRecordId] = useState<string | null>(null);
  const [crSearchQuery, setCrSearchQuery] = useState('');
  const [crFilterType, setCrFilterType] = useState<'all' | RecordType>('all');
  const [crPhotoQueryImg, setCrPhotoQueryImg] = useState('');
  const [crPhotoMatches, setCrPhotoMatches] = useState<PhotoMatchResult[]>([]);
  const [crPhotoSearching, setCrPhotoSearching] = useState(false);

  // User Credentials Edit / Password Reset Form
  const [credTargetType, setCredTargetType] = useState<'landlord' | 'officer'>('landlord');
  const [credSearchName, setCredSearchName] = useState('');
  const [credSearchPhone, setCredSearchPhone] = useState('');
  const [credSelectedId, setCredSelectedId] = useState('');
  const [credNewUsername, setCredNewUsername] = useState('');
  const [credNewPass, setCredNewPass] = useState('');

  // Landlord Replacement Form
  const [repOldId, setRepOldId] = useState('');
  const [repNewName, setRepNewName] = useState('');
  const [repNewPhone, setRepNewPhone] = useState('');
  const [repNewFayda, setRepNewFayda] = useState('');
  const [repNewFront, setRepNewFront] = useState('');
  const [repNewBack, setRepNewBack] = useState('');

  // Admin: Create Officer Form
  const [offName, setOffName] = useState('');
  const [offRank, setOffRank] = useState('ሳጅን');
  const [offBadge, setOffBadge] = useState('');
  const [offPhone, setOffPhone] = useState('');
  const [offUsername, setOffUsername] = useState('');
  const [offEmail, setOffEmail] = useState('');
  const [offPass, setOffPass] = useState('');
  const [offLevel, setOffLevel] = useState<JurisdictionLevel>('woreda');
  const [offCity, setOffCity] = useState('አሶሳ ከተማ');
  const [offWoreda, setOffWoreda] = useState('ወረዳ 1');
  const [offKebele, setOffKebele] = useState('ቀበሌ 01');

  // Admin: Inline Edit Officer Credentials Modal/State
  const [editingOfficer, setEditingOfficer] = useState<PoliceOfficer | null>(null);
  const [editOffUsername, setEditOffUsername] = useState('');
  const [editOffPass, setEditOffPass] = useState('');
  const [editOffActive, setEditOffActive] = useState(true);

  // Admin: Logo / Flags / Branding Form
  const [brandName, setBrandName] = useState(branding.commissionName);
  const [brandSub, setBrandSub] = useState(branding.subtitle || '');
  const [brandLogo, setBrandLogo] = useState(branding.logoDataUrl);
  const [brandRegionalFlag, setBrandRegionalFlag] = useState(
    resolveRegionalFlagSrc(branding.regionalFlagDataUrl || DEFAULT_REGIONAL_FLAG_PATH)
  );
  const [brandEthiopianFlag, setBrandEthiopianFlag] = useState(
    resolveEthiopianFlagSrc(branding.ethiopianFlagDataUrl || DEFAULT_ETHIOPIAN_FLAG_PATH)
  );

  useEffect(() => {
    setBrandName(branding.commissionName);
    setBrandSub(branding.subtitle || '');
    setBrandLogo(branding.logoDataUrl);
    setBrandRegionalFlag(resolveRegionalFlagSrc(branding.regionalFlagDataUrl));
    setBrandEthiopianFlag(resolveEthiopianFlagSrc(branding.ethiopianFlagDataUrl));
  }, [branding]);

  // Admin: Jurisdictions (Region, Zone, City, Woreda, Kebele) Add & Edit
  const [jurRegion, setJurRegion] = useState(DEFAULT_REGION_NAME);
  const [jurZone, setJurZone] = useState('');
  const [jurCity, setJurCity] = useState('');
  const [jurWoreda, setJurWoreda] = useState('');
  const [jurKebele, setJurKebele] = useState('');
  const [jurSearch, setJurSearch] = useState('');
  const [editingJurId, setEditingJurId] = useState<string | null>(null);
  const [editJurRegion, setEditJurRegion] = useState('');
  const [editJurZone, setEditJurZone] = useState('');
  const [editJurCity, setEditJurCity] = useState('');
  const [editJurWoreda, setEditJurWoreda] = useState('');
  const [editJurKebele, setEditJurKebele] = useState('');

  // Admin: Own Username & Password Management
  const [adminCred, setAdminCred] = useState<AdminCredential | null>(null);
  const [admNewUsername, setAdmNewUsername] = useState(adminUsername || 'admin');
  const [admCurrentPass, setAdmCurrentPass] = useState('');
  const [admNewPass, setAdmNewPass] = useState('');
  const [admConfirmPass, setAdmConfirmPass] = useState('');

  useEffect(() => {
    if (!isCloudConnected) {
      const unsub = subscribeFallbackStore((data) => {
        setOfficers(data.officers);
        setLandlords(data.landlords);
        setTenants(data.tenants);
        setWantedPersons(data.wantedPersons);
        setWantedAlerts(data.wantedAlerts);
        setCriminalRecords(data.criminalRecords);
        setHistory(data.history);
        if (isAdmin) {
          setAdminCred(data.adminCredential);
          if (data.adminCredential?.username) {
            setAdmNewUsername(data.adminCredential.username);
          }
        }
      });
      return unsub;
    }

    const unsub = subscribePoliceData((data) => {
      setOfficers(data.officers);
      setLandlords(data.landlords);
      setTenants(data.tenants);
      setWantedPersons(data.wantedPersons);
      setWantedAlerts(data.wantedAlerts);
      setCriminalRecords(data.criminalRecords);
      setHistory(data.history);
    });
    return unsub;
  }, [isCloudConnected, isAdmin]);

  useEffect(() => {
    if (!isAdmin || !isCloudConnected) return;
    void ensureAdminCredentialsSeeded(firebaseUid).catch((err) => {
      console.warn('Admin credentials check:', err);
    });
    const unsub = subscribeAdminCredentials((cred) => {
      setAdminCred(cred);
      if (cred?.username) {
        setAdmNewUsername(cred.username);
      }
    });
    return unsub;
  }, [isAdmin, firebaseUid, isCloudConnected]);

  // Automatic Cross-Check of Wanted Persons against Tenants
  useEffect(() => {
    const activeWanted = wantedPersons.filter((w) => w.status === 'active');
    if (activeWanted.length === 0 || tenants.length === 0) return;

    for (const w of activeWanted) {
      for (const ten of tenants) {
        const matchReason = checkWantedMatch(w, ten);
        if (matchReason) {
          if (isCloudConnected) {
            void createWantedAlertIfMissing(firebaseUid, wantedAlerts, w, ten, matchReason);
          } else {
            void createFallbackWantedAlertIfMissing(firebaseUid, w, ten, matchReason);
          }
        }
      }
    }
  }, [wantedPersons, tenants, wantedAlerts, firebaseUid, isCloudConnected]);

  const matchesOfficerScope = (item: { city: string; woreda: string; kebele: string }) => {
    if (isAdmin || !officer || officer.jurisdictionLevel === 'regional') return true;
    if (officer.jurisdictionLevel === 'city') {
      return !officer.city || item.city === officer.city;
    }
    if (officer.jurisdictionLevel === 'woreda') {
      return (
        (!officer.city || item.city === officer.city) &&
        (!officer.woreda || item.woreda === officer.woreda)
      );
    }
    return (
      (!officer.city || item.city === officer.city) &&
      (!officer.woreda || item.woreda === officer.woreda) &&
      (!officer.kebele || item.kebele === officer.kebele)
    );
  };

  const scopedLandlords = useMemo(
    () => landlords.filter(matchesOfficerScope),
    [landlords, officer, isAdmin]
  );
  const scopedTenants = useMemo(
    () => tenants.filter(matchesOfficerScope),
    [tenants, officer, isAdmin]
  );
  const scopedAlerts = useMemo(
    () => wantedAlerts.filter(matchesOfficerScope),
    [wantedAlerts, officer, isAdmin]
  );
  const scopedHistory = useMemo(
    () => history.filter(matchesOfficerScope),
    [history, officer, isAdmin]
  );

  // Live Daily & Crime KPIs
  const todayIso = new Date().toISOString().slice(0, 10);
  const suspectsList = useMemo(
    () => criminalRecords.filter((c) => c.recordType === 'suspect'),
    [criminalRecords]
  );
  const filteredCriminalRecords = useMemo(() => {
    const q = normalizeText(crSearchQuery);
    const qPhone = normalizePhone(crSearchQuery);
    return criminalRecords.filter((c) => {
      if (crFilterType !== 'all' && c.recordType !== crFilterType) return false;
      if (!q && !qPhone) return true;
      return (
        normalizeText(c.personName).includes(q) ||
        normalizeText(c.faydaId || '').includes(q) ||
        normalizeText(c.recordId).includes(q) ||
        normalizeText(c.offenseTitle).includes(q) ||
        (qPhone.length >= 3 && normalizePhone(c.phone || '').includes(qPhone))
      );
    });
  }, [criminalRecords, crSearchQuery, crFilterType]);
  const totalArrestedList = useMemo(
    () =>
      criminalRecords.filter(
        (c) => c.recordType === 'arrested' || c.recordType === 'convicted'
      ),
    [criminalRecords]
  );
  const arrestedTodayCount = useMemo(
    () =>
      totalArrestedList.filter((c) => {
        const d = toJsDate(c.createdAt);
        return c.incidentDate === todayIso || (d && d.toISOString().slice(0, 10) === todayIso);
      }).length,
    [totalArrestedList, todayIso]
  );
  const repeatOffendersCount = useMemo(
    () => computeRepeatOffendersCount(criminalRecords),
    [criminalRecords]
  );

  // Folder Hierarchy Structure (City -> Woreda -> Kebele)
  const folderTree = useMemo(() => {
    const cityMap = new Map<
      string,
      {
        landlords: number;
        tenants: number;
        rooms: number;
        policeTenants: number;
        woredas: Map<
          string,
          {
            landlords: number;
            tenants: number;
            rooms: number;
            policeTenants: number;
            kebeles: Map<
              string,
              { landlords: number; tenants: number; rooms: number; policeTenants: number }
            >;
          }
        >;
      }
    >();

    const ensurePath = (city: string, woreda: string, kebele: string) => {
      if (!cityMap.has(city)) {
        cityMap.set(city, {
          landlords: 0,
          tenants: 0,
          rooms: 0,
          policeTenants: 0,
          woredas: new Map(),
        });
      }
      const cObj = cityMap.get(city)!;
      if (!cObj.woredas.has(woreda)) {
        cObj.woredas.set(woreda, {
          landlords: 0,
          tenants: 0,
          rooms: 0,
          policeTenants: 0,
          kebeles: new Map(),
        });
      }
      const wObj = cObj.woredas.get(woreda)!;
      if (!wObj.kebeles.has(kebele)) {
        wObj.kebeles.set(kebele, { landlords: 0, tenants: 0, rooms: 0, policeTenants: 0 });
      }
      return { cObj, wObj, kObj: wObj.kebeles.get(kebele)! };
    };

    for (const j of jurisdictions) {
      if (matchesOfficerScope(j)) {
        ensurePath(j.city, j.woreda, j.kebele);
      }
    }

    for (const l of scopedLandlords) {
      const { cObj, wObj, kObj } = ensurePath(l.city, l.woreda, l.kebele);
      const rooms = Number(l.roomCount) || 0;
      cObj.landlords += 1;
      cObj.rooms += rooms;
      wObj.landlords += 1;
      wObj.rooms += rooms;
      kObj.landlords += 1;
      kObj.rooms += rooms;
    }

    for (const ten of scopedTenants) {
      const { cObj, wObj, kObj } = ensurePath(ten.city, ten.woreda, ten.kebele);
      cObj.tenants += 1;
      wObj.tenants += 1;
      kObj.tenants += 1;
      if (ten.isPoliceTenant) {
        cObj.policeTenants += 1;
        wObj.policeTenants += 1;
        kObj.policeTenants += 1;
      }
    }

    return cityMap;
  }, [jurisdictions, scopedLandlords, scopedTenants, officer, isAdmin]);

  const folderFilteredTenants = useMemo(() => {
    return scopedTenants.filter((ten) => {
      if (selectedCity && ten.city !== selectedCity) return false;
      if (selectedWoreda && ten.woreda !== selectedWoreda) return false;
      if (selectedKebele && ten.kebele !== selectedKebele) return false;
      if (policeTenantsOnly && !ten.isPoliceTenant) return false;
      return true;
    });
  }, [scopedTenants, selectedCity, selectedWoreda, selectedKebele, policeTenantsOnly]);

  const folderFilteredLandlords = useMemo(() => {
    return scopedLandlords.filter((l) => {
      if (selectedCity && l.city !== selectedCity) return false;
      if (selectedWoreda && l.woreda !== selectedWoreda) return false;
      if (selectedKebele && l.kebele !== selectedKebele) return false;
      return true;
    });
  }, [scopedLandlords, selectedCity, selectedWoreda, selectedKebele]);

  // Universal Search Results across ALL records
  const textSearchResults = useMemo(() => {
    const q = normalizeText(searchQuery);
    const qPhone = normalizePhone(searchQuery);
    if (!q && !qPhone) return { tenants: [], landlords: [], wanted: [], crimes: [] };

    const matchStr = (val?: string) => normalizeText(val || '').includes(q);
    const matchPhone = (val?: string) =>
      qPhone.length >= 3 && normalizePhone(val || '').includes(qPhone);

    return {
      tenants: tenants.filter(
        (ten) =>
          matchStr(ten.fullName) ||
          matchStr(ten.idNumber) ||
          matchPhone(ten.phone) ||
          (ten.coResidents || []).some((c) => matchStr(c))
      ),
      landlords: landlords.filter(
        (l) => matchStr(l.fullName) || matchStr(l.faydaId) || matchPhone(l.phone)
      ),
      wanted: wantedPersons.filter(
        (w) => matchStr(w.fullName) || matchStr(w.faydaId) || matchPhone(w.phone)
      ),
      crimes: criminalRecords.filter(
        (c) => matchStr(c.personName) || matchStr(c.faydaId) || matchPhone(c.phone)
      ),
    };
  }, [searchQuery, tenants, landlords, wantedPersons, criminalRecords]);

  // Dossier matching criminal records & history
  const dossierCrimes = useMemo(() => {
    if (!dossier) return [];
    const dName = normalizeText(dossier.fullName);
    const dPhone = normalizePhone(dossier.phone);
    const dId = normalizeText(dossier.idNumber);
    return criminalRecords.filter((c) => {
      if (dId && c.faydaId && normalizeText(c.faydaId) === dId) return true;
      if (dPhone && c.phone && dPhone.length >= 8 && normalizePhone(c.phone) === dPhone) return true;
      if (dName && normalizeText(c.personName).includes(dName)) return true;
      return false;
    });
  }, [dossier, criminalRecords]);

  const dossierWanted = useMemo(() => {
    if (!dossier) return [];
    const dName = normalizeText(dossier.fullName);
    const dPhone = normalizePhone(dossier.phone);
    const dId = normalizeText(dossier.idNumber);
    return wantedPersons.filter((w) => {
      if (dId && w.faydaId && normalizeText(w.faydaId) === dId) return true;
      if (dPhone && w.phone && dPhone.length >= 8 && normalizePhone(w.phone) === dPhone) return true;
      if (dName && w.fullName && normalizeText(w.fullName).includes(dName)) return true;
      return false;
    });
  }, [dossier, wantedPersons]);

  const dossierHistory = useMemo(() => {
    if (!dossier) return [];
    const dName = normalizeText(dossier.fullName);
    const dPhone = normalizePhone(dossier.phone);
    const dId = normalizeText(dossier.idNumber);
    return history.filter((h) => {
      if (dId && h.subjectIdNumber && normalizeText(h.subjectIdNumber) === dId) return true;
      if (dPhone && h.subjectPhone && dPhone.length >= 8 && normalizePhone(h.subjectPhone) === dPhone)
        return true;
      if (dName && normalizeText(h.subjectName).includes(dName)) return true;
      return false;
    });
  }, [dossier, history]);

  async function handlePhotoSearch() {
    if (!photoQueryImg) return;
    setPhotoSearching(true);
    setErrorMsg('');
    setPhotoMatches([]);
    try {
      const candidates: Array<{
        id: string;
        label: string;
        category: string;
        imageBase64: string;
        personName: string;
        phone: string;
        idNumber: string;
        address: string;
      }> = [];

      wantedPersons.forEach((w) => {
        if (w.photoImage) {
          candidates.push({
            id: w.wantedId,
            label: `${w.fullName || 'ተፈላጊ'} (${w.caseNumber})`,
            category: 'በህግ የሚፈለግ',
            imageBase64: w.photoImage,
            personName: w.fullName || 'በፎቶ የተመዘገበ ተፈላጊ',
            phone: w.phone,
            idNumber: w.faydaId,
            address: 'የተፈላጊ መዝገብ',
          });
        }
      });
      criminalRecords.forEach((c) => {
        if (c.photoImage) {
          candidates.push({
            id: c.recordId,
            label: `${c.personName} (${c.offenseTitle})`,
            category: c.recordType === 'suspect' ? 'ተጠርጣሪ' : 'የወንጀል ሪከርድ',
            imageBase64: c.photoImage,
            personName: c.personName,
            phone: c.phone || '',
            idNumber: c.faydaId || '',
            address: `${c.city} / ${c.woreda} / ${c.kebele}`,
          });
        }
      });
      tenants.forEach((ten) => {
        const img = ten.portraitImage || ten.idFrontImage;
        if (img) {
          candidates.push({
            id: ten.tenantId,
            label: `${ten.fullName} (ተከራይ)`,
            category: 'ተከራይ',
            imageBase64: img,
            personName: ten.fullName,
            phone: ten.phone,
            idNumber: ten.idNumber,
            address: `${ten.city} / ${ten.woreda} / ${ten.kebele} (ቤት ${ten.houseNumber})`,
          });
        }
      });
      landlords.forEach((l) => {
        if (l.idFrontImage) {
          candidates.push({
            id: l.landlordId,
            label: `${l.fullName} (አከራይ)`,
            category: 'አከራይ',
            imageBase64: l.idFrontImage,
            personName: l.fullName,
            phone: l.phone,
            idNumber: l.faydaId,
            address: `${l.city} / ${l.woreda} / ${l.kebele} (ቤት ${l.houseNumber})`,
          });
        }
      });

      const res = await fetch('/api/photo-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queryImageBase64: photoQueryImg,
          candidates: candidates.slice(0, 20).map((c) => ({
            id: c.id,
            label: c.label,
            category: c.category,
            imageBase64: c.imageBase64,
          })),
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        matches?: Array<{
          id: string;
          confidence: number;
          samePersonLikely: boolean;
          reasonAmharic: string;
        }>;
      };
      if (!res.ok) {
        throw new Error(json.error || 'የፎቶ ፍለጋው አልተሳካም');
      }

      const merged: PhotoMatchResult[] = (json.matches || [])
        .map((m) => {
          const cand = candidates.find((c) => c.id === m.id);
          if (!cand) return null;
          return { ...m, ...cand };
        })
        .filter((x): x is PhotoMatchResult => x !== null)
        .sort((a, b) => b.confidence - a.confidence);
      setPhotoMatches(merged);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'የፎቶ ፍለጋ ስህተት');
    } finally {
      setPhotoSearching(false);
    }
  }

  async function handleCriminalRecordPhotoSearch() {
    if (!crPhotoQueryImg) return;
    setCrPhotoSearching(true);
    setErrorMsg('');
    setCrPhotoMatches([]);
    try {
      const candidates: Array<{
        id: string;
        label: string;
        category: string;
        imageBase64: string;
        personName: string;
        phone: string;
        idNumber: string;
        address: string;
      }> = [];

      criminalRecords.forEach((c) => {
        if (c.photoImage) {
          candidates.push({
            id: c.recordId,
            label: `${c.personName} (${c.offenseTitle})`,
            category: c.recordType === 'suspect' ? t.statusSuspect : c.recordType,
            imageBase64: c.photoImage,
            personName: c.personName,
            phone: c.phone || '',
            idNumber: c.faydaId || '',
            address: `${c.city} / ${c.woreda} / ${c.kebele}`,
          });
        }
      });
      wantedPersons.forEach((w) => {
        if (w.photoImage) {
          candidates.push({
            id: w.wantedId,
            label: `${w.fullName || 'ተፈላጊ'} (${w.caseNumber})`,
            category: 'Wanted',
            imageBase64: w.photoImage,
            personName: w.fullName || w.caseNumber,
            phone: w.phone,
            idNumber: w.faydaId,
            address: 'Wanted Board',
          });
        }
      });

      if (candidates.length === 0) {
        setErrorMsg(
          lang === 'am'
            ? 'ፎቶ ያለው የተመዘገበ የወንጀል ወይም የተጠርጣሪ ሪከርድ የለም።'
            : 'No criminal or suspect records with photos exist yet.'
        );
        return;
      }

      const res = await fetch('/api/photo-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queryImageBase64: crPhotoQueryImg,
          candidates: candidates.slice(0, 20).map((c) => ({
            id: c.id,
            label: c.label,
            category: c.category,
            imageBase64: c.imageBase64,
          })),
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        matches?: Array<{
          id: string;
          confidence: number;
          samePersonLikely: boolean;
          reasonAmharic: string;
        }>;
      };
      if (!res.ok) {
        throw new Error(json.error || 'የፎቶ ፍለጋው አልተሳካም');
      }

      const merged: PhotoMatchResult[] = (json.matches || [])
        .map((m) => {
          const cand = candidates.find((c) => c.id === m.id);
          if (!cand) return null;
          return { ...m, ...cand };
        })
        .filter((x): x is PhotoMatchResult => x !== null)
        .sort((a, b) => b.confidence - a.confidence);
      setCrPhotoMatches(merged);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'የፎቶ ፍለጋ ስህተት');
    } finally {
      setCrPhotoSearching(false);
    }
  }

  function startCriminalOrSuspectTagFromPerson(person: {
    fullName: string;
    phone?: string;
    idNumber?: string;
    photo?: string;
    city?: string;
    woreda?: string;
    kebele?: string;
    type: RecordType;
  }) {
    setCrName(person.fullName);
    setCrPhone(person.phone && person.phone !== '-' ? person.phone : '');
    setCrFayda(person.idNumber && person.idNumber !== '-' ? person.idNumber : '');
    setCrPhoto(person.photo || '');
    setCrType(person.type);
    if (person.city) setCrCity(person.city);
    if (person.woreda) setCrWoreda(person.woreda);
    if (person.kebele) setCrKebele(person.kebele);
    setDossier(null);
    setSection('criminal_records');
  }

  async function handleSaveWanted(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    setStatusMsg('');
    if (!wName.trim() && !wPhone.trim() && !wFayda.trim() && !wPhoto) {
      setErrorMsg('ቢያንስ ከስም፣ ስልክ፣ ፋይዳ ወይም ፎቶ አንዱን ያስገቡ።');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        fullName: wName,
        phone: wPhone,
        faydaId: wFayda,
        photoImage: wPhoto || undefined,
        reason: wReason,
        caseNumber: wCaseNo || `BG-${Date.now().toString().slice(-5)}`,
        priority: wPriority,
        city: officer?.city || 'አሶሳ ከተማ',
        woreda: officer?.woreda || 'ወረዳ 1',
        kebele: officer?.kebele || 'ቀበሌ 01',
      };
      if (isCloudConnected) {
        await createWantedPerson(firebaseUid, actorName, officer?.officerId, payload);
      } else {
        await createFallbackWantedPerson(firebaseUid, actorName, officer?.officerId, payload);
      }
      setWName('');
      setWPhone('');
      setWFayda('');
      setWPhoto('');
      setWCaseNo('');
      setWReason('');
      setStatusMsg('በህግ የሚፈለግ ግለሰብ በተፈላጊ ሰሌዳ ላይ ተመዝግቧል።');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'መመዝገብ አልተቻለም');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveSuspect(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    setStatusMsg('');
    setBusy(true);
    try {
      const payload = {
        personName: susName,
        phone: susPhone,
        faydaId: susFayda,
        photoImage: susPhoto || undefined,
        recordType: 'suspect' as const,
        offenseTitle: susOffense,
        description: susDesc,
        city: susCity,
        woreda: susWoreda,
        kebele: susKebele,
        stationName: susStation,
        incidentDate: susDate,
      };
      if (isCloudConnected) {
        await createCriminalRecord(firebaseUid, actorName, officer?.officerId, payload);
      } else {
        await createFallbackCriminalRecord(firebaseUid, actorName, officer?.officerId, payload);
      }
      setSusName('');
      setSusPhone('');
      setSusFayda('');
      setSusPhoto('');
      setSusOffense('');
      setSusDesc('');
      setStatusMsg('ተጠርጣሪው በተጠርጣሪዎች መዝገብ ውስጥ በተሳካ ሁኔታ ተመዝግቧል።');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'መመዝገብ አልተቻለም');
    } finally {
      setBusy(false);
    }
  }

  function resetCriminalRecordForm() {
    setEditingCriminalRecordId(null);
    setCrName('');
    setCrPhone('');
    setCrFayda('');
    setCrPhoto('');
    setCrType('arrested');
    setCrOffense('');
    setCrDesc('');
    setCrCity(officer?.city || 'አሶሳ ከተማ');
    setCrWoreda(officer?.woreda || 'ወረዳ 1');
    setCrKebele(officer?.kebele || 'ቀበሌ 01');
    setCrStation(
      officer ? `${officer.city} ${officer.woreda} ፖሊስ ጣቢያ` : 'አሶሳ ከተማ ፖሊስ መምሪያ'
    );
    setCrDate(new Date().toISOString().slice(0, 10));
  }

  function startEditCriminalRecord(rec: CriminalRecord) {
    setEditingCriminalRecordId(rec.recordId);
    setCrName(rec.personName);
    setCrPhone(rec.phone || '');
    setCrFayda(rec.faydaId || '');
    setCrPhoto(rec.photoImage || '');
    setCrType(rec.recordType);
    setCrOffense(rec.offenseTitle);
    setCrDesc(rec.description);
    setCrCity(rec.city);
    setCrWoreda(rec.woreda);
    setCrKebele(rec.kebele);
    setCrStation(rec.stationName);
    setCrDate(rec.incidentDate);
    setSection('criminal_records');
  }

  async function handleSaveCriminalRecord(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    setStatusMsg('');
    setBusy(true);
    try {
      const payload = {
        personName: crName,
        phone: crPhone,
        faydaId: crFayda,
        photoImage: crPhoto || undefined,
        recordType: crType,
        offenseTitle: crOffense,
        description: crDesc,
        city: crCity,
        woreda: crWoreda,
        kebele: crKebele,
        stationName: crStation,
        incidentDate: crDate,
      };
      if (editingCriminalRecordId) {
        if (isCloudConnected) {
          await updateCriminalRecord(firebaseUid, actorName, editingCriminalRecordId, payload);
        } else {
          await updateFallbackCriminalRecord(
            firebaseUid,
            actorName,
            editingCriminalRecordId,
            payload
          );
        }
        resetCriminalRecordForm();
        setStatusMsg(
          lang === 'am'
            ? 'የወንጀል / የተጠርጣሪ ሪከርድ በተሳካ ሁኔታ ተስተካክሏል።'
            : 'Criminal / suspect record updated successfully.'
        );
      } else {
        if (isCloudConnected) {
          await createCriminalRecord(firebaseUid, actorName, officer?.officerId, payload);
        } else {
          await createFallbackCriminalRecord(firebaseUid, actorName, officer?.officerId, payload);
        }
        resetCriminalRecordForm();
        setStatusMsg('የእስር እና የወንጀል ሪከርድ መዝገብ ተቀምጧል።');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'መመዝገብ አልተቻለም');
    } finally {
      setBusy(false);
    }
  }

  const credCandidates = useMemo(() => {
    const qName = normalizeText(credSearchName);
    const qPhone = normalizePhone(credSearchPhone);
    if (credTargetType === 'landlord') {
      return landlords
        .filter(
          (l) =>
            (!qName || normalizeText(l.fullName).includes(qName)) &&
            (!qPhone || normalizePhone(l.phone).includes(qPhone))
        )
        .map((l) => ({
          id: l.landlordId,
          name: l.fullName,
          username: l.phone,
          phone: l.phone,
          city: l.city,
          woreda: l.woreda,
          kebele: l.kebele,
        }));
    }
    return officers
      .filter(
        (o) =>
          (!qName ||
            normalizeText(o.fullName).includes(qName) ||
            normalizeText(o.username).includes(qName)) &&
          (!qPhone || normalizePhone(o.phone).includes(qPhone))
      )
      .map((o) => ({
        id: o.officerId,
        name: o.fullName,
        username: o.username,
        phone: o.phone,
        city: o.city,
        woreda: o.woreda,
        kebele: o.kebele,
      }));
  }, [credTargetType, credSearchName, credSearchPhone, landlords, officers]);

  async function handleUpdateUserCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault();
    const target = credCandidates.find((c) => c.id === credSelectedId);
    if (!target) {
      setErrorMsg('እባክዎ ተጠቃሚ ይምረጡ።');
      return;
    }
    if (!credNewUsername.trim() && !credNewPass) {
      setErrorMsg('ቢያንስ አዲስ ዩዘርኔም ወይም አዲስ የይለፍ ቃል ያስገቡ።');
      return;
    }
    if (credNewPass && credNewPass.length < 4) {
      setErrorMsg('የይለፍ ቃል ቢያንስ 4 ቁምፊ መሆን አለበት።');
      return;
    }

    setBusy(true);
    setErrorMsg('');
    try {
      if (credTargetType === 'officer') {
        const off = officers.find((o) => o.officerId === target.id);
        if (!off) throw new Error('Officer not found');
        const upd = {
          newUsername: credNewUsername.trim() || off.username,
          newPassword: credNewPass || undefined,
        };
        if (isCloudConnected) {
          await updateOfficerCredentials(firebaseUid, actorName, off, upd);
        } else {
          await updateFallbackOfficerCredentials(firebaseUid, actorName, off, upd);
        }
      } else {
        const ll = landlords.find((l) => l.landlordId === target.id);
        if (!ll) throw new Error('Landlord not found');
        const upd = {
          newPhone: credNewUsername.trim() || ll.phone,
          newPassword: credNewPass || undefined,
        };
        if (isCloudConnected) {
          await updateLandlordCredentials(
            firebaseUid,
            isAdmin ? 'admin' : 'police',
            actorName,
            ll,
            upd
          );
        } else {
          await updateFallbackLandlordCredentials(
            firebaseUid,
            isAdmin ? 'admin' : 'police',
            actorName,
            ll,
            upd
          );
        }
      }
      setCredNewPass('');
      setStatusMsg(`የ ${target.name} ዩዘርኔም እና የይለፍ ቃል በተሳካ ሁኔታ ተስተካክሏል።`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ማስተካከል አልተቻለም');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteSelectedAccount() {
    if (!isAdmin || !credSelectedId) return;
    setBusy(true);
    setErrorMsg('');
    try {
      if (credTargetType === 'officer') {
        const off = officers.find((o) => o.officerId === credSelectedId);
        if (off) {
          if (isCloudConnected) {
            await deleteOfficerAccount(firebaseUid, actorName, off);
          } else {
            await deleteFallbackOfficerAccount(firebaseUid, actorName, off);
          }
          setStatusMsg(`የፖሊስ መለያ (${off.fullName}) ተሰርዟል።`);
        }
      } else {
        const ll = landlords.find((l) => l.landlordId === credSelectedId);
        if (ll) {
          if (isCloudConnected) {
            await deleteLandlordAccount(firebaseUid, actorName, ll);
          } else {
            await deleteFallbackLandlordAccount(firebaseUid, actorName, ll);
          }
          setStatusMsg(`የአከራይ መለያ (${ll.fullName}) ተሰርዟል።`);
        }
      }
      setCredSelectedId('');
      setCredNewUsername('');
      setCredNewPass('');
      setConfirmDeleteId(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'መሰረዝ አልተቻለም');
    } finally {
      setBusy(false);
    }
  }

  async function handleReplaceLandlordSubmit(e: React.FormEvent) {
    e.preventDefault();
    const oldLl = landlords.find((l) => l.landlordId === repOldId);
    if (!oldLl || !repNewName.trim() || !repNewPhone.trim() || !repNewFayda.trim() || !repNewFront || !repNewBack) {
      setErrorMsg('እባክዎ የቀድሞውን አከራይ ይምረጡ እና የአዲሱን አከራይ ስም፣ ስልክ እና የፊት/ኋላ መታወቂያ ያስገቡ።');
      return;
    }
    setBusy(true);
    setErrorMsg('');
    try {
      const assocTenants = tenants.filter((item) => item.landlordId === oldLl.landlordId);
      const ownerPayload = {
        fullName: repNewName,
        phone: repNewPhone,
        faydaId: repNewFayda,
        idFrontImage: repNewFront,
        idBackImage: repNewBack,
      };
      if (isCloudConnected) {
        await replaceLandlordOwner(
          firebaseUid,
          isAdmin ? 'admin' : 'police',
          actorName,
          oldLl,
          ownerPayload,
          assocTenants
        );
      } else {
        await replaceFallbackLandlordOwner(
          firebaseUid,
          isAdmin ? 'admin' : 'police',
          actorName,
          oldLl,
          ownerPayload
        );
      }
      setRepNewName('');
      setRepNewPhone('');
      setRepNewFayda('');
      setRepNewFront('');
      setRepNewBack('');
      setStatusMsg(`የቀድሞ አከራይ ${oldLl.fullName} ስም ወጥቶ በአዲሱ አከራይ ተተክቷል፤ ታሪኩም ተመዝግቧል።`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'መቀየር አልተቻለም');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateOfficerSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!offName.trim() || !offUsername.trim() || offPass.length < 4) {
      setErrorMsg('እባክዎ የኦፊሰሩን ስም፣ ዩዘርኔም እና የይለፍ ቃል ይሙሉ።');
      return;
    }
    setBusy(true);
    setErrorMsg('');
    try {
      const payload = {
        fullName: offName,
        rank: offRank,
        badgeNumber: offBadge || `BG-${Date.now().toString().slice(-4)}`,
        phone: offPhone,
        username: offUsername,
        officerEmail: offEmail,
        password: offPass,
        jurisdictionLevel: offLevel,
        city: offCity,
        woreda: offLevel === 'city' || offLevel === 'regional' ? '' : offWoreda,
        kebele: offLevel === 'kebele' ? offKebele : '',
      };
      if (isCloudConnected) {
        await createPoliceOfficer(firebaseUid, payload);
      } else {
        await createFallbackPoliceOfficer(firebaseUid, payload);
      }
      setOffName('');
      setOffBadge('');
      setOffPhone('');
      setOffUsername('');
      setOffEmail('');
      setOffPass('');
      setStatusMsg('አዲስ የፖሊስ ኦፊሰር መለያ እና አድራሻ በተሳካ ሁኔታ ተከፍቷል።');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'መክፈት አልተቻለም');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveInlineOfficerEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingOfficer) return;
    setBusy(true);
    setErrorMsg('');
    try {
      const upd = {
        newUsername: editOffUsername,
        newPassword: editOffPass || undefined,
        active: editOffActive,
      };
      if (isCloudConnected) {
        await updateOfficerCredentials(firebaseUid, actorName, editingOfficer, upd);
      } else {
        await updateFallbackOfficerCredentials(firebaseUid, actorName, editingOfficer, upd);
      }
      setStatusMsg(`የ ${editingOfficer.fullName} ዩዘርኔም (${editOffUsername}) እና መግቢያ ተስተካክሏል።`);
      setEditingOfficer(null);
      setEditOffPass('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ማስተካከል አልተቻለም');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveBrandingSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrorMsg('');
    try {
      const payload = {
        commissionName: brandName,
        subtitle: brandSub,
        logoDataUrl: brandLogo,
        regionalFlagDataUrl: brandRegionalFlag,
        ethiopianFlagDataUrl: brandEthiopianFlag,
      };
      if (isCloudConnected) {
        await saveBranding(firebaseUid, payload);
      } else {
        await saveFallbackBranding(firebaseUid, payload);
      }
      setStatusMsg('የፖሊስ ኮሚሽን ሎጎ፣ የክልል እና የኢትዮጵያ ሰንደቅአላማ በመላው ሲስተሙ (የመግቢያ ገፅን ጨምሮ) ተቀይሯል።');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ሎጎ መቀየር አልተቻለም');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveAdminCredSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    setStatusMsg('');
    if (!admCurrentPass) {
      setErrorMsg('እባክዎ ለማረጋገጫ የአሁኑን የይለፍ ቃል ያስገቡ።');
      return;
    }
    if (!admNewUsername.trim()) {
      setErrorMsg('እባክዎ የአድሚን ዩዘርኔም ያስገቡ።');
      return;
    }
    if (admNewPass && admNewPass !== admConfirmPass) {
      setErrorMsg('አዲሱ የይለፍ ቃል እና ማረጋገጫው አይመሳሰሉም።');
      return;
    }

    setBusy(true);
    try {
      const params = {
        adminUid: firebaseUid,
        actorName,
        currentPassword: admCurrentPass,
        newUsername: admNewUsername,
        newPassword: admNewPass || undefined,
      };
      const updated = isCloudConnected
        ? await updateAdminCredentials(params)
        : await updateFallbackAdminCredentials(params);
      setAdmCurrentPass('');
      setAdmNewPass('');
      setAdmConfirmPass('');
      setStatusMsg(
        `የአድሚን መግቢያ ዩዘርኔም (${updated.username}) እና የይለፍ ቃል በተሳካ ሁኔታ ተስተካክሏል።`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'የአድሚን መለያ ማስተካከል አልተቻለም');
    } finally {
      setBusy(false);
    }
  }

  async function handleAlertStatusUpdate(
    alertId: string,
    status: 'unread' | 'acknowledged' | 'resolved'
  ) {
    if (isCloudConnected) {
      await updateAlertStatus(alertId, status);
    } else {
      await updateFallbackAlertStatus(alertId, status);
    }
  }

  async function handleWantedStatusChange(
    wantedId: string,
    status: 'active' | 'captured' | 'closed'
  ) {
    if (isCloudConnected) {
      await updateWantedStatus(wantedId, status);
    } else {
      await updateFallbackWantedStatus(wantedId, status);
    }
  }

  async function handleDeleteWanted(w: WantedPerson) {
    if (isCloudConnected) {
      await deleteWantedPerson(firebaseUid, actorName, w);
    } else {
      await deleteFallbackWantedPerson(firebaseUid, actorName, w);
    }
  }

  async function handleCriminalTypeChange(recordId: string, recordType: RecordType) {
    if (isCloudConnected) {
      await updateCriminalRecordType(recordId, recordType);
    } else {
      await updateFallbackCriminalRecordType(recordId, recordType);
    }
  }

  async function handleDeleteCriminal(c: CriminalRecord) {
    if (isCloudConnected) {
      await deleteCriminalRecord(firebaseUid, actorName, c);
    } else {
      await deleteFallbackCriminalRecord(firebaseUid, actorName, c);
    }
  }

  async function handleDeleteOfficer(o: PoliceOfficer) {
    if (isCloudConnected) {
      await deleteOfficerAccount(firebaseUid, actorName, o);
    } else {
      await deleteFallbackOfficerAccount(firebaseUid, actorName, o);
    }
  }

  async function handleAddJurisdictionSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!jurCity.trim() || !jurWoreda.trim() || !jurKebele.trim()) {
      setErrorMsg('እባክዎ ከተማ፣ ወረዳ እና ቀበሌ ይሙሉ።');
      return;
    }
    setBusy(true);
    setErrorMsg('');
    try {
      const payload = {
        region: jurRegion.trim() || DEFAULT_REGION_NAME,
        zone: jurZone.trim() || inferZoneForCity(jurCity),
        city: jurCity.trim(),
        woreda: jurWoreda.trim(),
        kebele: jurKebele.trim(),
      };
      if (isCloudConnected) {
        await addJurisdiction(firebaseUid, payload);
      } else {
        await addFallbackJurisdiction(firebaseUid, payload);
      }
      setJurKebele('');
      setStatusMsg('አዲስ ክልል / ዞን / ከተማ / ወረዳ / ቀበሌ በተሳካ ሁኔታ ተጨምሯል።');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'አድራሻ መጨመር አልተቻለም');
    } finally {
      setBusy(false);
    }
  }

  function startEditJurisdiction(j: Jurisdiction) {
    setEditingJurId(j.id);
    setEditJurRegion(j.region || DEFAULT_REGION_NAME);
    setEditJurZone(j.zone || inferZoneForCity(j.city));
    setEditJurCity(j.city);
    setEditJurWoreda(j.woreda);
    setEditJurKebele(j.kebele);
  }

  async function handleSaveJurisdictionEdit(j: Jurisdiction) {
    if (!editJurCity.trim() || !editJurWoreda.trim() || !editJurKebele.trim()) {
      setErrorMsg('እባክዎ ከተማ፣ ወረዳ እና ቀበሌ ይሙሉ።');
      return;
    }
    setBusy(true);
    setErrorMsg('');
    try {
      const updates = {
        region: editJurRegion.trim() || DEFAULT_REGION_NAME,
        zone: editJurZone.trim() || inferZoneForCity(editJurCity),
        city: editJurCity.trim(),
        woreda: editJurWoreda.trim(),
        kebele: editJurKebele.trim(),
      };
      if (isCloudConnected) {
        if (j.createdByUid === 'seed') {
          await seedDefaultJurisdictionsIfEmpty(firebaseUid);
        }
        await updateJurisdiction(j.id, updates);
      } else {
        await updateFallbackJurisdiction(j.id, updates);
      }
      setEditingJurId(null);
      setStatusMsg('ክልል / ዞን / ከተማ / ወረዳ / ቀበሌ በተሳካ ሁኔታ ተስተካክሏል።');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'አድራሻ ማስተካከል አልተቻለም');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteJurisdictionRow(j: Jurisdiction) {
    setBusy(true);
    setErrorMsg('');
    try {
      if (isCloudConnected) {
        if (j.createdByUid === 'seed') {
          await seedDefaultJurisdictionsIfEmpty(firebaseUid);
        }
        await deleteJurisdiction(j.id);
      } else {
        await deleteFallbackJurisdiction(j.id);
      }
      if (editingJurId === j.id) {
        setEditingJurId(null);
      }
      setStatusMsg('አድራሻው ተሰርዟል።');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'አድራሻ መሰረዝ አልተቻለም');
    } finally {
      setBusy(false);
    }
  }

  const filteredJurisdictions = useMemo(() => {
    const q = normalizeText(jurSearch);
    if (!q) return jurisdictions;
    return jurisdictions.filter(
      (j) =>
        normalizeText(j.region || DEFAULT_REGION_NAME).includes(q) ||
        normalizeText(j.zone || inferZoneForCity(j.city)).includes(q) ||
        normalizeText(j.city).includes(q) ||
        normalizeText(j.woreda).includes(q) ||
        normalizeText(j.kebele).includes(q)
    );
  }, [jurisdictions, jurSearch]);

  const unreadAlerts = scopedAlerts.filter((a) => a.status === 'unread');
  const policeTenantsCount = scopedTenants.filter((item) => item.isPoliceTenant).length;
  const allCities = useMemo(
    () => Array.from(new Set(jurisdictions.map((j) => j.city))),
    [jurisdictions]
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top 3-Zone Header */}
      <header className="bg-white border-b border-slate-200 px-3 sm:px-6 py-2.5 sm:py-3 no-print">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <BrandingImage
              src={branding.logoDataUrl}
              alt={branding.commissionName}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover border border-slate-200 shrink-0"
            />
            <span className="text-xs sm:text-base font-bold text-slate-900 whitespace-nowrap truncate">
              {branding.commissionName}
            </span>
          </div>

          <div className="hidden lg:flex items-center gap-2 text-xs text-slate-600">
            <span className="font-semibold text-slate-900">{actorName}</span>
            <span aria-hidden="true">·</span>
            <span>
              {isAdmin
                ? `ክልል ዋና አድሚን (${adminCred?.username || adminUsername || 'admin'})`
                : `${officer?.rank || 'ኦፊሰር'} — ${officer?.city || ''} ${officer?.woreda || ''} ${officer?.kebele || ''}`}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onToggleLang}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[42px] text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl whitespace-nowrap shrink-0 transition-colors"
            >
              <Globe className="w-3.5 h-3.5" />
              {t.langToggle}
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[42px] text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl whitespace-nowrap shrink-0 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              {t.logout}
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-[1440px] w-full mx-auto flex flex-col lg:flex-row">
        {/* Sidebar / Mobile Sticky Navigation */}
        <aside className="sticky top-0 z-30 lg:static lg:w-64 bg-white/95 backdrop-blur border-b lg:border-b-0 lg:border-r border-slate-200 p-2.5 sm:p-3 lg:p-4 shrink-0 no-print">
          <nav className="flex lg:flex-col gap-2 lg:gap-1.5 overflow-x-auto lg:overflow-visible scrollbar-none">
            <button
              type="button"
              onClick={() => setSection('folders')}
              className={`flex items-center gap-2 sm:gap-2.5 px-3.5 py-2.5 min-h-[44px] rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 transition-colors ${
                section === 'folders'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 lg:bg-transparent text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Folder className="w-4 h-4 shrink-0" />
              {t.navFolders}
            </button>
            <button
              type="button"
              onClick={() => setSection('search')}
              className={`flex items-center gap-2 sm:gap-2.5 px-3.5 py-2.5 min-h-[44px] rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 transition-colors ${
                section === 'search'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 lg:bg-transparent text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Search className="w-4 h-4 shrink-0" />
              {t.navSearch}
            </button>
            <button
              type="button"
              onClick={() => setSection('wanted')}
              className={`flex items-center justify-between gap-2 px-3.5 py-2.5 min-h-[44px] rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 transition-colors ${
                section === 'wanted'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 lg:bg-transparent text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span className="inline-flex items-center gap-2 sm:gap-2.5">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                {t.navWanted}
              </span>
              {unreadAlerts.length > 0 && (
                <span className="text-xs font-mono-tabular text-red-500 font-bold">
                  {unreadAlerts.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setSection('suspects')}
              className={`flex items-center justify-between gap-2 px-3.5 py-2.5 min-h-[44px] rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 transition-colors ${
                section === 'suspects'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 lg:bg-transparent text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span className="inline-flex items-center gap-2 sm:gap-2.5">
                <UserCheck className="w-4 h-4 shrink-0" />
                {t.navSuspects}
              </span>
              <span className="text-xs font-mono-tabular opacity-75">{suspectsList.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setSection('criminal_records')}
              className={`flex items-center gap-2 sm:gap-2.5 px-3.5 py-2.5 min-h-[44px] rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 transition-colors ${
                section === 'criminal_records'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 lg:bg-transparent text-slate-700 hover:bg-slate-100'
              }`}
            >
              <FileWarning className="w-4 h-4 shrink-0" />
              {t.navCriminalRecords}
            </button>
            <button
              type="button"
              onClick={() => setSection('statistics')}
              className={`flex items-center gap-2 sm:gap-2.5 px-3.5 py-2.5 min-h-[44px] rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 transition-colors ${
                section === 'statistics'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 lg:bg-transparent text-slate-700 hover:bg-slate-100'
              }`}
            >
              <BarChart3 className="w-4 h-4 shrink-0" />
              {t.navStatistics}
            </button>
            <button
              type="button"
              onClick={() => setSection('history')}
              className={`flex items-center gap-2 sm:gap-2.5 px-3.5 py-2.5 min-h-[44px] rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 transition-colors ${
                section === 'history'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 lg:bg-transparent text-slate-700 hover:bg-slate-100'
              }`}
            >
              <History className="w-4 h-4 shrink-0" />
              {t.navHistory}
            </button>
            <button
              type="button"
              onClick={() => setSection('account_actions')}
              className={`flex items-center gap-2 sm:gap-2.5 px-3.5 py-2.5 min-h-[44px] rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 transition-colors ${
                section === 'account_actions'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 lg:bg-transparent text-slate-700 hover:bg-slate-100'
              }`}
            >
              <RefreshCw className="w-4 h-4 shrink-0" />
              {t.navAccountActions}
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setSection('admin_setup')}
                className={`flex items-center gap-2 sm:gap-2.5 px-3.5 py-2.5 min-h-[44px] rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 transition-colors ${
                  section === 'admin_setup'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 lg:bg-transparent text-slate-700 hover:bg-slate-100'
                }`}
              >
                <UserCog className="w-4 h-4 shrink-0" />
                {t.navAdminSetup}
              </button>
            )}
          </nav>
        </aside>

        {/* Main Workspace Viewport */}
        <main className="flex-1 p-3 sm:p-6 space-y-4 sm:space-y-6 overflow-x-hidden">
          {/* Ornamental System Title Banner */}
          <section className="bg-gradient-to-r from-slate-950 via-blue-950 to-slate-900 border border-amber-500/30 rounded-2xl px-4 py-4 sm:px-6 sm:py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 no-print shadow-sm">
            <div>
              <h1 className="text-lg sm:text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-200 to-emerald-300">
                {t.systemTitle}
              </h1>
              <p className="text-xs sm:text-sm text-cyan-300 font-bold mt-1">
                {branding.commissionName}
              </p>
            </div>
            <p className="text-xs sm:text-sm text-amber-200 font-bold">{t.motto}</p>
          </section>

          {isAdmin && adminCred?.isDefaultPassword && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 no-print">
              <div className="text-xs sm:text-sm text-amber-950">
                <span className="font-bold">ማሳሰቢያ፦ </span>
                አሁን የተገናኙት በነባሪ የአድሚን መግቢያ ነው። ለደህንነት ሲባል የራስዎን ዩዘርኔም እና የይለፍ ቃል እዚህ ማስተካከልና መቀየር ይችላሉ።
              </div>
              <button
                type="button"
                onClick={() => setSection('admin_setup')}
                className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg whitespace-nowrap shrink-0"
              >
                ዩዘርኔም እና ፓስዎርድ ቀይር
              </button>
            </div>
          )}

          {/* Urgent Wanted Alerts Banner */}
          {unreadAlerts.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3 no-print">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-red-800 font-bold text-sm">
                  <AlertOctagon className="w-5 h-5 text-red-600 shrink-0" />
                  <span>
                    አስቸኳይ ማንቂያ፦ በህግ የሚፈለግ ግለሰብ በተከራይ ምዝገባ ውስጥ ተገኝቷል ({unreadAlerts.length})
                  </span>
                </div>
              </div>
              <div className="divide-y divide-red-200 bg-white border border-red-200 rounded-lg">
                {unreadAlerts.slice(0, 5).map((alert) => (
                  <div
                    key={alert.alertId}
                    className="p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs"
                  >
                    <div className="space-y-0.5">
                      <p className="font-bold text-red-900 text-sm">
                        ተከራይ: {alert.tenantName} ({alert.tenantPhone || '-'}) · ተፈላጊ: {alert.wantedName}
                      </p>
                      <p className="text-slate-700">
                        {alert.city} / {alert.woreda} / {alert.kebele} (#{alert.houseNumber || '-'})
                        {' · '}አከራይ: {alert.landlordName} ({alert.landlordPhone})
                      </p>
                      <p className="text-red-700">{alert.matchType}</p>
                    </div>
                    <div className="grid grid-cols-2 sm:flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => void handleAlertStatusUpdate(alert.alertId, 'acknowledged')}
                        className="px-3.5 py-2 min-h-[40px] bg-red-700 text-white rounded-xl font-bold hover:bg-red-800 transition-colors"
                      >
                        ተቀብያለሁ
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleAlertStatusUpdate(alert.alertId, 'resolved')}
                        className="px-3.5 py-2 min-h-[40px] bg-slate-100 text-slate-800 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                      >
                        ተጠናቋል
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 no-print">
              {errorMsg}
            </div>
          )}
          {statusMsg && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700 flex items-center gap-2 no-print">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{statusMsg}</span>
            </div>
          )}

          {/* LIVE MAIN DASHBOARD KPI SUMMARY STRIP */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 no-print">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-medium text-slate-500">{t.kpiLandlords}</p>
              <p className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
                {scopedLandlords.length}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-medium text-slate-500">{t.kpiTenants}</p>
              <p className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
                {scopedTenants.length}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-medium text-slate-500">{t.kpiPoliceTenants}</p>
              <p className="text-2xl font-bold text-blue-700 tabular-nums mt-1">
                {policeTenantsCount}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-medium text-slate-500">{t.kpiWantedActive}</p>
              <p className="text-2xl font-bold text-red-700 tabular-nums mt-1">
                {wantedPersons.filter((w) => w.status === 'active').length}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-medium text-slate-500">{t.kpiSuspects}</p>
              <p className="text-2xl font-bold text-amber-600 tabular-nums mt-1">
                {suspectsList.length}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-medium text-slate-500">{t.kpiRepeatOffenders}</p>
              <p className="text-2xl font-bold text-red-700 tabular-nums mt-1">
                {repeatOffendersCount}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-medium text-slate-500">{t.kpiArrestedToday}</p>
              <p className="text-2xl font-bold text-red-800 tabular-nums mt-1">
                {arrestedTodayCount}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-medium text-slate-500">{t.kpiTotalArrested}</p>
              <p className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
                {totalArrestedList.length}
              </p>
            </div>
          </div>

          {/* SECTION 1: HIERARCHICAL FOLDERS (CITY -> WOREDA -> KEBELE) */}
          {section === 'folders' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h2 className="text-sm font-bold text-slate-900">{t.navFolders}</h2>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCity('');
                      setSelectedWoreda('');
                      setSelectedKebele('');
                    }}
                    className="text-xs text-slate-600 hover:text-slate-900 underline"
                  >
                    {t.filterAll}
                  </button>
                </div>

                <div className="space-y-2 max-h-[540px] overflow-y-auto pr-1">
                  {Array.from(folderTree.entries()).map(([city, cObj]) => {
                    const cityOpen = selectedCity === city;
                    return (
                      <div key={city} className="border border-slate-200 rounded-lg overflow-hidden">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCity(cityOpen ? '' : city);
                            setSelectedWoreda('');
                            setSelectedKebele('');
                          }}
                          className={`w-full px-3 py-2.5 flex items-center justify-between text-left text-sm font-semibold transition-colors ${
                            cityOpen ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-900 hover:bg-slate-100'
                          }`}
                        >
                          <span className="inline-flex items-center gap-2 truncate">
                            {cityOpen ? (
                              <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" />
                            ) : (
                              <Folder className="w-4 h-4 text-slate-600 shrink-0" />
                            )}
                            {city}
                          </span>
                          <span className="text-xs tabular-nums shrink-0">
                            {cObj.landlords} / {cObj.tenants}
                          </span>
                        </button>

                        {cityOpen && (
                          <div className="p-2 bg-white space-y-1.5">
                            {Array.from(cObj.woredas.entries()).map(([woreda, wObj]) => {
                              const woredaOpen = selectedWoreda === woreda;
                              return (
                                <div key={woreda} className="space-y-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedWoreda(woredaOpen ? '' : woreda);
                                      setSelectedKebele('');
                                    }}
                                    className={`w-full px-2.5 py-2 rounded-md flex items-center justify-between text-xs font-semibold ${
                                      woredaOpen
                                        ? 'bg-slate-100 text-slate-900'
                                        : 'text-slate-700 hover:bg-slate-50'
                                    }`}
                                  >
                                    <span className="inline-flex items-center gap-1.5">
                                      <ChevronRight
                                        className={`w-3.5 h-3.5 transition-transform ${
                                          woredaOpen ? 'rotate-90' : ''
                                        }`}
                                      />
                                      <Folder className="w-3.5 h-3.5 text-amber-600" />
                                      {woreda}
                                    </span>
                                    <span className="tabular-nums text-slate-500">
                                      {wObj.landlords} / {wObj.tenants}
                                    </span>
                                  </button>

                                  {woredaOpen && (
                                    <div className="pl-5 space-y-1">
                                      {Array.from(wObj.kebeles.entries()).map(([kebele, kObj]) => {
                                        const kActive = selectedKebele === kebele;
                                        return (
                                          <button
                                            key={kebele}
                                            type="button"
                                            onClick={() =>
                                              setSelectedKebele(kActive ? '' : kebele)
                                            }
                                            className={`w-full px-2.5 py-1.5 rounded text-xs flex items-center justify-between ${
                                              kActive
                                                ? 'bg-slate-900 text-white font-medium'
                                                : 'text-slate-600 hover:bg-slate-100'
                                            }`}
                                          >
                                            <span className="inline-flex items-center gap-1.5">
                                              <Folder className="w-3 h-3" />
                                              {kebele}
                                            </span>
                                            <span className="tabular-nums">
                                              {kObj.landlords} / {kObj.tenants}
                                            </span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Folder Contents Table (Switch between Tenants & Landlords with Dossiers + Photos) */}
              <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      {[selectedCity || t.foldersAllCities, selectedWoreda, selectedKebele]
                        .filter(Boolean)
                        .join(' / ')}
                    </h3>
                    <p className="text-xs text-slate-500 tabular-nums">
                      {t.kpiLandlords}: {folderFilteredLandlords.length} · {t.kpiTenants}:{' '}
                      {folderFilteredTenants.length} · {t.kpiPoliceTenants}:{' '}
                      {folderFilteredTenants.filter((item) => item.isPoliceTenant).length}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setFolderViewTab('tenants')}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
                          folderViewTab === 'tenants' ? 'bg-slate-900 text-white' : 'text-slate-600'
                        }`}
                      >
                        {t.kpiTenants} ({folderFilteredTenants.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setFolderViewTab('landlords')}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
                          folderViewTab === 'landlords' ? 'bg-slate-900 text-white' : 'text-slate-600'
                        }`}
                      >
                        {t.kpiLandlords} ({folderFilteredLandlords.length})
                      </button>
                    </div>

                    {folderViewTab === 'tenants' && (
                      <button
                        type="button"
                        onClick={() => setPoliceTenantsOnly((v) => !v)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                          policeTenantsOnly
                            ? 'bg-blue-700 text-white border-blue-700'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {t.policeTenantsOnlyBtn}
                      </button>
                    )}
                  </div>
                </div>

                {folderViewTab === 'tenants' ? (
                  <>
                    {/* Mobile Tenant Cards */}
                    <div className="md:hidden divide-y divide-slate-200">
                      {folderFilteredTenants.length === 0 ? (
                        <p className="py-10 px-4 text-center text-sm text-slate-500">
                          በዚህ ፎልደር ውስጥ የተመዘገበ ተከራይ የለም።
                        </p>
                      ) : (
                        folderFilteredTenants.map((item) => (
                          <div key={item.tenantId} className="p-4 space-y-2.5">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-2.5 min-w-0">
                                {sanitizeImageSrc(item.portraitImage || item.idFrontImage) && (
                                  <img
                                    src={sanitizeImageSrc(item.portraitImage || item.idFrontImage)}
                                    alt={item.fullName}
                                    className="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0"
                                  />
                                )}
                                <div className="min-w-0">
                                  <p className="font-bold text-sm text-slate-900 truncate">{item.fullName}</p>
                                  <p className="text-xs text-slate-500 tabular-nums">{item.phone}</p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setDossier({
                                    fullName: item.fullName,
                                    phone: item.phone,
                                    idNumber: item.idNumber,
                                    roleLabel: item.isPoliceTenant ? 'ተከራይ (የፖሊስ አባል)' : 'ተከራይ',
                                    address: `${item.city} / ${item.woreda} / ${item.kebele} (#${item.houseNumber}, ${item.roomLabel})`,
                                    idFrontImage: item.idFrontImage,
                                    idBackImage: item.idBackImage,
                                    portraitImage: item.portraitImage,
                                  })
                                }
                                className="px-3 py-1.5 min-h-[36px] bg-slate-900 text-white text-xs font-semibold rounded-lg shrink-0"
                              >
                                {t.openDossierBtn}
                              </button>
                            </div>
                            <div className="text-xs text-slate-600 space-y-0.5">
                              <p>
                                {item.occupation}
                                {item.isPoliceTenant && (
                                  <span className="ml-1.5 text-blue-700 font-bold">(ፖሊስ ዲጅታል)</span>
                                )}
                                {' · '}
                                <span className="font-mono-tabular">{item.idNumber}</span>
                              </p>
                              <p>
                                {item.city} / {item.woreda} / {item.kebele} · #{item.houseNumber}
                              </p>
                              <p className="text-slate-500">
                                {t.kpiLandlords}: {item.landlordName} ({item.landlordPhone})
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Desktop Tenant Table */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                            <th className="py-3 px-4">{t.tenantNameLabel.replace(' *', '')}</th>
                            <th className="py-3 px-4">{t.occupationLabel.replace(' *', '')}</th>
                            <th className="py-3 px-4">{t.cityLabel.replace(' *', '')}</th>
                            <th className="py-3 px-4">{t.kpiLandlords}</th>
                            <th className="py-3 px-4 text-right">{t.detailsBtn}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {folderFilteredTenants.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="py-10 text-center text-sm text-slate-500">
                                በዚህ ፎልደር ውስጥ የተመዘገበ ተከራይ የለም።
                              </td>
                            </tr>
                          ) : (
                            folderFilteredTenants.map((item) => (
                              <tr key={item.tenantId} className="hover:bg-slate-50">
                                <td className="py-3 px-4">
                                  <div className="flex items-center gap-2.5">
                                    {sanitizeImageSrc(item.portraitImage || item.idFrontImage) && (
                                      <img
                                        src={sanitizeImageSrc(item.portraitImage || item.idFrontImage)}
                                        alt={item.fullName}
                                        className="w-9 h-9 rounded-full object-cover border border-slate-200 shrink-0"
                                      />
                                    )}
                                    <div>
                                      <div className="font-semibold text-slate-900">{item.fullName}</div>
                                      <div className="text-xs text-slate-500 tabular-nums">{item.phone}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3 px-4">
                                  <div className="text-xs font-medium text-slate-800">
                                    {item.occupation}
                                    {item.isPoliceTenant && (
                                      <span className="ml-1.5 text-blue-700 font-bold">(ፖሊስ ዲጅታል)</span>
                                    )}
                                  </div>
                                  <div className="text-xs text-slate-500 font-mono-tabular">
                                    {item.idNumber}
                                  </div>
                                </td>
                                <td className="py-3 px-4 text-xs text-slate-600">
                                  {item.city} / {item.woreda} / {item.kebele} · #{item.houseNumber}
                                </td>
                                <td className="py-3 px-4 text-xs text-slate-600">
                                  <div>{item.landlordName}</div>
                                  <div className="tabular-nums text-slate-400">{item.landlordPhone}</div>
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDossier({
                                        fullName: item.fullName,
                                        phone: item.phone,
                                        idNumber: item.idNumber,
                                        roleLabel: item.isPoliceTenant ? 'ተከራይ (የፖሊስ አባል)' : 'ተከራይ',
                                        address: `${item.city} / ${item.woreda} / ${item.kebele} (#${item.houseNumber}, ${item.roomLabel})`,
                                        idFrontImage: item.idFrontImage,
                                        idBackImage: item.idBackImage,
                                        portraitImage: item.portraitImage,
                                      })
                                    }
                                    className="text-xs font-semibold text-slate-900 hover:underline"
                                  >
                                    {t.openDossierBtn}
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Mobile Landlord Cards */}
                    <div className="md:hidden divide-y divide-slate-200">
                      {folderFilteredLandlords.length === 0 ? (
                        <p className="py-10 px-4 text-center text-sm text-slate-500">
                          በዚህ ፎልደር ውስጥ የተመዘገበ አከራይ የለም።
                        </p>
                      ) : (
                        folderFilteredLandlords.map((l) => (
                          <div key={l.landlordId} className="p-4 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-bold text-sm text-slate-900 truncate">{l.fullName}</p>
                                <p className="text-xs text-slate-500 tabular-nums">{l.phone}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setDossier({
                                    fullName: l.fullName,
                                    phone: l.phone,
                                    idNumber: l.faydaId,
                                    roleLabel: 'አከራይ',
                                    address: `${l.city} / ${l.woreda} / ${l.kebele} (#${l.houseNumber})`,
                                    idFrontImage: l.idFrontImage,
                                    idBackImage: l.idBackImage,
                                  })
                                }
                                className="px-3 py-1.5 min-h-[36px] bg-slate-900 text-white text-xs font-semibold rounded-lg shrink-0"
                              >
                                {t.openDossierBtn}
                              </button>
                            </div>
                            <div className="text-xs text-slate-600 space-y-0.5">
                              <p className="font-mono-tabular">Fayda: {l.faydaId}</p>
                              <p>
                                {l.city} / {l.woreda} / {l.kebele} · #{l.houseNumber} ({l.roomCount} {t.roomsStat})
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Desktop Landlord Table */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                            <th className="py-3 px-4">{t.fullNameLabel.replace(' *', '')}</th>
                            <th className="py-3 px-4">Fayda ID</th>
                            <th className="py-3 px-4">{t.cityLabel.replace(' *', '')}</th>
                            <th className="py-3 px-4 text-right">{t.roomsStat}</th>
                            <th className="py-3 px-4 text-right">{t.detailsBtn}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {folderFilteredLandlords.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="py-10 text-center text-sm text-slate-500">
                                በዚህ ፎልደር ውስጥ የተመዘገበ አከራይ የለም።
                              </td>
                            </tr>
                          ) : (
                            folderFilteredLandlords.map((l) => (
                              <tr key={l.landlordId} className="hover:bg-slate-50">
                                <td className="py-3 px-4">
                                  <div className="font-semibold text-slate-900">{l.fullName}</div>
                                  <div className="text-xs text-slate-500 tabular-nums">{l.phone}</div>
                                </td>
                                <td className="py-3 px-4 text-xs font-mono-tabular text-slate-700">
                                  {l.faydaId}
                                </td>
                                <td className="py-3 px-4 text-xs text-slate-600">
                                  {l.city} / {l.woreda} / {l.kebele} · #{l.houseNumber}
                                </td>
                                <td className="py-3 px-4 text-right tabular-nums font-semibold">
                                  {l.roomCount}
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDossier({
                                        fullName: l.fullName,
                                        phone: l.phone,
                                        idNumber: l.faydaId,
                                        roleLabel: 'አከራይ',
                                        address: `${l.city} / ${l.woreda} / ${l.kebele} (#${l.houseNumber})`,
                                        idFrontImage: l.idFrontImage,
                                        idBackImage: l.idBackImage,
                                      })
                                    }
                                    className="text-xs font-semibold text-slate-900 hover:underline"
                                  >
                                    {t.openDossierBtn}
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* SECTION 2: UNIVERSAL SEARCH (NAME / PHONE / FAYDA / PHOTO) */}
          {section === 'search' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <h2 className="text-base font-bold text-slate-900">{t.searchHeading}</h2>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t.searchPlaceholder}
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                {searchQuery.trim() && (
                  <div className="space-y-4 pt-2">
                    <div>
                      <h3 className="text-xs font-bold text-slate-500 mb-2">
                        {t.kpiTenants} ({textSearchResults.tenants.length})
                      </h3>
                      <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                        {textSearchResults.tenants.map((item) => (
                          <div key={item.tenantId} className="p-3 flex items-center justify-between text-sm">
                            <div className="flex items-center gap-3">
                              {(item.portraitImage || item.idFrontImage) && (
                                <img
                                  src={item.portraitImage || item.idFrontImage}
                                  alt={item.fullName}
                                  className="w-10 h-10 rounded-lg object-cover border border-slate-200"
                                />
                              )}
                              <div>
                                <p className="font-semibold text-slate-900">{item.fullName}</p>
                                <p className="text-xs text-slate-500 tabular-nums">
                                  {item.phone} · {item.idNumber} · {item.city}/{item.woreda}/{item.kebele}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setDossier({
                                  fullName: item.fullName,
                                  phone: item.phone,
                                  idNumber: item.idNumber,
                                  roleLabel: 'ተከራይ',
                                  address: `${item.city} / ${item.woreda} / ${item.kebele} (#${item.houseNumber})`,
                                  idFrontImage: item.idFrontImage,
                                  idBackImage: item.idBackImage,
                                  portraitImage: item.portraitImage,
                                })
                              }
                              className="px-3 py-1.5 bg-slate-900 text-white text-xs rounded-md"
                            >
                              {t.openDossierBtn}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-xs font-bold text-slate-500 mb-2">
                        {t.kpiLandlords} ({textSearchResults.landlords.length})
                      </h3>
                      <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                        {textSearchResults.landlords.map((l) => (
                          <div key={l.landlordId} className="p-3 flex items-center justify-between text-sm">
                            <div className="flex items-center gap-3">
                              {l.idFrontImage && (
                                <img
                                  src={l.idFrontImage}
                                  alt={l.fullName}
                                  className="w-10 h-10 rounded-lg object-cover border border-slate-200"
                                />
                              )}
                              <div>
                                <p className="font-semibold text-slate-900">{l.fullName}</p>
                                <p className="text-xs text-slate-500 tabular-nums">
                                  {l.phone} · {l.faydaId} · {l.city}/{l.woreda}/{l.kebele}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setDossier({
                                  fullName: l.fullName,
                                  phone: l.phone,
                                  idNumber: l.faydaId,
                                  roleLabel: 'አከራይ',
                                  address: `${l.city} / ${l.woreda} / ${l.kebele} (#${l.houseNumber})`,
                                  idFrontImage: l.idFrontImage,
                                  idBackImage: l.idBackImage,
                                })
                              }
                              className="px-3 py-1.5 bg-slate-900 text-white text-xs rounded-md"
                            >
                              {t.openDossierBtn}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-xs font-bold text-red-600 mb-2">
                        {t.navCriminalRecords} & {t.navWanted} (
                        {textSearchResults.crimes.length + textSearchResults.wanted.length})
                      </h3>
                      <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                        {textSearchResults.crimes.map((c) => (
                          <div key={c.recordId} className="p-3 flex items-center justify-between text-sm">
                            <div className="flex items-center gap-3">
                              {c.photoImage && (
                                <img
                                  src={c.photoImage}
                                  alt={c.personName}
                                  className="w-10 h-10 rounded-lg object-cover border border-slate-200"
                                />
                              )}
                              <div>
                                <p className="font-semibold text-red-800">
                                  {c.personName} — {c.offenseTitle} ({c.recordType})
                                </p>
                                <p className="text-xs text-slate-600 tabular-nums">
                                  {c.phone || '-'} · {c.faydaId || '-'} · {c.stationName} · {c.incidentDate}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setDossier({
                                  fullName: c.personName,
                                  phone: c.phone || '-',
                                  idNumber: c.faydaId || '-',
                                  roleLabel: c.recordType === 'suspect' ? 'ተጠርጣሪ' : 'የወንጀል ሪከርድ',
                                  address: `${c.city} / ${c.woreda} / ${c.kebele}`,
                                  portraitImage: c.photoImage,
                                })
                              }
                              className="px-3 py-1.5 bg-red-700 text-white text-xs rounded-md"
                            >
                              {t.openDossierBtn}
                            </button>
                          </div>
                        ))}
                        {textSearchResults.wanted.map((w) => (
                          <div key={w.wantedId} className="p-3 flex items-center justify-between text-sm bg-red-50/40">
                            <div className="flex items-center gap-3">
                              {w.photoImage && (
                                <img
                                  src={w.photoImage}
                                  alt={w.fullName}
                                  className="w-10 h-10 rounded-lg object-cover border border-red-200"
                                />
                              )}
                              <div>
                                <p className="font-semibold text-red-900">
                                  {w.fullName || w.caseNumber} — {t.navWanted} ({w.status})
                                </p>
                                <p className="text-xs text-slate-600 tabular-nums">
                                  {w.phone || '-'} · {w.faydaId || '-'} · #{w.caseNumber}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setDossier({
                                  fullName: w.fullName || w.caseNumber,
                                  phone: w.phone || '-',
                                  idNumber: w.faydaId || '-',
                                  roleLabel: 'በህግ የሚፈለግ (Wanted)',
                                  address: w.caseNumber,
                                  portraitImage: w.photoImage,
                                })
                              }
                              className="px-3 py-1.5 bg-red-800 text-white text-xs rounded-md"
                            >
                              {t.openDossierBtn}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Camera className="w-5 h-5 text-slate-800" />
                  <h2 className="text-base font-bold text-slate-900">{t.photoSearchHeading}</h2>
                </div>
                <p className="text-xs text-slate-500">{t.photoSearchDesc}</p>

                <SmartPhotoInput
                  value={photoQueryImg}
                  onChange={setPhotoQueryImg}
                  cropMode="portrait"
                  cameraFacing="environment"
                  theme="light"
                  lang={lang}
                  previewAlt="Query"
                />

                <button
                  type="button"
                  disabled={!photoQueryImg || photoSearching}
                  onClick={() => void handlePhotoSearch()}
                  className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
                >
                  {photoSearching ? '...' : t.photoSearchBtn}
                </button>

                {photoMatches.length > 0 && (
                  <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg max-h-80 overflow-y-auto">
                    {photoMatches.map((m) => (
                      <div key={m.id} className="p-3 flex items-center gap-3 text-xs">
                        <img
                          src={m.imageBase64}
                          alt={m.personName}
                          className="w-12 h-12 rounded object-cover border border-slate-200 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-900 truncate">
                            {m.personName} ·{' '}
                            <span className="tabular-nums text-blue-700">{m.confidence}%</span>
                          </p>
                          <p className="text-slate-500">{m.category}</p>
                          <p className="text-slate-600 mt-0.5">{m.reasonAmharic}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setDossier({
                              fullName: m.personName,
                              phone: m.phone,
                              idNumber: m.idNumber,
                              roleLabel: m.category,
                              address: m.address,
                              portraitImage: m.imageBase64,
                            })
                          }
                          className="px-2.5 py-1 bg-slate-900 text-white rounded text-xs shrink-0"
                        >
                          {t.openDossierBtn}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SECTION 3: WANTED PERSONS POSTER BOARD */}
          {section === 'wanted' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <form
                onSubmit={handleSaveWanted}
                className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4 self-start"
              >
                <div className="border-b border-slate-100 pb-3">
                  <h2 className="text-base font-bold text-slate-900">{t.wantedFormTitle}</h2>
                  <p className="text-xs text-slate-500">{t.wantedFormDesc}</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={wName}
                    onChange={(e) => setWName(e.target.value)}
                    placeholder="ሙሉ ስም (ካለ)"
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                  <input
                    type="tel"
                    value={wPhone}
                    onChange={(e) => setWPhone(e.target.value)}
                    placeholder="ስልክ ቁጥር (ካለ)"
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                  />
                  <input
                    type="text"
                    value={wFayda}
                    onChange={(e) => setWFayda(e.target.value)}
                    placeholder="ፋይዳ ቁጥር (ካለ)"
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono-tabular"
                  />
                  <input
                    type="text"
                    value={wCaseNo}
                    onChange={(e) => setWCaseNo(e.target.value)}
                    placeholder="የመዝገብ ቁጥር"
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono-tabular"
                  />
                </div>

                <div className="space-y-3">
                  <select
                    value={wPriority}
                    onChange={(e) =>
                      setWPriority(e.target.value as 'critical' | 'high' | 'medium')
                    }
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="critical">አስቸኳይ / Critical</option>
                    <option value="high">ከፍተኛ / High</option>
                    <option value="medium">መካከለኛ / Medium</option>
                  </select>

                  <SmartPhotoInput
                    label={lang === 'am' ? 'የተፈላጊ ፎቶ' : 'Wanted Photo'}
                    value={wPhoto}
                    onChange={setWPhoto}
                    cropMode="portrait"
                    cameraFacing="environment"
                    theme="light"
                    lang={lang}
                    previewAlt="Wanted Preview"
                  />
                </div>

                <textarea
                  required
                  rows={3}
                  value={wReason}
                  onChange={(e) => setWReason(e.target.value)}
                  placeholder="የሚፈለግበት ምክንያት / የወንጀል መግለጫ *"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-2.5 bg-red-700 hover:bg-red-800 text-white text-sm font-semibold rounded-lg"
                >
                  {busy ? '...' : 'በተፈላጊ ሰሌዳ ላይ አውጣ'}
                </button>
              </form>

              <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="text-base font-bold text-slate-900">
                    {t.wantedListTitle} ({wantedPersons.length})
                  </h3>
                </div>
                {wantedPersons.length === 0 ? (
                  <p className="p-10 text-center text-sm text-slate-500">ምንም ተፈላጊ አልተመዘገበም።</p>
                ) : (
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[680px] overflow-y-auto">
                    {wantedPersons.map((w) => (
                      <div
                        key={w.wantedId}
                        className={`border rounded-xl overflow-hidden flex flex-col ${
                          w.status === 'active'
                            ? 'border-red-300 bg-red-50/30'
                            : 'border-slate-200 bg-slate-50'
                        }`}
                      >
                        <div className="bg-slate-900 text-white px-4 py-2 flex items-center justify-between text-xs">
                          <span className="font-bold tracking-wider uppercase text-amber-300">
                            {w.status === 'active' ? 'WANTED / በህግ የሚፈለግ' : 'CAPTURED / ተይዟል'}
                          </span>
                          <span className="font-mono-tabular text-slate-300">#{w.caseNumber}</span>
                        </div>

                        <div className="p-4 flex gap-3.5 flex-1">
                          {w.photoImage ? (
                            <img
                              src={w.photoImage}
                              alt={w.fullName}
                              className="w-24 h-28 rounded-lg object-cover border border-slate-300 shrink-0 bg-white"
                            />
                          ) : (
                            <div className="w-24 h-28 rounded-lg bg-slate-200 flex items-center justify-center shrink-0">
                              <Shield className="w-8 h-8 text-slate-400" />
                            </div>
                          )}

                          <div className="flex-1 min-w-0 space-y-1">
                            <p className="font-bold text-slate-900 text-sm truncate">
                              {w.fullName || w.phone || w.faydaId || 'በፎቶ ተፈላጊ'}
                            </p>
                            <p className="text-xs text-slate-600 tabular-nums">
                              ስልክ: {w.phone || '-'}
                            </p>
                            <p className="text-xs text-slate-600 font-mono-tabular">
                              ፋይዳ: {w.faydaId || '-'}
                            </p>
                            <p className="text-xs text-slate-700 line-clamp-3 pt-1">{w.reason}</p>
                          </div>
                        </div>

                        <div className="px-4 py-2.5 border-t border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => void handleWantedStatusChange(w.wantedId, 'captured')}
                              className={`text-xs px-2.5 py-1 rounded font-medium ${
                                w.status === 'captured'
                                  ? 'bg-emerald-700 text-white'
                                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                              }`}
                            >
                              {t.wantedStatusCaptured}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleWantedStatusChange(w.wantedId, 'active')}
                              className={`text-xs px-2.5 py-1 rounded font-medium ${
                                w.status === 'active'
                                  ? 'bg-red-700 text-white'
                                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                              }`}
                            >
                              {t.wantedStatusActive}
                            </button>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setDossier({
                                  fullName: w.fullName || w.caseNumber,
                                  phone: w.phone || '-',
                                  idNumber: w.faydaId || '-',
                                  roleLabel: 'በህግ የሚፈለግ (Wanted)',
                                  address: w.caseNumber,
                                  portraitImage: w.photoImage,
                                })
                              }
                              className="text-xs font-semibold text-slate-900 hover:underline"
                            >
                              {t.openDossierBtn}
                            </button>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => void handleDeleteWanted(w)}
                                className="text-xs text-red-600 hover:text-red-800"
                                title={t.deleteRecordBtn}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SECTION 4: DEDICATED SUSPECTS REGISTRY */}
          {section === 'suspects' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <form
                onSubmit={handleSaveSuspect}
                className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4 self-start"
              >
                <div className="border-b border-slate-100 pb-3">
                  <h2 className="text-base font-bold text-slate-900">{t.suspectsFormTitle}</h2>
                  <p className="text-xs text-slate-500">{t.suspectsFormDesc}</p>
                </div>

                <input
                  type="text"
                  required
                  value={susName}
                  onChange={(e) => setSusName(e.target.value)}
                  placeholder="የተጠርጣሪው ሙሉ ስም *"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="tel"
                    value={susPhone}
                    onChange={(e) => setSusPhone(e.target.value)}
                    placeholder="ስልክ ቁጥር"
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                  />
                  <input
                    type="text"
                    value={susFayda}
                    onChange={(e) => setSusFayda(e.target.value)}
                    placeholder="የፋይዳ መታወቂያ ቁጥር"
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono-tabular"
                  />
                </div>

                <div className="space-y-3">
                  <input
                    type="date"
                    value={susDate}
                    onChange={(e) => setSusDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                  />
                  <SmartPhotoInput
                    label={lang === 'am' ? 'የተጠርጣሪ ፎቶ' : 'Suspect Photo'}
                    value={susPhoto}
                    onChange={setSusPhoto}
                    cropMode="portrait"
                    cameraFacing="environment"
                    theme="light"
                    lang={lang}
                    previewAlt="Suspect Preview"
                  />
                </div>

                <input
                  type="text"
                  required
                  value={susOffense}
                  onChange={(e) => setSusOffense(e.target.value)}
                  placeholder="የተጠረጠረበት ጉዳይ ርዕስ *"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />

                <textarea
                  required
                  rows={3}
                  value={susDesc}
                  onChange={(e) => setSusDesc(e.target.value)}
                  placeholder="ዝርዝር የጥርጣሬ መግለጫ *"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    required
                    value={susCity}
                    onChange={(e) => setSusCity(e.target.value)}
                    placeholder="ከተማ"
                    className="px-2.5 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                  <input
                    type="text"
                    required
                    value={susWoreda}
                    onChange={(e) => setSusWoreda(e.target.value)}
                    placeholder="ወረዳ"
                    className="px-2.5 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                  <input
                    type="text"
                    required
                    value={susKebele}
                    onChange={(e) => setSusKebele(e.target.value)}
                    placeholder="ቀበሌ"
                    className="px-2.5 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>

                <input
                  type="text"
                  required
                  value={susStation}
                  onChange={(e) => setSusStation(e.target.value)}
                  placeholder="ፖሊስ ጣቢያ"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg"
                >
                  {busy ? '...' : 'ተጠርጣሪውን መዝግብ'}
                </button>
              </form>

              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200">
                  <h3 className="text-base font-bold text-slate-900">
                    {t.suspectsListTitle} ({suspectsList.length})
                  </h3>
                </div>
                <div className="divide-y divide-slate-200 max-h-[640px] overflow-y-auto">
                  {suspectsList.length === 0 ? (
                    <p className="p-8 text-center text-sm text-slate-500">
                      ምንም ተጠርጣሪ አልተመዘገበም።
                    </p>
                  ) : (
                    suspectsList.map((c) => (
                      <div key={c.recordId} className="p-4 flex items-start gap-4">
                        {c.photoImage ? (
                          <img
                            src={c.photoImage}
                            alt={c.personName}
                            className="w-16 h-16 rounded-lg object-cover border border-slate-200 shrink-0"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
                            <UserCheck className="w-6 h-6 text-amber-600" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-bold text-slate-900">
                                {c.personName} ·{' '}
                                <span className="text-amber-700 text-xs">{c.offenseTitle}</span>
                              </p>
                              <p className="text-xs text-slate-500 tabular-nums mt-0.5">
                                {c.phone || '-'} · {c.faydaId || '-'} · {c.incidentDate}
                              </p>
                            </div>
                          </div>
                          <p className="text-xs text-slate-700 mt-1">{c.description}</p>
                          <p className="text-xs text-slate-400 mt-1">
                            {c.stationName} ({c.city} / {c.woreda} / {c.kebele})
                          </p>
                          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 mt-3">
                            <button
                              type="button"
                              onClick={() => void handleCriminalTypeChange(c.recordId, 'arrested')}
                              className="px-3 py-2 min-h-[38px] bg-red-700 hover:bg-red-800 text-white text-xs font-bold rounded-lg transition-colors"
                            >
                              {t.promoteToArrested}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleCriminalTypeChange(c.recordId, 'released')}
                              className="px-3 py-2 min-h-[38px] bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors"
                            >
                              {t.markReleased}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setDossier({
                                  fullName: c.personName,
                                  phone: c.phone || '-',
                                  idNumber: c.faydaId || '-',
                                  roleLabel: 'ተጠርጣሪ (Suspect)',
                                  address: `${c.city} / ${c.woreda} / ${c.kebele}`,
                                  portraitImage: c.photoImage,
                                })
                              }
                              className="px-3 py-2 min-h-[38px] bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition-colors"
                            >
                              {t.openDossierBtn}
                            </button>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => void handleDeleteCriminal(c)}
                                className="px-3 py-2 min-h-[38px] bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-lg transition-colors"
                              >
                                {t.deleteRecordBtn}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* SECTION 5: CRIMINAL RECORDS MANAGEMENT MODULE (TAG SUSPECTS + SEARCH BY NAME, ID, OR PHOTOGRAPH) */}
          {section === 'criminal_records' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-xs text-slate-500">{t.kpiSuspects}</p>
                  <p className="text-2xl font-bold text-amber-600 tabular-nums mt-1">
                    {suspectsList.length}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-xs text-slate-500">{t.kpiArrestedToday}</p>
                  <p className="text-2xl font-bold text-red-700 tabular-nums mt-1">
                    {arrestedTodayCount}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-xs text-slate-500">{t.kpiTotalArrested}</p>
                  <p className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
                    {totalArrestedList.length}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-xs text-slate-500">{t.kpiRepeatOffenders}</p>
                  <p className="text-2xl font-bold text-red-700 tabular-nums mt-1">
                    {repeatOffendersCount}
                  </p>
                </div>
              </div>

              <div className="bg-slate-900 text-white rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-2 border border-amber-400/30">
                <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold">
                  <ShieldCheck className="w-4 h-4 text-amber-300 shrink-0" />
                  <span>
                    {lang === 'am'
                      ? 'ምስጢራዊ የፖሊስ የወንጀል እና የተጠርጣሪዎች መዝገብ — ለአከራዮች ፍፁም አይታይም'
                      : 'Confidential Police Criminal & Suspect Registry — Strictly Hidden from Landlords'}
                  </span>
                </div>
                <span className="text-[11px] font-mono-tabular text-amber-200 bg-slate-800 px-2.5 py-1 rounded-md">
                  {lang === 'am' ? 'ፖሊስ/አድሚን ብቻ' : 'Police & Admin Only'}
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <form
                  onSubmit={handleSaveCriminalRecord}
                  className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4 self-start"
                >
                  <div className="border-b border-slate-100 pb-3 flex items-start justify-between gap-2">
                    <div>
                      <h2 className="text-base font-bold text-slate-900">
                        {editingCriminalRecordId
                          ? lang === 'am'
                            ? 'የወንጀል / የተጠርጣሪ ሪከርድ ማስተካከያ'
                            : 'Update Criminal / Suspect Record'
                          : t.criminalFormTitle}
                      </h2>
                      <p className="text-xs text-slate-500">{t.criminalFormDesc}</p>
                    </div>
                    {editingCriminalRecordId && (
                      <button
                        type="button"
                        onClick={resetCriminalRecordForm}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-md shrink-0"
                      >
                        {lang === 'am' ? 'ሰርዝ' : 'Cancel'}
                      </button>
                    )}
                  </div>

                  {/* Quick link to tag an existing Tenant or Landlord */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      {lang === 'am'
                        ? 'ከተመዘገቡ ተከራዮች/አከራዮች መርጠው ለመለየት (አማራጭ)'
                        : 'Quick-Select Registered Tenant / Landlord (Optional)'}
                    </label>
                    <select
                      value=""
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) return;
                        const [kind, id] = val.split(':');
                        if (kind === 'tenant') {
                          const found = tenants.find((item) => item.tenantId === id);
                          if (found) {
                            setCrName(found.fullName);
                            setCrPhone(found.phone);
                            setCrFayda(found.idNumber);
                            setCrPhoto(found.portraitImage || found.idFrontImage || '');
                            setCrCity(found.city);
                            setCrWoreda(found.woreda);
                            setCrKebele(found.kebele);
                          }
                        } else if (kind === 'landlord') {
                          const found = landlords.find((item) => item.landlordId === id);
                          if (found) {
                            setCrName(found.fullName);
                            setCrPhone(found.phone);
                            setCrFayda(found.faydaId);
                            setCrPhoto(found.idFrontImage || '');
                            setCrCity(found.city);
                            setCrWoreda(found.woreda);
                            setCrKebele(found.kebele);
                          }
                        }
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-slate-50"
                    >
                      <option value="">
                        {lang === 'am'
                          ? '-- ተከራይ ወይም አከራይ ይምረጡ (በራሱ ይሞላል) --'
                          : '-- Pick registered person to auto-fill --'}
                      </option>
                      {tenants.map((item) => (
                        <option key={`t-${item.tenantId}`} value={`tenant:${item.tenantId}`}>
                          [ተከራይ] {item.fullName} ({item.phone} · {item.idNumber})
                        </option>
                      ))}
                      {landlords.map((l) => (
                        <option key={`l-${l.landlordId}`} value={`landlord:${l.landlordId}`}>
                          [አከራይ] {l.fullName} ({l.phone} · {l.faydaId})
                        </option>
                      ))}
                    </select>
                  </div>

                  <input
                    type="text"
                    required
                    value={crName}
                    onChange={(e) => setCrName(e.target.value)}
                    placeholder="የግለሰቡ ሙሉ ስም *"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="tel"
                      value={crPhone}
                      onChange={(e) => setCrPhone(e.target.value)}
                      placeholder="ስልክ ቁጥር"
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                    />
                    <input
                      type="text"
                      value={crFayda}
                      onChange={(e) => setCrFayda(e.target.value)}
                      placeholder="የፋይዳ / መታወቂያ ቁጥር"
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono-tabular"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <select
                      value={crType}
                      onChange={(e) => setCrType(e.target.value as RecordType)}
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white font-semibold"
                    >
                      <option value="suspect">{t.statusSuspect} (Suspect)</option>
                      <option value="arrested">{t.statusArrested} (Arrested)</option>
                      <option value="convicted">{t.statusConvicted} (Convicted)</option>
                      <option value="released">{t.statusReleased} (Released)</option>
                    </select>
                    <input
                      type="date"
                      value={crDate}
                      onChange={(e) => setCrDate(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                    />
                  </div>

                  <input
                    type="text"
                    required
                    value={crOffense}
                    onChange={(e) => setCrOffense(e.target.value)}
                    placeholder="የጥፋቱ ርዕስ / የተጠረጠረበት ወይም የታሰረበት ጉዳይ *"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />

                  <textarea
                    required
                    rows={3}
                    value={crDesc}
                    onChange={(e) => setCrDesc(e.target.value)}
                    placeholder="ዝርዝር የወንጀል / የጥርጣሬ / የእስር መግለጫ *"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      required
                      value={crCity}
                      onChange={(e) => setCrCity(e.target.value)}
                      placeholder="ከተማ"
                      className="px-2.5 py-2 border border-slate-300 rounded-lg text-xs"
                    />
                    <input
                      type="text"
                      required
                      value={crWoreda}
                      onChange={(e) => setCrWoreda(e.target.value)}
                      placeholder="ወረዳ"
                      className="px-2.5 py-2 border border-slate-300 rounded-lg text-xs"
                    />
                    <input
                      type="text"
                      required
                      value={crKebele}
                      onChange={(e) => setCrKebele(e.target.value)}
                      placeholder="ቀበሌ"
                      className="px-2.5 py-2 border border-slate-300 rounded-lg text-xs"
                    />
                  </div>

                  <div className="space-y-3">
                    <input
                      type="text"
                      required
                      value={crStation}
                      onChange={(e) => setCrStation(e.target.value)}
                      placeholder="ፖሊስ ጣቢያ"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                    />
                    <SmartPhotoInput
                      label={lang === 'am' ? 'የግለሰቡ ፎቶ' : 'Record Photo'}
                      value={crPhoto}
                      onChange={setCrPhoto}
                      cropMode="portrait"
                      cameraFacing="environment"
                      theme="light"
                      lang={lang}
                      previewAlt="Record Preview"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={busy}
                      className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg"
                    >
                      {busy
                        ? '...'
                        : editingCriminalRecordId
                          ? lang === 'am'
                            ? 'ለውጦችን አስቀምጥ'
                            : 'Save Updates'
                          : 'የወንጀል / የተጠርጣሪ ሪከርድ መዝግብ'}
                    </button>
                    {editingCriminalRecordId && (
                      <button
                        type="button"
                        onClick={resetCriminalRecordForm}
                        className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-semibold rounded-lg"
                      >
                        {lang === 'am' ? 'ተው' : 'Cancel'}
                      </button>
                    )}
                  </div>
                </form>

                {/* Right Column: Search Criminal Records by Name, ID, or Photograph + Tag Controls */}
                <div className="lg:col-span-7 space-y-4">
                  <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row gap-2.5">
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          value={crSearchQuery}
                          onChange={(e) => setCrSearchQuery(e.target.value)}
                          placeholder={t.crSearchPlaceholder}
                          className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                        />
                      </div>
                      <select
                        value={crFilterType}
                        onChange={(e) => setCrFilterType(e.target.value as 'all' | RecordType)}
                        className="px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold bg-white"
                      >
                        <option value="all">
                          {t.filterAll} ({criminalRecords.length})
                        </option>
                        <option value="suspect">
                          {t.statusSuspect} ({suspectsList.length})
                        </option>
                        <option value="arrested">{t.statusArrested}</option>
                        <option value="convicted">{t.statusConvicted}</option>
                        <option value="released">{t.statusReleased}</option>
                      </select>
                    </div>

                    {/* Photograph Search inside Criminal Records (Camera + Gallery + Auto-Crop) */}
                    <div className="pt-2 border-t border-slate-100 space-y-2">
                      <SmartPhotoInput
                        label={t.crPhotoSearchBtn}
                        value={crPhotoQueryImg}
                        onChange={setCrPhotoQueryImg}
                        cropMode="portrait"
                        cameraFacing="environment"
                        theme="light"
                        lang={lang}
                        compact
                        previewAlt="Search query"
                      />
                      {crPhotoQueryImg && (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={crPhotoSearching}
                            onClick={() => void handleCriminalRecordPhotoSearch()}
                            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold rounded-lg"
                          >
                            {crPhotoSearching ? '...' : t.photoSearchBtn}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCrPhotoQueryImg('');
                              setCrPhotoMatches([]);
                            }}
                            className="px-2.5 py-1.5 bg-slate-100 text-slate-700 text-xs rounded-lg"
                          >
                            {t.closeBtn}
                          </button>
                        </div>
                      )}
                    </div>

                    {crPhotoMatches.length > 0 && (
                      <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg bg-slate-50 max-h-60 overflow-y-auto">
                        {crPhotoMatches.map((m) => (
                          <div key={m.id} className="p-2.5 flex items-center gap-3 text-xs">
                            <img
                              src={m.imageBase64}
                              alt={m.personName}
                              className="w-10 h-10 rounded object-cover border border-slate-200 shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-slate-900 truncate">
                                {m.personName} ·{' '}
                                <span className="tabular-nums text-blue-700">{m.confidence}%</span>
                              </p>
                              <p className="text-slate-600">{m.reasonAmharic}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setDossier({
                                  fullName: m.personName,
                                  phone: m.phone || '-',
                                  idNumber: m.idNumber || '-',
                                  roleLabel: m.category,
                                  address: m.address,
                                  portraitImage: m.imageBase64,
                                })
                              }
                              className="px-2.5 py-1 bg-slate-900 text-white rounded text-xs shrink-0"
                            >
                              {t.openDossierBtn}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                      <h3 className="text-base font-bold text-slate-900">
                        {t.criminalListTitle} ({filteredCriminalRecords.length})
                      </h3>
                    </div>
                    <div className="divide-y divide-slate-200 max-h-[600px] overflow-y-auto">
                      {filteredCriminalRecords.length === 0 ? (
                        <p className="p-8 text-center text-sm text-slate-500">
                          {lang === 'am'
                            ? 'ምንም ተዛማጅ የወንጀል ወይም የተጠርጣሪ ሪከርድ አልተገኘም።'
                            : 'No matching criminal or suspect records found.'}
                        </p>
                      ) : (
                        filteredCriminalRecords.map((c) => {
                          const statusBadgeColor =
                            c.recordType === 'suspect'
                              ? 'bg-amber-100 text-amber-800 border-amber-200'
                              : c.recordType === 'released'
                                ? 'bg-slate-100 text-slate-700 border-slate-200'
                                : 'bg-red-100 text-red-800 border-red-200';
                          const statusLabel =
                            c.recordType === 'suspect'
                              ? t.statusSuspect
                              : c.recordType === 'convicted'
                                ? t.statusConvicted
                                : c.recordType === 'released'
                                  ? t.statusReleased
                                  : t.statusArrested;
                          return (
                            <div key={c.recordId} className="p-4 flex items-start gap-4">
                              {c.photoImage ? (
                                <img
                                  src={c.photoImage}
                                  alt={c.personName}
                                  className="w-16 h-16 rounded-lg object-cover border border-slate-200 shrink-0"
                                />
                              ) : (
                                <div className="w-16 h-16 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                                  <FileWarning className="w-6 h-6 text-slate-400" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-bold text-slate-900">{c.personName}</p>
                                  <span
                                    className={`text-[11px] font-bold px-2 py-0.5 rounded border ${statusBadgeColor}`}
                                  >
                                    {statusLabel}
                                  </span>
                                  <span className="text-xs font-medium text-red-700">
                                    {c.offenseTitle}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-500 tabular-nums mt-0.5">
                                  {c.phone || '-'} · {c.faydaId || '-'} · {c.incidentDate}
                                </p>
                                <p className="text-xs text-slate-700 mt-1">{c.description}</p>
                                <p className="text-xs text-slate-400 mt-1">
                                  {c.stationName} ({c.city} / {c.woreda} / {c.kebele})
                                </p>

                                {/* Quick Suspect Tagging & Status Controls */}
                                <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 mt-3">
                                  {c.recordType !== 'suspect' && (
                                    <button
                                      type="button"
                                      onClick={() => void handleCriminalTypeChange(c.recordId, 'suspect')}
                                      className="px-3 py-2 min-h-[38px] bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-bold rounded-lg transition-colors"
                                    >
                                      {lang === 'am' ? 'ተጠርጣሪ በል' : 'Tag Suspect'}
                                    </button>
                                  )}
                                  {c.recordType !== 'arrested' && (
                                    <button
                                      type="button"
                                      onClick={() => void handleCriminalTypeChange(c.recordId, 'arrested')}
                                      className="px-3 py-2 min-h-[38px] bg-red-700 hover:bg-red-800 text-white text-xs font-bold rounded-lg transition-colors"
                                    >
                                      {t.promoteToArrested}
                                    </button>
                                  )}
                                  {c.recordType !== 'released' && (
                                    <button
                                      type="button"
                                      onClick={() => void handleCriminalTypeChange(c.recordId, 'released')}
                                      className="px-3 py-2 min-h-[38px] bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors"
                                    >
                                      {t.markReleased}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => startEditCriminalRecord(c)}
                                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[38px] bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-lg transition-colors"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                    {lang === 'am' ? 'አስተካክል' : 'Edit'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDossier({
                                        fullName: c.personName,
                                        phone: c.phone || '-',
                                        idNumber: c.faydaId || '-',
                                        roleLabel: statusLabel,
                                        address: `${c.city} / ${c.woreda} / ${c.kebele}`,
                                        portraitImage: c.photoImage,
                                      })
                                    }
                                    className="px-3 py-2 min-h-[38px] bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition-colors"
                                  >
                                    {t.openDossierBtn}
                                  </button>
                                  {isAdmin && (
                                    <button
                                      type="button"
                                      onClick={() => void handleDeleteCriminal(c)}
                                      className="px-3 py-2 min-h-[38px] bg-red-50 text-red-700 hover:bg-red-100 text-xs font-bold rounded-lg transition-colors"
                                    >
                                      {t.deleteRecordBtn}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 6: RECHARTS STATISTICS & MULTI-FORMAT REPORTS */}
          {section === 'statistics' && (
            <StatisticsReportsView
              lang={lang}
              branding={branding}
              landlords={scopedLandlords}
              tenants={scopedTenants}
              criminalRecords={criminalRecords}
              wantedAlerts={scopedAlerts}
              history={scopedHistory}
              defaultCityFilter={officer && officer.jurisdictionLevel !== 'regional' ? officer.city : ''}
            />
          )}

          {/* SECTION 7: IMMUTABLE AUDIT HISTORY */}
          {section === 'history' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900">
                {t.navHistory} ({scopedHistory.length})
              </h2>
              <div className="divide-y divide-slate-200">
                {scopedHistory.map((h) => (
                  <div
                    key={h.historyId}
                    className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">{h.details}</p>
                      <p className="text-xs text-slate-500">
                        {h.actorName} · {h.subjectName} · {h.city}/{h.woreda}/{h.kebele}
                      </p>
                    </div>
                    <span className="text-xs text-slate-500 tabular-nums shrink-0">
                      {formatDateAm(h.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION 8: USER CREDENTIALS (EDIT USERNAME / PASSWORD / DELETE) & LANDLORD REPLACEMENT */}
          {section === 'account_actions' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <form
                onSubmit={handleUpdateUserCredentialsSubmit}
                className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
              >
                <div className="border-b border-slate-100 pb-3">
                  <h2 className="text-base font-bold text-slate-900">
                    ዩዘርኔም፣ የይለፍ ቃል ማስተካከያና መለያ መሰረዣ
                  </h2>
                  <p className="text-xs text-slate-500">
                    የአከራይ ወይም የፖሊስ ኦፊሰር ዩዘርኔም/ስልክ እና የይለፍ ቃል ይቀይሩ ወይም አድሚን ከሆኑ መለያውን ይሰርዙ።
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCredTargetType('landlord');
                      setCredSelectedId('');
                      setCredNewUsername('');
                      setConfirmDeleteId(null);
                    }}
                    className={`flex-1 py-2 text-xs font-medium rounded-lg border ${
                      credTargetType === 'landlord'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    {t.kpiLandlords}
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setCredTargetType('officer');
                        setCredSelectedId('');
                        setCredNewUsername('');
                        setConfirmDeleteId(null);
                      }}
                      className={`flex-1 py-2 text-xs font-medium rounded-lg border ${
                        credTargetType === 'officer'
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-300'
                      }`}
                    >
                      ፖሊስ ኦፊሰሮች
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={credSearchName}
                    onChange={(e) => setCredSearchName(e.target.value)}
                    placeholder="በስም ፈልግ..."
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                  <input
                    type="tel"
                    value={credSearchPhone}
                    onChange={(e) => setCredSearchPhone(e.target.value)}
                    placeholder="በስልክ ፈልግ..."
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                  />
                </div>

                <select
                  required
                  value={credSelectedId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setCredSelectedId(id);
                    setConfirmDeleteId(null);
                    const found = credCandidates.find((c) => c.id === id);
                    setCredNewUsername(found ? found.username : '');
                  }}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value="">ተጠቃሚ ይምረጡ ({credCandidates.length})</option>
                  {credCandidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.username} ({c.city}/{c.woreda})
                    </option>
                  ))}
                </select>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {credTargetType === 'officer'
                      ? 'ዩዘርኔም (Username)'
                      : 'ስልክ ቁጥር / ዩዘርኔም (Phone/Username)'}
                  </label>
                  <input
                    type="text"
                    value={credNewUsername}
                    onChange={(e) => setCredNewUsername(e.target.value)}
                    placeholder="ዩዘርኔም"
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm font-mono-tabular"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    አዲስ የይለፍ ቃል (ካልቀየሩ ባዶ ይተዉት)
                  </label>
                  <input
                    type="password"
                    value={credNewPass}
                    onChange={(e) => setCredNewPass(e.target.value)}
                    placeholder="አዲስ የይለፍ ቃል (ቢያንስ 4 ቁምፊ)"
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={busy}
                    className="flex-1 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg"
                  >
                    ዩዘርኔምና ፓስዎርድ አስተካክል
                  </button>

                  {isAdmin && credSelectedId && (
                    confirmDeleteId === credSelectedId ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleDeleteSelectedAccount()}
                          className="py-2.5 px-3 bg-red-700 hover:bg-red-800 text-white text-xs font-semibold rounded-lg"
                        >
                          አረጋግጥና ሰርዝ
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="py-2.5 px-3 bg-slate-100 text-slate-700 text-xs font-medium rounded-lg"
                        >
                          ተው
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(credSelectedId)}
                        className="py-2.5 px-3.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        መለያ ሰርዝ
                      </button>
                    )
                  )}
                </div>
              </form>

              <form
                onSubmit={handleReplaceLandlordSubmit}
                className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
              >
                <div className="border-b border-slate-100 pb-3">
                  <h2 className="text-base font-bold text-slate-900">
                    የቤት አከራይ ስም መቀየሪያ (Ownership Transfer)
                  </h2>
                  <p className="text-xs text-slate-500">
                    የቀድሞውን አከራይ ስም በማውጣት አዲሱን አከራይ ስም፣ ስልክ እና መታወቂያ ይቀይሩ።
                  </p>
                </div>

                <select
                  required
                  value={repOldId}
                  onChange={(e) => setRepOldId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value="">የሚቀየረውን የቀድሞ አከራይ ይምረጡ</option>
                  {scopedLandlords.map((l) => (
                    <option key={l.landlordId} value={l.landlordId}>
                      {l.fullName} — {l.phone} (#{l.houseNumber}, {l.city}/{l.woreda})
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="text"
                    required
                    value={repNewName}
                    onChange={(e) => setRepNewName(e.target.value)}
                    placeholder="የአዲስ አከራይ ሙሉ ስም *"
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                  <input
                    type="tel"
                    required
                    value={repNewPhone}
                    onChange={(e) => setRepNewPhone(e.target.value)}
                    placeholder="አዲስ ስልክ *"
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                  />
                  <input
                    type="text"
                    required
                    value={repNewFayda}
                    onChange={(e) => setRepNewFayda(e.target.value)}
                    placeholder="አዲስ ፋይዳ ቁጥር *"
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono-tabular"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <SmartPhotoInput
                    label="የአዲስ አከራይ ፊት መታወቂያ *"
                    value={repNewFront}
                    onChange={setRepNewFront}
                    cropMode="id_card"
                    cameraFacing="environment"
                    theme="light"
                    lang={lang}
                    previewAlt="New Landlord Front ID"
                  />
                  <SmartPhotoInput
                    label="የአዲስ አከራይ ኋላ መታወቂያ *"
                    value={repNewBack}
                    onChange={setRepNewBack}
                    cropMode="id_card"
                    cameraFacing="environment"
                    theme="light"
                    lang={lang}
                    previewAlt="New Landlord Back ID"
                  />
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg"
                >
                  አከራይ ቀይርና ታሪኩን አስቀምጥ
                </button>
              </form>
            </div>
          )}

          {/* SECTION 9: ADMIN SETUP (ADMIN CREDENTIALS, OFFICERS WITH EDIT/DELETE, LOGO, JURISDICTIONS) */}
          {section === 'admin_setup' && isAdmin && (
            <div className="space-y-6">
              {/* Admin Own Username & Password Settings */}
              <form
                onSubmit={handleSaveAdminCredSubmit}
                className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <KeyRound className="w-5 h-5 text-slate-900 shrink-0" />
                    <div>
                      <h2 className="text-base font-bold text-slate-900">
                        የአድሚን ዩዘርኔም እና የይለፍ ቃል ማስተካከያ
                      </h2>
                      <p className="text-xs text-slate-500">
                        ወደ አድሚን ገፅ መግቢያ ዩዘርኔምዎን እና የይለፍ ቃልዎን በፈለጉት ጊዜ እዚህ መቀየር ይችላሉ።
                      </p>
                    </div>
                  </div>
                  <div className="text-xs text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg font-mono-tabular">
                    የአሁኑ ዩዘርኔም: <strong className="text-slate-900">{adminCred?.username || adminUsername || 'admin'}</strong>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      የአሁኑ የይለፍ ቃል *
                    </label>
                    <input
                      type="password"
                      required
                      value={admCurrentPass}
                      onChange={(e) => setAdmCurrentPass(e.target.value)}
                      placeholder="የአሁኑን የይለፍ ቃል ያስገቡ"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      አዲስ ዩዘርኔም *
                    </label>
                    <input
                      type="text"
                      required
                      value={admNewUsername}
                      onChange={(e) => setAdmNewUsername(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono-tabular"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      አዲስ የይለፍ ቃል (ካልቀየሩ ባዶ)
                    </label>
                    <input
                      type="password"
                      value={admNewPass}
                      onChange={(e) => setAdmNewPass(e.target.value)}
                      placeholder="ቢያንስ 4 ቁምፊ"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      አዲሱን የይለፍ ቃል አረጋግጥ
                    </label>
                    <input
                      type="password"
                      value={admConfirmPass}
                      onChange={(e) => setAdmConfirmPass(e.target.value)}
                      placeholder="በድጋሚ ያስገቡ"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={busy}
                    className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs sm:text-sm font-semibold rounded-lg"
                  >
                    {busy ? '...' : 'የአድሚን ዩዘርኔም እና ፓስዎርድ አስተካክል'}
                  </button>
                </div>
              </form>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Create Police Officer Account */}
                <form
                  onSubmit={handleCreateOfficerSubmit}
                  className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4"
                >
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                    <UserPlus className="w-5 h-5 text-slate-900" />
                    <div>
                      <h2 className="text-base font-bold text-slate-900">
                        ለፖሊስ ኦፊሰር ዩዘርኔም፣ ፓስዎርድ እና አድራሻ መክፈቻ
                      </h2>
                      <p className="text-xs text-slate-500">
                        ኦፊሰሩ በተሞላለት ከተማ፣ ወረዳ ወይም ቀበሌ አድራሻ መሰረት ሪፖርቶችን ይቀበላል።
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      type="text"
                      required
                      value={offName}
                      onChange={(e) => setOffName(e.target.value)}
                      placeholder="የኦፊሰሩ ሙሉ ስም *"
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                    <input
                      type="text"
                      required
                      value={offRank}
                      onChange={(e) => setOffRank(e.target.value)}
                      placeholder="ማዕረግ"
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                    <input
                      type="text"
                      value={offBadge}
                      onChange={(e) => setOffBadge(e.target.value)}
                      placeholder="የመለያ ቁጥር (Badge)"
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono-tabular"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      type="tel"
                      required
                      value={offPhone}
                      onChange={(e) => setOffPhone(e.target.value)}
                      placeholder="ስልክ ቁጥር *"
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                    />
                    <input
                      type="text"
                      required
                      value={offUsername}
                      onChange={(e) => setOffUsername(e.target.value)}
                      placeholder="ዩዘርኔም (assosa_w1) *"
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono-tabular"
                    />
                    <input
                      type="password"
                      required
                      value={offPass}
                      onChange={(e) => setOffPass(e.target.value)}
                      placeholder="የይለፍ ቃል *"
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>

                  <input
                    type="email"
                    value={offEmail}
                    onChange={(e) => setOffEmail(e.target.value)}
                    placeholder="የኦፊሰሩ ኢሜይል (ከሌላ መሳሪያ በቀጥታ እንዲገባ — አማራጭ)"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    <select
                      value={offLevel}
                      onChange={(e) => setOffLevel(e.target.value as JurisdictionLevel)}
                      className="px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
                    >
                      <option value="regional">ክልል ፖሊስ</option>
                      <option value="city">ከተማ ፖሊስ</option>
                      <option value="woreda">ወረዳ ፖሊስ</option>
                      <option value="kebele">ቀበሌ ፖሊስ</option>
                    </select>
                    <select
                      value={offCity}
                      onChange={(e) => setOffCity(e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
                    >
                      {allCities.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={offWoreda}
                      disabled={offLevel === 'city' || offLevel === 'regional'}
                      onChange={(e) => setOffWoreda(e.target.value)}
                      placeholder="ወረዳ"
                      className="px-3 py-2 border border-slate-300 rounded-lg text-xs disabled:bg-slate-100"
                    />
                    <input
                      type="text"
                      value={offKebele}
                      disabled={offLevel !== 'kebele'}
                      onChange={(e) => setOffKebele(e.target.value)}
                      placeholder="ቀበሌ"
                      className="px-3 py-2 border border-slate-300 rounded-lg text-xs disabled:bg-slate-100"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg"
                  >
                    የፖሊስ መለያ ፍጠር
                  </button>
                </form>

                {/* Police Logo, Mountain Peak Flags & Branding */}
                <form
                  onSubmit={handleSaveBrandingSubmit}
                  className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4"
                >
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                    <ShieldCheck className="w-5 h-5 text-slate-900" />
                    <div>
                      <h2 className="text-base font-bold text-slate-900">
                        የፖሊስ ሎጎ፣ ሰንደቅአላማ እና መጠሪያ መቀየሪያ
                      </h2>
                      <p className="text-xs text-slate-500">
                        ሎጎውን፣ የቤኒሻንጉል ጉሙዝ ክልል እና የኢትዮጵያ ሰንደቅአላማ ሲቀይሩ በሎጊን ገፅ ላይ ወዲያውኑ ይታያል።
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <BrandingImage
                        src={brandLogo}
                        alt="Preview Logo"
                        className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border border-slate-200 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <SmartPhotoInput
                          label="አዲስ የፖሊስ ሎጎ ጫን"
                          value={brandLogo}
                          onChange={setBrandLogo}
                          cropMode="free"
                          cameraFacing="environment"
                          theme="light"
                          lang={lang}
                          compact
                          hidePreview
                          maxChars={380000}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Admin Uploadable Flags for Login Page Left & Right Mountain Peaks */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50/70">
                      <p className="text-xs font-bold text-slate-800">
                        የቤኒሻንጉል ጉሙዝ ክልል ሰንደቅአላማ (ግራ ተራራ)
                      </p>
                      <div className="flex items-center gap-3">
                        <BrandingImage
                          src={brandRegionalFlag}
                          alt="Benishangul-Gumuz Regional Flag"
                          className="w-16 h-11 rounded object-contain border border-slate-300 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <SmartPhotoInput
                            value={brandRegionalFlag}
                            onChange={setBrandRegionalFlag}
                            cropMode="free"
                            preserveTransparency
                            cameraFacing="environment"
                            theme="light"
                            lang={lang}
                            compact
                            hidePreview
                            maxChars={380000}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50/70">
                      <p className="text-xs font-bold text-slate-800">
                        የኢትዮጵያ ሰንደቅአላማ (ቀኝ ተራራ)
                      </p>
                      <div className="flex items-center gap-3">
                        <BrandingImage
                          src={brandEthiopianFlag}
                          alt="Ethiopian National Flag"
                          className="w-16 h-11 rounded object-contain border border-slate-300 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <SmartPhotoInput
                            value={brandEthiopianFlag}
                            onChange={setBrandEthiopianFlag}
                            cropMode="free"
                            preserveTransparency
                            cameraFacing="environment"
                            theme="light"
                            lang={lang}
                            compact
                            hidePreview
                            maxChars={380000}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <input
                    type="text"
                    required
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    placeholder="የኮሚሽኑ መጠሪያ"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                  <input
                    type="text"
                    value={brandSub}
                    onChange={(e) => setBrandSub(e.target.value)}
                    placeholder="ንዑስ መግለጫ"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />

                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full py-2.5 min-h-[44px] bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg"
                  >
                    ሎጎ፣ ሰንደቅአላማ እና መጠሪያ አዘምን
                  </button>
                </form>
              </div>

              {/* Full 5-Level Jurisdiction Management: Add, Edit & Delete Region / Zone / City / Woreda / Kebele */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <form
                  onSubmit={(e) => void handleAddJurisdictionSubmit(e)}
                  className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-3 self-start"
                >
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      አዲስ ክልል / ዞን / ከተማ / ወረዳ / ቀበሌ ጨምር
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      አከራዮች ሲመዘገቡና አድራሻ ሲቀይሩ የሚመርጧቸው አድራሻዎች እዚህ ይጨመራሉ።
                    </p>
                  </div>
                  <input
                    type="text"
                    required
                    value={jurRegion}
                    onChange={(e) => setJurRegion(e.target.value)}
                    placeholder="ክልል (ምሳሌ፡ ቤኒሻንጉል ጉሙዝ ክልል) *"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                  <input
                    type="text"
                    required
                    value={jurZone}
                    onChange={(e) => setJurZone(e.target.value)}
                    placeholder="ዞን (ምሳሌ፡ አሶሳ ዞን / መተከል ዞን / ካማሺ ዞን) *"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                  <input
                    type="text"
                    required
                    value={jurCity}
                    onChange={(e) => setJurCity(e.target.value)}
                    placeholder="ከተማ (ምሳሌ፡ አሶሳ ከተማ) *"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                  <input
                    type="text"
                    required
                    value={jurWoreda}
                    onChange={(e) => setJurWoreda(e.target.value)}
                    placeholder="ወረዳ (ምሳሌ፡ ወረዳ 3) *"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                  <input
                    type="text"
                    required
                    value={jurKebele}
                    onChange={(e) => setJurKebele(e.target.value)}
                    placeholder="ቀበሌ (ምሳሌ፡ ቀበሌ 09) *"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full py-2.5 min-h-[42px] bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg"
                  >
                    አድራሻ ጨምር
                  </button>
                </form>

                <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        የተመዘገቡ ክልል፣ ዞን፣ ከተማ፣ ወረዳና ቀበሌዎች ({filteredJurisdictions.length})
                      </h3>
                      <p className="text-xs text-slate-500">
                        ማንኛውንም አድራሻ ማስተካከል (Edit) ወይም መሰረዝ ይችላሉ።
                      </p>
                    </div>
                    <div className="relative w-full sm:w-64">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={jurSearch}
                        onChange={(e) => setJurSearch(e.target.value)}
                        placeholder="በክልል፣ ዞን፣ ከተማ፣ ወረዳ ፈልግ..."
                        className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  <div className="divide-y divide-slate-200 max-h-[420px] overflow-y-auto">
                    {filteredJurisdictions.length === 0 ? (
                      <p className="p-6 text-center text-xs text-slate-500">
                        ምንም የተገኘ አድራሻ የለም።
                      </p>
                    ) : (
                      filteredJurisdictions.map((j) => {
                        const isEditingRow = editingJurId === j.id;
                        return (
                          <div key={j.id} className="p-3.5 text-xs">
                            {isEditingRow ? (
                              <div className="space-y-2.5 bg-amber-50/70 border border-amber-200 rounded-lg p-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2">
                                  <input
                                    type="text"
                                    value={editJurRegion}
                                    onChange={(e) => setEditJurRegion(e.target.value)}
                                    placeholder="ክልል"
                                    className="px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                                  />
                                  <input
                                    type="text"
                                    value={editJurZone}
                                    onChange={(e) => setEditJurZone(e.target.value)}
                                    placeholder="ዞን"
                                    className="px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                                  />
                                  <input
                                    type="text"
                                    value={editJurCity}
                                    onChange={(e) => setEditJurCity(e.target.value)}
                                    placeholder="ከተማ"
                                    className="px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                                  />
                                  <input
                                    type="text"
                                    value={editJurWoreda}
                                    onChange={(e) => setEditJurWoreda(e.target.value)}
                                    placeholder="ወረዳ"
                                    className="px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                                  />
                                  <input
                                    type="text"
                                    value={editJurKebele}
                                    onChange={(e) => setEditJurKebele(e.target.value)}
                                    placeholder="ቀበሌ"
                                    className="px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                                  />
                                </div>
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void handleSaveJurisdictionEdit(j)}
                                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-md"
                                  >
                                    አስቀምጥ
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingJurId(null)}
                                    className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 text-xs rounded-md"
                                  >
                                    ዝጋ
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                <div className="space-y-0.5 min-w-0">
                                  <p className="font-bold text-slate-900">
                                    {j.city} · {j.woreda} · {j.kebele}
                                  </p>
                                  <p className="text-slate-500">
                                    {j.region || DEFAULT_REGION_NAME} / {j.zone || inferZoneForCity(j.city)}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => startEditJurisdiction(j)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md font-semibold"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                    አስተካክል
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void handleDeleteJurisdictionRow(j)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-md font-semibold"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    ሰርዝ
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* Officers Directory with Edit Username/Password & Delete */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200">
                  <h3 className="text-sm font-bold text-slate-900">
                    የተከፈቱ የፖሊስ መለያዎች ({officers.length})
                  </h3>
                </div>

                {editingOfficer && (
                  <form
                    onSubmit={handleSaveInlineOfficerEdit}
                    className="p-4 bg-amber-50 border-b border-amber-200 grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end"
                  >
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        ዩዘርኔም ({editingOfficer.fullName})
                      </label>
                      <input
                        type="text"
                        required
                        value={editOffUsername}
                        onChange={(e) => setEditOffUsername(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs font-mono-tabular bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        አዲስ ፓስዎርድ (አማራጭ)
                      </label>
                      <input
                        type="password"
                        value={editOffPass}
                        onChange={(e) => setEditOffPass(e.target.value)}
                        placeholder="ካልቀየሩ ባዶ"
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        ሁኔታ
                      </label>
                      <select
                        value={editOffActive ? 'active' : 'suspended'}
                        onChange={(e) => setEditOffActive(e.target.value === 'active')}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white"
                      >
                        <option value="active">ንቁ (Active)</option>
                        <option value="suspended">የታገደ (Suspended)</option>
                      </select>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        type="submit"
                        disabled={busy}
                        className="px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded"
                      >
                        አስቀምጥ
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingOfficer(null)}
                        className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 text-xs rounded"
                      >
                        ዝጋ
                      </button>
                    </div>
                  </form>
                )}

                {/* Mobile Officers Cards */}
                <div className="md:hidden divide-y divide-slate-200">
                  {officers.map((o) => (
                    <div key={o.officerId} className="p-4 space-y-2 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-slate-900 text-sm">
                            {o.rank} {o.fullName}
                            {!o.active && <span className="ml-1.5 text-red-600">(ታግዷል)</span>}
                          </p>
                          <p className="font-mono-tabular text-slate-600">{o.username}</p>
                        </div>
                        <span className="tabular-nums text-slate-500">{o.phone}</span>
                      </div>
                      <p className="text-slate-600">
                        {o.jurisdictionLevel} · {o.city} {o.woreda} {o.kebele}
                      </p>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingOfficer(o);
                            setEditOffUsername(o.username);
                            setEditOffPass('');
                            setEditOffActive(o.active);
                          }}
                          className="flex-1 py-2 px-3 min-h-[36px] inline-flex items-center justify-center gap-1 bg-blue-50 text-blue-700 rounded-lg font-semibold"
                        >
                          <Edit3 className="w-3 h-3" />
                          አስተካክል
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteOfficer(o)}
                          className="flex-1 py-2 px-3 min-h-[36px] inline-flex items-center justify-center gap-1 bg-red-50 text-red-700 rounded-lg font-semibold"
                        >
                          <Trash2 className="w-3 h-3" />
                          ሰርዝ
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Officers Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <th className="py-2.5 px-4">ኦፊሰር</th>
                        <th className="py-2.5 px-4">ዩዘርኔም</th>
                        <th className="py-2.5 px-4">ደረጃ እና አድራሻ</th>
                        <th className="py-2.5 px-4">ስልክ</th>
                        <th className="py-2.5 px-4 text-right">እርምጃ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {officers.map((o) => (
                        <tr key={o.officerId}>
                          <td className="py-2.5 px-4 font-semibold text-slate-900">
                            {o.rank} {o.fullName}
                            {!o.active && (
                              <span className="ml-1.5 text-red-600">(ታግዷል)</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 font-mono-tabular">{o.username}</td>
                          <td className="py-2.5 px-4 text-slate-600">
                            {o.jurisdictionLevel} · {o.city} {o.woreda} {o.kebele}
                          </td>
                          <td className="py-2.5 px-4 tabular-nums">{o.phone}</td>
                          <td className="py-2.5 px-4 text-right space-x-2 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingOfficer(o);
                                setEditOffUsername(o.username);
                                setEditOffPass('');
                                setEditOffActive(o.active);
                              }}
                              className="inline-flex items-center gap-1 text-blue-700 hover:underline font-medium"
                            >
                              <Edit3 className="w-3 h-3" />
                              አስተካክል
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteOfficer(o)}
                              className="inline-flex items-center gap-1 text-red-600 hover:underline font-medium"
                            >
                              <Trash2 className="w-3 h-3" />
                              ሰርዝ
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* FULL PERSON DOSSIER & CRIMINAL RECORD CHECK MODAL (ALL PHOTOS PROMINENT + PRINTABLE) */}
      {dossier && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-2.5 sm:p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-3xl w-full max-h-[92dvh] overflow-y-auto overflow-x-hidden p-4 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 border-b border-slate-200 pb-4">
              <div className="flex items-center gap-3 min-w-0">
                <BrandingImage
                  src={branding.logoDataUrl}
                  alt="Police Logo"
                  className="w-11 h-11 sm:w-12 sm:h-12 rounded-full object-cover border border-slate-200 shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-xs text-slate-500 truncate">{branding.commissionName}</p>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900">
                    {dossier.fullName} — ሙሉ ማህደርና የወንጀል ሪከርድ ፍተሻ
                  </h3>
                  <p className="text-xs text-slate-600 tabular-nums">
                    {dossier.roleLabel} · {dossier.phone} · {dossier.idNumber}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 no-print">
                <button
                  type="button"
                  onClick={() =>
                    startCriminalOrSuspectTagFromPerson({
                      fullName: dossier.fullName,
                      phone: dossier.phone,
                      idNumber: dossier.idNumber,
                      photo: dossier.portraitImage || dossier.idFrontImage,
                      type: 'suspect',
                    })
                  }
                  className="px-3.5 py-2.5 min-h-[42px] bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition-colors"
                >
                  {t.tagAsSuspect}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    startCriminalOrSuspectTagFromPerson({
                      fullName: dossier.fullName,
                      phone: dossier.phone,
                      idNumber: dossier.idNumber,
                      photo: dossier.portraitImage || dossier.idFrontImage,
                      type: 'arrested',
                    })
                  }
                  className="px-3.5 py-2.5 min-h-[42px] bg-red-700 hover:bg-red-800 text-white text-xs font-bold rounded-xl transition-colors"
                >
                  {t.addCrimeRecordFromDossier}
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 min-h-[42px] bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors"
                >
                  <Printer className="w-4 h-4 shrink-0" />
                  {t.printBtn}
                </button>
                <button
                  type="button"
                  onClick={() => setDossier(null)}
                  className="px-3.5 py-2.5 min-h-[42px] bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors"
                >
                  {t.closeBtn}
                </button>
              </div>
            </div>

            {/* Person Photos Prominently Shown First */}
            {(sanitizeImageSrc(dossier.portraitImage) || sanitizeImageSrc(dossier.idFrontImage) || sanitizeImageSrc(dossier.idBackImage)) && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                {sanitizeImageSrc(dossier.portraitImage) && (
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-1">የግለሰብ ፎቶ</p>
                    <img
                      src={sanitizeImageSrc(dossier.portraitImage)}
                      alt="Portrait"
                      className="h-36 w-full object-contain bg-white border border-slate-200 rounded-lg"
                    />
                  </div>
                )}
                {sanitizeImageSrc(dossier.idFrontImage) && (
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-1">መታወቂያ ፊት</p>
                    <img
                      src={sanitizeImageSrc(dossier.idFrontImage)}
                      alt="Front ID"
                      className="h-36 w-full object-contain bg-white border border-slate-200 rounded-lg"
                    />
                  </div>
                )}
                {sanitizeImageSrc(dossier.idBackImage) && (
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-1">መታወቂያ ኋላ</p>
                    <img
                      src={sanitizeImageSrc(dossier.idBackImage)}
                      alt="Back ID"
                      className="h-36 w-full object-contain bg-white border border-slate-200 rounded-lg"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Criminal Record & Repeat Offender Verdict */}
            <div
              className={`p-4 rounded-lg border ${
                dossierCrimes.length > 0 || dossierWanted.length > 0
                  ? 'bg-red-50 border-red-200 text-red-900'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              }`}
            >
              <p className="font-bold text-sm">
                {dossierCrimes.length > 0 || dossierWanted.length > 0
                  ? `የወንጀል/ጥርጣሬ/ተፈላጊ መዝገብ አለበት (${dossierCrimes.length} ሪከርድ, ${dossierWanted.length} ተፈላጊ)${
                      dossierCrimes.length >= 2 ? ' — ደጋጋሚ ወንጀለኛ' : ''
                    }`
                  : 'ንጹህ — በሲስተሙ ውስጥ የተመዘገበ የወንጀል ሪከርድ የለበትም'}
              </p>
              <p className="text-xs mt-1">አድራሻ: {dossier.address}</p>
            </div>

            {dossierCrimes.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-red-800">የወንጀል፣ ጥርጣሬና እስር ሪከርዶች</h4>
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                  {dossierCrimes.map((c) => (
                    <div key={c.recordId} className="p-3 text-xs space-y-1">
                      <div className="font-bold text-slate-900">
                        {c.offenseTitle} ({c.recordType}) · {c.incidentDate}
                      </div>
                      <p className="text-slate-700">{c.description}</p>
                      <p className="text-slate-500">
                        {c.stationName} · {c.recordedByName}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <h4 className="text-sm font-bold text-slate-900">
                የእንቅስቃሴና የአድራሻ ቅያሬ ታሪክ ({dossierHistory.length})
              </h4>
              {dossierHistory.length === 0 ? (
                <p className="text-xs text-slate-500">ተጨማሪ የታሪክ መዝገብ የለም።</p>
              ) : (
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                  {dossierHistory.map((h) => (
                    <div key={h.historyId} className="p-2.5 text-xs flex justify-between gap-2">
                      <span>{h.details}</span>
                      <span className="text-slate-500 tabular-nums shrink-0">
                        {formatDateAm(h.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
