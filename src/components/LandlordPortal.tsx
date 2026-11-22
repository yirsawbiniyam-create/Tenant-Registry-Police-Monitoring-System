import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Eye,
  Globe,
  History,
  Home,
  LogOut,
  MapPin,
  Plus,
  RefreshCw,
  Send,
  UserCheck,
  Users,
} from 'lucide-react';
import type {
  ActivityHistory,
  BrandingSetting,
  Jurisdiction,
  Landlord,
  Tenant,
} from '../types';
import {
  formatDateAm,
  sanitizeImageSrc,
  toJsDate,
  verifyPassword,
} from '../utils/crypto';
import { DEFAULT_REGION_NAME, OCCUPATION_OPTIONS, inferZoneForCity } from '../utils/seedData';
import {
  markTenantMovedOut,
  registerLandlord,
  registerTenant,
  subscribeLandlordOwnData,
  updateLandlordAddress,
} from '../services/firestoreService';
import {
  markFallbackTenantMovedOut,
  registerFallbackLandlord,
  registerFallbackTenant,
  subscribeFallbackStore,
  updateFallbackLandlordAddress,
} from '../utils/localFallback';
import { BrandingImage } from './BrandingImage';
import { SmartPhotoInput } from './SmartPhotoInput';
import { DICT, type Lang } from '../i18n';

interface LandlordPortalProps {
  isCloudConnected: boolean;
  lang: Lang;
  onToggleLang: () => void;
  firebaseUid: string;
  initialLandlord: Landlord;
  branding: BrandingSetting;
  jurisdictions: Jurisdiction[];
  onRetryCloudConnect?: () => Promise<{ ok: boolean; error?: string }>;
  onLogout: () => void;
}

type LandlordTab = 'register_tenant' | 'my_tenants' | 'change_address' | 'history';

export const LandlordPortal: React.FC<LandlordPortalProps> = ({
  isCloudConnected,
  lang,
  onToggleLang,
  firebaseUid,
  initialLandlord,
  branding,
  jurisdictions,
  onLogout,
}) => {
  const t = DICT[lang];
  const [tab, setTab] = useState<LandlordTab>('register_tenant');
  const [ownedLandlords, setOwnedLandlords] = useState<Landlord[]>([initialLandlord]);
  const [selectedLandlordId, setSelectedLandlordId] = useState<string>(initialLandlord.landlordId);
  const [allTenants, setAllTenants] = useState<Tenant[]>([]);
  const [history, setHistory] = useState<ActivityHistory[]>([]);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'tenants' | 'address'>('all');
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);

  const landlord = useMemo(
    () => ownedLandlords.find((l) => l.landlordId === selectedLandlordId) || initialLandlord,
    [ownedLandlords, selectedLandlordId, initialLandlord]
  );

  // Strictly this landlord's own tenants
  const tenants = useMemo(
    () => allTenants.filter((item) => item.landlordId === landlord.landlordId),
    [allTenants, landlord.landlordId]
  );

  // Tenant Form State (New Room vs Replacement of Prior Tenant)
  const [entryMode, setEntryMode] = useState<'new_room' | 'replace_tenant'>('new_room');
  const [replacedTenantId, setReplacedTenantId] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [maritalStatus, setMaritalStatus] = useState<'married' | 'single'>('single');
  const [livingArrangement, setLivingArrangement] = useState<'alone' | 'with_others'>('alone');
  const [coResidentInput, setCoResidentInput] = useState('');
  const [coResidents, setCoResidents] = useState<string[]>([]);
  const [occupation, setOccupation] = useState(OCCUPATION_OPTIONS[0]);
  const [idNumber, setIdNumber] = useState('');
  const [idFrontImage, setIdFrontImage] = useState('');
  const [idBackImage, setIdBackImage] = useState('');
  const [portraitImage, setPortraitImage] = useState('');
  const [roomLabel, setRoomLabel] = useState('ክፍል 1');
  const [moveInDate, setMoveInDate] = useState(new Date().toISOString().slice(0, 10));

  const [reviewOpen, setReviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Address Change State (5-Level Region -> Zone -> City -> Woreda -> Kebele)
  const [addrRegion, setAddrRegion] = useState(
    initialLandlord.region || DEFAULT_REGION_NAME
  );
  const [addrZone, setAddrZone] = useState(
    initialLandlord.zone || inferZoneForCity(initialLandlord.city)
  );
  const [addrCity, setAddrCity] = useState(initialLandlord.city);
  const [addrWoreda, setAddrWoreda] = useState(initialLandlord.woreda);
  const [addrKebele, setAddrKebele] = useState(initialLandlord.kebele);
  const [addrHouseNo, setAddrHouseNo] = useState(initialLandlord.houseNumber);
  const [addrRooms, setAddrRooms] = useState(String(initialLandlord.roomCount));
  const [addrPhone, setAddrPhone] = useState(initialLandlord.phone);

  // Add Additional Rental House State
  const [newPropRegion, setNewPropRegion] = useState(
    initialLandlord.region || DEFAULT_REGION_NAME
  );
  const [newPropZone, setNewPropZone] = useState(
    initialLandlord.zone || inferZoneForCity(initialLandlord.city)
  );
  const [newPropCity, setNewPropCity] = useState(initialLandlord.city);
  const [newPropWoreda, setNewPropWoreda] = useState(initialLandlord.woreda);
  const [newPropKebele, setNewPropKebele] = useState(initialLandlord.kebele);
  const [newPropHouseNo, setNewPropHouseNo] = useState('');
  const [newPropRooms, setNewPropRooms] = useState('1');
  const [newPropPass, setNewPropPass] = useState('');

  const isPoliceOccupation = occupation === 'ፖሊስ';

  useEffect(() => {
    setAddrRegion(landlord.region || DEFAULT_REGION_NAME);
    setAddrZone(landlord.zone || inferZoneForCity(landlord.city));
    setAddrCity(landlord.city);
    setAddrWoreda(landlord.woreda);
    setAddrKebele(landlord.kebele);
    setAddrHouseNo(landlord.houseNumber);
    setAddrRooms(String(landlord.roomCount));
    setAddrPhone(landlord.phone);
  }, [
    landlord.landlordId,
    landlord.region,
    landlord.zone,
    landlord.city,
    landlord.woreda,
    landlord.kebele,
    landlord.houseNumber,
    landlord.roomCount,
    landlord.phone,
  ]);

  useEffect(() => {
    if (!isCloudConnected) {
      return subscribeFallbackStore((store) => {
        const ownLandlords = store.landlords.filter(
          (l) => l.ownerUid === firebaseUid && l.status === 'active'
        );
        if (ownLandlords.length > 0) {
          setOwnedLandlords(ownLandlords);
        }
        const ownTenants = [...store.tenants]
          .filter((item) => item.landlordUid === firebaseUid)
          .sort(
            (a, b) =>
              (toJsDate(b.createdAt)?.getTime() || 0) - (toJsDate(a.createdAt)?.getTime() || 0)
          );
        setAllTenants(ownTenants);
        const ownHistory = [...store.history]
          .filter((h) => h.actorUid === firebaseUid)
          .sort(
            (a, b) =>
              (toJsDate(b.createdAt)?.getTime() || 0) - (toJsDate(a.createdAt)?.getTime() || 0)
          );
        setHistory(ownHistory);
      });
    }

    const unsub = subscribeLandlordOwnData(firebaseUid, (data) => {
      if (data.landlords.length > 0) {
        setOwnedLandlords(data.landlords.filter((l) => l.status === 'active'));
      }
      const sortedTenants = [...data.tenants].sort(
        (a, b) => (toJsDate(b.createdAt)?.getTime() || 0) - (toJsDate(a.createdAt)?.getTime() || 0)
      );
      setAllTenants(sortedTenants);
      const sortedHistory = [...data.history].sort(
        (a, b) => (toJsDate(b.createdAt)?.getTime() || 0) - (toJsDate(a.createdAt)?.getTime() || 0)
      );
      setHistory(sortedHistory);
    });
    return unsub;
  }, [firebaseUid, isCloudConnected]);

  const selectedReplacedTenant = useMemo(
    () => tenants.find((item) => item.tenantId === replacedTenantId),
    [tenants, replacedTenantId]
  );

  const regions = useMemo(
    () =>
      Array.from(
        new Set(jurisdictions.map((j) => (j.region || DEFAULT_REGION_NAME).trim()).filter(Boolean))
      ),
    [jurisdictions]
  );
  const zones = useMemo(
    () =>
      Array.from(
        new Set(
          jurisdictions
            .filter((j) => !addrRegion || (j.region || DEFAULT_REGION_NAME) === addrRegion)
            .map((j) => (j.zone || inferZoneForCity(j.city)).trim())
            .filter(Boolean)
        )
      ),
    [jurisdictions, addrRegion]
  );
  const cities = useMemo(
    () =>
      Array.from(
        new Set(
          jurisdictions
            .filter(
              (j) =>
                (!addrRegion || (j.region || DEFAULT_REGION_NAME) === addrRegion) &&
                (!addrZone || (j.zone || inferZoneForCity(j.city)) === addrZone)
            )
            .map((j) => j.city)
        )
      ),
    [jurisdictions, addrRegion, addrZone]
  );
  const woredas = useMemo(
    () =>
      Array.from(
        new Set(
          jurisdictions
            .filter(
              (j) =>
                (!addrRegion || (j.region || DEFAULT_REGION_NAME) === addrRegion) &&
                (!addrZone || (j.zone || inferZoneForCity(j.city)) === addrZone) &&
                (!addrCity || j.city === addrCity)
            )
            .map((j) => j.woreda)
        )
      ),
    [jurisdictions, addrRegion, addrZone, addrCity]
  );
  const kebeles = useMemo(
    () =>
      Array.from(
        new Set(
          jurisdictions
            .filter(
              (j) =>
                (!addrRegion || (j.region || DEFAULT_REGION_NAME) === addrRegion) &&
                (!addrZone || (j.zone || inferZoneForCity(j.city)) === addrZone) &&
                (!addrCity || j.city === addrCity) &&
                (!addrWoreda || j.woreda === addrWoreda)
            )
            .map((j) => j.kebele)
        )
      ),
    [jurisdictions, addrRegion, addrZone, addrCity, addrWoreda]
  );

  function handleAddCoResident() {
    const val = coResidentInput.trim();
    if (!val || coResidents.length >= 20) return;
    setCoResidents((prev) => [...prev, val]);
    setCoResidentInput('');
  }

  function handleOpenReview(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    if (entryMode === 'replace_tenant' && !selectedReplacedTenant) {
      setErrorMsg(
        lang === 'am'
          ? 'እባክዎ በማን ምትክ እንደገባ ከቀድሞ ተከራዮች ታሪክዎ ውስጥ ይምረጡ።'
          : 'Please select which previous tenant is being replaced from your history.'
      );
      return;
    }
    if (!fullName.trim() || !phone.trim() || !idNumber.trim() || !idFrontImage || !idBackImage) {
      setErrorMsg(
        lang === 'am'
          ? 'እባክዎ የተከራዩን ሙሉ ስም፣ ስልክ፣ የመታወቂያ ቁጥር እና የፊት/ኋላ መታወቂያ ፎቶዎችን ይሙሉ።'
          : 'Please fill in full name, phone, ID number, and both front & back ID photos.'
      );
      return;
    }
    if (livingArrangement === 'with_others' && coResidents.length === 0) {
      setErrorMsg(
        lang === 'am'
          ? 'ከሌሎች ሰዎች ጋር የሚኖር ከሆነ ቢያንስ የአንድ አብሮ የሚኖር ሰው ስም ያስገቡ።'
          : 'Please add at least one co-resident name.'
      );
      return;
    }
    setReviewOpen(true);
  }

  async function handleConfirmSubmitTenant() {
    setBusy(true);
    setErrorMsg('');
    try {
      const tenantPayload = {
        fullName,
        phone,
        maritalStatus,
        livingArrangement,
        coResidents,
        occupation,
        idType: (isPoliceOccupation ? 'police_digital' : 'fayda') as 'fayda' | 'police_digital',
        idNumber,
        idFrontImage,
        idBackImage,
        portraitImage: portraitImage || undefined,
        roomLabel,
        moveInDate,
        replacedTenant: entryMode === 'replace_tenant' ? selectedReplacedTenant : undefined,
      };
      if (isCloudConnected) {
        await registerTenant(firebaseUid, landlord, tenantPayload);
      } else {
        await registerFallbackTenant(firebaseUid, landlord, tenantPayload);
      }
      setReviewOpen(false);
      setFullName('');
      setPhone('');
      setCoResidents([]);
      setIdNumber('');
      setIdFrontImage('');
      setIdBackImage('');
      setPortraitImage('');
      setReplacedTenantId('');
      setEntryMode('new_room');
      setSuccessMsg(
        lang === 'am'
          ? `የተከራይ መረጃው በተሳካ ሁኔታ ተመዝግቦ ለ${landlord.city} / ${landlord.woreda} / ${landlord.kebele} ፖሊስ ተልኳል።`
          : `Tenant registered and sent to ${landlord.city} / ${landlord.woreda} / ${landlord.kebele} Police.`
      );
      setTab('my_tenants');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'መላክ አልተቻለም');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveAddressChange(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const addressUpdates = {
        region: addrRegion,
        zone: addrZone,
        city: addrCity,
        woreda: addrWoreda,
        kebele: addrKebele,
        houseNumber: addrHouseNo,
        roomCount: Number(addrRooms) || 1,
        phone: addrPhone,
      };
      if (isCloudConnected) {
        await updateLandlordAddress(firebaseUid, landlord, addressUpdates);
      } else {
        await updateFallbackLandlordAddress(firebaseUid, landlord, addressUpdates);
      }
      setSuccessMsg(
        lang === 'am'
          ? 'አዲሱ የአከራይ ቤት እና አድራሻ በሲስተሙና በታሪክ መዝገብ ውስጥ ተቀምጧል።'
          : 'Updated house & address saved and logged to history.'
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ማስተካከል አልተቻለም');
    } finally {
      setBusy(false);
    }
  }

  async function handleMoveOutTenant(item: Tenant) {
    setBusy(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      if (isCloudConnected) {
        await markTenantMovedOut(firebaseUid, 'landlord', landlord.fullName, item);
      } else {
        await markFallbackTenantMovedOut(firebaseUid, 'landlord', landlord.fullName, item);
      }
      setSuccessMsg(
        lang === 'am'
          ? `ተከራይ ${item.fullName} መልቀቁ በታሪክ መዝገብ ውስጥ ተመዝግቧል።`
          : `Tenant ${item.fullName} marked as moved out.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'መመዝገብ አልተቻለም');
    } finally {
      setBusy(false);
    }
  }

  async function handleAddAdditionalProperty(e: React.FormEvent) {
    e.preventDefault();
    if (
      !newPropRegion ||
      !newPropZone ||
      !newPropCity ||
      !newPropWoreda ||
      !newPropKebele ||
      !newPropHouseNo.trim() ||
      newPropPass.length < 4
    ) {
      setErrorMsg(
        lang === 'am'
          ? 'እባክዎ የአዲሱን ቤት ክልል፣ ዞን፣ ከተማ፣ ወረዳ፣ ቀበሌ፣ የቤት ቁጥር እና የይለፍ ቃልዎን ያስገቡ።'
          : 'Please complete region, zone, city, woreda, kebele, house number, and password confirmation.'
      );
      return;
    }
    setBusy(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const passOk = await verifyPassword(
        newPropPass,
        landlord.passwordSalt,
        landlord.passwordHash
      );
      if (!passOk) {
        setErrorMsg(
          lang === 'am'
            ? 'የገባው የይለፍ ቃል ከመለያዎ የይለፍ ቃል ጋር አይመሳሰልም።'
            : 'Entered password does not match your account password.'
        );
        return;
      }

      const propPayload = {
        fullName: landlord.fullName,
        phone: landlord.phone,
        region: newPropRegion,
        zone: newPropZone,
        city: newPropCity,
        woreda: newPropWoreda,
        kebele: newPropKebele,
        houseNumber: newPropHouseNo,
        roomCount: Number(newPropRooms) || 1,
        faydaId: landlord.faydaId,
        idFrontImage: landlord.idFrontImage,
        idBackImage: landlord.idBackImage,
        password: newPropPass,
      };
      const created = isCloudConnected
        ? await registerLandlord(firebaseUid, propPayload, 'landlord', landlord.fullName)
        : await registerFallbackLandlord(firebaseUid, propPayload, 'landlord', landlord.fullName);
      setSelectedLandlordId(created.landlordId);
      setNewPropHouseNo('');
      setNewPropPass('');
      setSuccessMsg(
        lang === 'am'
          ? `አዲስ ተጨማሪ የኪራይ ቤት (ቤት ቁጥር ${created.houseNumber}) ተመዝግቧል።`
          : `Additional rental house (#${created.houseNumber}) registered.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'አዲስ ቤት መመዝገብ አልተቻለም');
    } finally {
      setBusy(false);
    }
  }

  const newPropZones = useMemo(
    () =>
      Array.from(
        new Set(
          jurisdictions
            .filter((j) => !newPropRegion || (j.region || DEFAULT_REGION_NAME) === newPropRegion)
            .map((j) => (j.zone || inferZoneForCity(j.city)).trim())
            .filter(Boolean)
        )
      ),
    [jurisdictions, newPropRegion]
  );

  const newPropCities = useMemo(
    () =>
      Array.from(
        new Set(
          jurisdictions
            .filter(
              (j) =>
                (!newPropRegion || (j.region || DEFAULT_REGION_NAME) === newPropRegion) &&
                (!newPropZone || (j.zone || inferZoneForCity(j.city)) === newPropZone)
            )
            .map((j) => j.city)
        )
      ),
    [jurisdictions, newPropRegion, newPropZone]
  );

  const newPropWoredas = useMemo(
    () =>
      Array.from(
        new Set(
          jurisdictions
            .filter(
              (j) =>
                (!newPropRegion || (j.region || DEFAULT_REGION_NAME) === newPropRegion) &&
                (!newPropZone || (j.zone || inferZoneForCity(j.city)) === newPropZone) &&
                (!newPropCity || j.city === newPropCity)
            )
            .map((j) => j.woreda)
        )
      ),
    [jurisdictions, newPropRegion, newPropZone, newPropCity]
  );

  const newPropKebeles = useMemo(
    () =>
      Array.from(
        new Set(
          jurisdictions
            .filter(
              (j) =>
                (!newPropRegion || (j.region || DEFAULT_REGION_NAME) === newPropRegion) &&
                (!newPropZone || (j.zone || inferZoneForCity(j.city)) === newPropZone) &&
                (!newPropCity || j.city === newPropCity) &&
                (!newPropWoreda || j.woreda === newPropWoreda)
            )
            .map((j) => j.kebele)
        )
      ),
    [jurisdictions, newPropRegion, newPropZone, newPropCity, newPropWoreda]
  );

  const filteredHistory = useMemo(() => {
    if (historyFilter === 'tenants') {
      return history.filter((h) => h.actionType === 'tenant_registered' || h.actionType === 'tenant_moved_out');
    }
    if (historyFilter === 'address') {
      return history.filter(
        (h) =>
          h.actionType === 'landlord_registered' ||
          h.actionType === 'landlord_address_changed' ||
          h.actionType === 'landlord_replaced'
      );
    }
    return history;
  }, [history, historyFilter]);

  const activeTenants = tenants.filter((item) => item.status === 'active');

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* 3-Zone Top Header */}
      <header className="bg-white border-b border-slate-200 px-3 sm:px-6 py-2.5 sm:py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-6">
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

          <nav className="hidden md:flex items-center gap-5 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => setTab('register_tenant')}
              className={`whitespace-nowrap shrink-0 pb-0.5 ${
                tab === 'register_tenant' ? 'text-slate-900 border-b-2 border-slate-900 font-semibold' : 'hover:text-slate-900'
              }`}
            >
              {t.tabRegisterTenant}
            </button>
            <button
              type="button"
              onClick={() => setTab('my_tenants')}
              className={`whitespace-nowrap shrink-0 pb-0.5 ${
                tab === 'my_tenants' ? 'text-slate-900 border-b-2 border-slate-900 font-semibold' : 'hover:text-slate-900'
              }`}
            >
              {t.tabMyTenants} ({activeTenants.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('change_address')}
              className={`whitespace-nowrap shrink-0 pb-0.5 ${
                tab === 'change_address' ? 'text-slate-900 border-b-2 border-slate-900 font-semibold' : 'hover:text-slate-900'
              }`}
            >
              {t.tabChangeAddress}
            </button>
            <button
              type="button"
              onClick={() => setTab('history')}
              className={`whitespace-nowrap shrink-0 pb-0.5 ${
                tab === 'history' ? 'text-slate-900 border-b-2 border-slate-900 font-semibold' : 'hover:text-slate-900'
              }`}
            >
              {t.tabHistory}
            </button>
          </nav>

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

      {/* Mobile Sticky Navigation Bar */}
      <div className="md:hidden sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200 px-3 py-2.5 flex gap-2 overflow-x-auto scrollbar-none">
        <button
          type="button"
          onClick={() => setTab('register_tenant')}
          className={`px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-bold whitespace-nowrap shrink-0 transition-colors ${
            tab === 'register_tenant' ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          {t.tabRegisterTenant}
        </button>
        <button
          type="button"
          onClick={() => setTab('my_tenants')}
          className={`px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-bold whitespace-nowrap shrink-0 transition-colors ${
            tab === 'my_tenants' ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          {t.tabMyTenants} ({activeTenants.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('change_address')}
          className={`px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-bold whitespace-nowrap shrink-0 transition-colors ${
            tab === 'change_address' ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          {t.tabChangeAddress}
        </button>
        <button
          type="button"
          onClick={() => setTab('history')}
          className={`px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-bold whitespace-nowrap shrink-0 transition-colors ${
            tab === 'history' ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          {t.tabHistory}
        </button>
      </div>

      <main className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* Ornamental System Title Banner */}
        <section className="bg-gradient-to-r from-slate-950 via-blue-950 to-slate-900 border border-amber-500/30 rounded-2xl px-4 py-4 sm:px-6 sm:py-5 text-center shadow-sm">
          <h2 className="text-lg sm:text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-200 to-emerald-300">
            {t.systemTitle}
          </h2>
          <p className="text-xs sm:text-sm text-cyan-300 font-bold mt-1">{branding.commissionName}</p>
        </section>

        {/* Strict Private Landlord Summary Strip (Own Data Only) */}
        <section className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-xs text-slate-500 mb-1">{t.landlordProfileLabel}</p>
            <h1 className="text-xl font-bold text-slate-900">{landlord.fullName}</h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 mt-1 tabular-nums">
              <span>{landlord.phone}</span>
              <span aria-hidden="true">·</span>
              <span>{landlord.faydaId}</span>
              <span aria-hidden="true">·</span>
              <span>
                {landlord.city} / {landlord.woreda} / {landlord.kebele} (#{landlord.houseNumber})
              </span>
            </div>
            {ownedLandlords.length > 1 && (
              <div className="mt-2.5 flex items-center gap-2">
                <label className="text-xs font-medium text-slate-600">{t.selectedPropertyLabel}</label>
                <select
                  value={landlord.landlordId}
                  onChange={(e) => setSelectedLandlordId(e.target.value)}
                  className="px-2.5 py-1 text-xs border border-slate-300 rounded-md bg-white text-slate-900"
                >
                  {ownedLandlords.map((prop) => (
                    <option key={prop.landlordId} value={prop.landlordId}>
                      {prop.city} / {prop.woreda} / {prop.kebele} — #{prop.houseNumber} ({prop.roomCount})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4 border-t md:border-t-0 md:border-l border-slate-200 pt-3 md:pt-0 md:pl-6">
            <div>
              <p className="text-xs text-slate-500">{t.roomsStat}</p>
              <p className="text-lg font-bold text-slate-900 tabular-nums">{landlord.roomCount}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">{t.activeTenantsStat}</p>
              <p className="text-lg font-bold text-slate-900 tabular-nums">{activeTenants.length}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">{t.totalRecordsStat}</p>
              <p className="text-lg font-bold text-slate-900 tabular-nums">{tenants.length}</p>
            </div>
          </div>
        </section>

        {errorMsg && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* TAB 1: REGISTER TENANT (NEW HOUSE OR REPLACING PREVIOUS TENANT) */}
        {tab === 'register_tenant' && (
          <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
            <div className="border-b border-slate-100 pb-4 mb-5">
              <h2 className="text-lg font-bold text-slate-900">{t.tenantFormTitle}</h2>
              <p className="text-xs text-slate-500 mt-1">
                {t.tenantFormDesc} ({landlord.city} / {landlord.woreda} / {landlord.kebele})
              </p>
            </div>

            <form onSubmit={handleOpenReview} className="space-y-5">
              {/* New Room vs Replacement Mode Selector */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <label className="block text-xs font-bold text-slate-800">{t.entryTypeLabel}</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setEntryMode('new_room');
                      setReplacedTenantId('');
                    }}
                    className={`p-3 rounded-lg border text-left text-xs font-semibold flex items-center gap-2.5 transition-colors ${
                      entryMode === 'new_room'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <Plus className="w-4 h-4 shrink-0" />
                    <span>{t.entryNewRoom}</span>
                  </button>

                  <button
                    type="button"
                    disabled={tenants.length === 0}
                    onClick={() => setEntryMode('replace_tenant')}
                    className={`p-3 rounded-lg border text-left text-xs font-semibold flex items-center gap-2.5 transition-colors disabled:opacity-50 ${
                      entryMode === 'replace_tenant'
                        ? 'bg-amber-500 text-slate-950 border-amber-500'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <RefreshCw className="w-4 h-4 shrink-0" />
                    <span>{t.entryReplaceTenant}</span>
                  </button>
                </div>

                {entryMode === 'replace_tenant' && (
                  <div className="pt-2 space-y-2">
                    <label className="block text-xs font-semibold text-slate-700">
                      {t.selectReplacedTenantLabel}
                    </label>
                    <select
                      required
                      value={replacedTenantId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setReplacedTenantId(val);
                        const match = tenants.find((item) => item.tenantId === val);
                        if (match?.roomLabel) {
                          setRoomLabel(match.roomLabel);
                        }
                      }}
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                    >
                      <option value="">{t.selectReplacedTenantPlaceholder}</option>
                      {tenants.map((prev) => (
                        <option key={prev.tenantId} value={prev.tenantId}>
                          {prev.fullName} — {prev.phone} ({prev.roomLabel} ·{' '}
                          {prev.status === 'active' ? t.statusActive : t.statusMovedOut})
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      {t.replacementBanner}
                    </p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t.tenantNameLabel}
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={150}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={lang === 'am' ? 'ሙሉ ስም ከነአያት' : 'Full name'}
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t.tenantPhoneLabel}
                  </label>
                  <input
                    type="tel"
                    required
                    maxLength={30}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="09..."
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t.maritalStatusLabel}
                  </label>
                  <select
                    value={maritalStatus}
                    onChange={(e) => setMaritalStatus(e.target.value as 'married' | 'single')}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    <option value="single">{t.singleOption}</option>
                    <option value="married">{t.marriedOption}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t.livingArrangementLabel}
                  </label>
                  <select
                    value={livingArrangement}
                    onChange={(e) =>
                      setLivingArrangement(e.target.value as 'alone' | 'with_others')
                    }
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    <option value="alone">{t.aloneOption}</option>
                    <option value="with_others">{t.withOthersOption}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t.occupationLabel}
                  </label>
                  <select
                    value={occupation}
                    onChange={(e) => setOccupation(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    {OCCUPATION_OPTIONS.map((occ) => (
                      <option key={occ} value={occ}>
                        {occ}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t.roomAndDateLabel}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={roomLabel}
                      onChange={(e) => setRoomLabel(e.target.value)}
                      placeholder="ክፍል 1"
                      className="w-full px-2.5 py-2.5 border border-slate-300 rounded-lg text-xs"
                    />
                    <input
                      type="date"
                      value={moveInDate}
                      onChange={(e) => setMoveInDate(e.target.value)}
                      className="w-full px-2.5 py-2.5 border border-slate-300 rounded-lg text-xs tabular-nums"
                    />
                  </div>
                </div>
              </div>

              {livingArrangement === 'with_others' && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                  <label className="block text-xs font-semibold text-slate-700">
                    {t.coResidentsTitle}
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={coResidentInput}
                      onChange={(e) => setCoResidentInput(e.target.value)}
                      placeholder={lang === 'am' ? 'አብሮ የሚኖር ሰው ሙሉ ስም' : 'Co-resident full name'}
                      className="flex-1 px-3.5 py-2.5 min-h-[44px] border border-slate-300 rounded-xl text-sm bg-white"
                    />
                    <button
                      type="button"
                      onClick={handleAddCoResident}
                      className="px-4 py-2.5 min-h-[44px] bg-slate-900 text-white text-xs sm:text-sm font-bold rounded-xl hover:bg-slate-800 inline-flex items-center justify-center gap-1.5 shrink-0"
                    >
                      <Plus className="w-4 h-4" />
                      {t.addBtn}
                    </button>
                  </div>
                  {coResidents.length > 0 && (
                    <ul className="divide-y divide-slate-200 bg-white border border-slate-200 rounded-lg">
                      {coResidents.map((name, idx) => (
                        <li
                          key={`${name}-${idx}`}
                          className="px-3 py-2 flex items-center justify-between text-sm"
                        >
                          <span>
                            {idx + 1}. {name}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setCoResidents((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="text-xs text-red-600 hover:underline"
                          >
                            {t.removeBtn}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {isPoliceOccupation ? t.policeIdHeading : t.faydaIdHeading}
                  </h3>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {isPoliceOccupation ? t.policeDigitalIdLabel : t.faydaIdLabel}
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={60}
                    value={idNumber}
                    onChange={(e) => setIdNumber(e.target.value)}
                    placeholder={isPoliceOccupation ? 'Police Digital ID No.' : 'Fayda ID No.'}
                    className="w-full sm:w-1/2 px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white font-mono-tabular"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <SmartPhotoInput
                    label={t.idFrontLabel}
                    value={idFrontImage}
                    onChange={setIdFrontImage}
                    cropMode="id_card"
                    cameraFacing="environment"
                    theme="light"
                    lang={lang}
                    previewAlt="ID Front"
                  />

                  <SmartPhotoInput
                    label={t.idBackLabel}
                    value={idBackImage}
                    onChange={setIdBackImage}
                    cropMode="id_card"
                    cameraFacing="environment"
                    theme="light"
                    lang={lang}
                    previewAlt="ID Back"
                  />

                  <SmartPhotoInput
                    label={t.portraitLabel}
                    value={portraitImage}
                    onChange={setPortraitImage}
                    cropMode="portrait"
                    cameraFacing="environment"
                    theme="light"
                    lang={lang}
                    previewAlt="Tenant Portrait"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="w-full sm:w-auto px-6 py-3 min-h-[44px] bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  {t.reviewBeforeSendBtn}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* TAB 2: MY TENANTS (STRICTLY OWN TENANTS) */}
        {tab === 'my_tenants' && (
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">{t.myTenantsTitle}</h2>
                <p className="text-xs text-slate-500">{t.myTenantsSubtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setTab('register_tenant')}
                className="w-full sm:w-auto px-3.5 py-2.5 min-h-[40px] bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800 inline-flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                {t.addNewTenantBtn}
              </button>
            </div>

            {tenants.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <Users className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-sm font-medium text-slate-700">{t.noTenantsEmpty}</p>
                <button
                  type="button"
                  onClick={() => setTab('register_tenant')}
                  className="px-4 py-2.5 min-h-[40px] bg-slate-900 text-white text-xs font-medium rounded-lg"
                >
                  {t.registerFirstTenantBtn}
                </button>
              </div>
            ) : (
              <>
                {/* Mobile Card List */}
                <div className="sm:hidden divide-y divide-slate-200">
                  {tenants.map((item) => (
                    <div key={item.tenantId} className="p-4 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-slate-900 truncate">{item.fullName}</p>
                          <p className="text-xs text-slate-600 tabular-nums mt-0.5">{item.phone}</p>
                        </div>
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded shrink-0 ${
                            item.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {item.status === 'active' ? t.statusActive : t.statusMovedOut}
                        </span>
                      </div>
                      {item.replacedTenantName && (
                        <p className="text-xs text-amber-700">
                          {lang === 'am'
                            ? `በ ${item.replacedTenantName} ምትክ`
                            : `Replaced ${item.replacedTenantName}`}
                        </p>
                      )}
                      <div className="text-xs text-slate-600 space-y-0.5">
                        <p>
                          {item.occupation} · <span className="font-mono-tabular">{item.idNumber}</span>
                        </p>
                        <p className="tabular-nums">
                          {item.roomLabel} · {item.moveInDate}
                        </p>
                        <p className="text-slate-500">
                          {item.livingArrangement === 'alone'
                            ? t.aloneOption
                            : item.coResidents.join('፣ ')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setSelectedTenant(item)}
                          className="flex-1 py-2 px-3 min-h-[40px] text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg"
                        >
                          {t.detailsBtn}
                        </button>
                        {item.status === 'active' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleMoveOutTenant(item)}
                            className="flex-1 py-2 px-3 min-h-[40px] text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg"
                          >
                            {t.markMovedOutBtn}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                        <th className="py-3 px-4">{t.tenantNameLabel.replace(' *', '')}</th>
                        <th className="py-3 px-4">{t.tenantPhoneLabel.replace(' *', '')}</th>
                        <th className="py-3 px-4">{t.occupationLabel.replace(' *', '')}</th>
                        <th className="py-3 px-4">{t.livingArrangementLabel.replace(' *', '')}</th>
                        <th className="py-3 px-4">{t.roomAndDateLabel}</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {tenants.map((item) => (
                        <tr key={item.tenantId} className="hover:bg-slate-50">
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-900">{item.fullName}</div>
                            {item.replacedTenantName && (
                              <div className="text-xs text-amber-700">
                                {lang === 'am'
                                  ? `በ ${item.replacedTenantName} ምትክ`
                                  : `Replaced ${item.replacedTenantName}`}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 tabular-nums text-slate-600">{item.phone}</td>
                          <td className="py-3 px-4 text-slate-600">
                            <div>{item.occupation}</div>
                            <div className="text-xs text-slate-400 font-mono-tabular">{item.idNumber}</div>
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-600">
                            {item.livingArrangement === 'alone'
                              ? t.aloneOption
                              : `${item.coResidents.join('፣ ')}`}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-600 tabular-nums">
                            {item.roomLabel} · {item.moveInDate}
                          </td>
                          <td className="py-3 px-4 text-xs font-medium">
                            {item.status === 'active' ? (
                              <span className="text-emerald-700">{t.statusActive}</span>
                            ) : (
                              <span className="text-slate-500">{t.statusMovedOut}</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right space-x-3 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setSelectedTenant(item)}
                              className="text-xs font-medium text-slate-700 hover:text-slate-900 underline"
                            >
                              {t.detailsBtn}
                            </button>
                            {item.status === 'active' && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleMoveOutTenant(item)}
                                className="text-xs font-medium text-amber-700 hover:underline"
                              >
                                {t.markMovedOutBtn}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        )}

        {/* TAB 3: CHANGE HOUSE / ADDRESS & REGISTER ADDITIONAL PROPERTY */}
        {tab === 'change_address' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-white border border-slate-200 rounded-xl p-6">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-5">
                <MapPin className="w-5 h-5 text-slate-700" />
                <div>
                  <h2 className="text-base font-bold text-slate-900">{t.changeAddressTitle}</h2>
                  <p className="text-xs text-slate-500">{t.changeAddressDesc}</p>
                </div>
              </div>

              <form onSubmit={handleSaveAddressChange} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {t.regionLabel}
                    </label>
                    <select
                      required
                      value={addrRegion}
                      onChange={(e) => {
                        setAddrRegion(e.target.value);
                        setAddrZone('');
                        setAddrCity('');
                        setAddrWoreda('');
                        setAddrKebele('');
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                    >
                      <option value="">{t.selectRegion}</option>
                      {regions.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {t.zoneLabel}
                    </label>
                    <select
                      required
                      value={addrZone}
                      onChange={(e) => {
                        setAddrZone(e.target.value);
                        setAddrCity('');
                        setAddrWoreda('');
                        setAddrKebele('');
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                    >
                      <option value="">{t.selectZone}</option>
                      {zones.map((z) => (
                        <option key={z} value={z}>
                          {z}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {t.cityLabel}
                    </label>
                    <select
                      required
                      value={addrCity}
                      onChange={(e) => {
                        setAddrCity(e.target.value);
                        setAddrWoreda('');
                        setAddrKebele('');
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
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
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {t.woredaLabel}
                    </label>
                    <select
                      required
                      value={addrWoreda}
                      onChange={(e) => {
                        setAddrWoreda(e.target.value);
                        setAddrKebele('');
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
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
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {t.kebeleLabel}
                    </label>
                    <select
                      required
                      value={addrKebele}
                      onChange={(e) => setAddrKebele(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
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
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {t.houseNoLabel}
                    </label>
                    <input
                      type="text"
                      required
                      value={addrHouseNo}
                      onChange={(e) => setAddrHouseNo(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {t.roomCountLabel}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      required
                      value={addrRooms}
                      onChange={(e) => setAddrRooms(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {t.tenantPhoneLabel}
                    </label>
                    <input
                      type="tel"
                      required
                      value={addrPhone}
                      onChange={(e) => setAddrPhone(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full sm:w-auto px-5 py-3 min-h-[46px] bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold rounded-xl inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <Home className="w-4 h-4" />
                  {busy ? '...' : t.saveAddressBtn}
                </button>
              </form>
            </section>

            {/* Register Additional Rental Property After Login */}
            <section className="bg-white border border-slate-200 rounded-xl p-6">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-5">
                <Building2 className="w-5 h-5 text-slate-700" />
                <div>
                  <h2 className="text-base font-bold text-slate-900">{t.addPropertyTitle}</h2>
                  <p className="text-xs text-slate-500">{t.addPropertyDesc}</p>
                </div>
              </div>

              <form onSubmit={handleAddAdditionalProperty} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {t.regionLabel}
                    </label>
                    <select
                      required
                      value={newPropRegion}
                      onChange={(e) => {
                        setNewPropRegion(e.target.value);
                        setNewPropZone('');
                        setNewPropCity('');
                        setNewPropWoreda('');
                        setNewPropKebele('');
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                    >
                      <option value="">{t.selectRegion}</option>
                      {regions.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {t.zoneLabel}
                    </label>
                    <select
                      required
                      value={newPropZone}
                      onChange={(e) => {
                        setNewPropZone(e.target.value);
                        setNewPropCity('');
                        setNewPropWoreda('');
                        setNewPropKebele('');
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                    >
                      <option value="">{t.selectZone}</option>
                      {newPropZones.map((z) => (
                        <option key={z} value={z}>
                          {z}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {t.cityLabel}
                    </label>
                    <select
                      required
                      value={newPropCity}
                      onChange={(e) => {
                        setNewPropCity(e.target.value);
                        setNewPropWoreda('');
                        setNewPropKebele('');
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                    >
                      <option value="">{t.selectCity}</option>
                      {newPropCities.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {t.woredaLabel}
                    </label>
                    <select
                      required
                      value={newPropWoreda}
                      onChange={(e) => {
                        setNewPropWoreda(e.target.value);
                        setNewPropKebele('');
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                    >
                      <option value="">{t.selectWoreda}</option>
                      {newPropWoredas.map((w) => (
                        <option key={w} value={w}>
                          {w}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {t.kebeleLabel}
                    </label>
                    <select
                      required
                      value={newPropKebele}
                      onChange={(e) => setNewPropKebele(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                    >
                      <option value="">{t.selectKebele}</option>
                      {newPropKebeles.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {t.houseNoLabel}
                    </label>
                    <input
                      type="text"
                      required
                      value={newPropHouseNo}
                      onChange={(e) => setNewPropHouseNo(e.target.value)}
                      placeholder="208"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {t.roomCountLabel}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      required
                      value={newPropRooms}
                      onChange={(e) => setNewPropRooms(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {t.passwordLabel} *
                    </label>
                    <input
                      type="password"
                      required
                      value={newPropPass}
                      onChange={(e) => setNewPropPass(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full sm:w-auto px-5 py-3 min-h-[46px] bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold rounded-xl inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  {busy ? '...' : t.addPropertyBtn}
                </button>
              </form>
            </section>
          </div>
        )}

        {/* TAB 4: STRICTLY OWN ACTIVITY HISTORY */}
        {tab === 'history' && (
          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-slate-700" />
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    {t.historyTitle} ({filteredHistory.length})
                  </h2>
                  <p className="text-xs text-slate-500">{t.historySubtitle}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setHistoryFilter('all')}
                  className={`px-3 py-1.5 min-h-[36px] text-xs font-medium rounded-md ${
                    historyFilter === 'all' ? 'bg-slate-900 text-white' : 'text-slate-600'
                  }`}
                >
                  {t.filterAll}
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryFilter('tenants')}
                  className={`px-3 py-1.5 min-h-[36px] text-xs font-medium rounded-md ${
                    historyFilter === 'tenants' ? 'bg-slate-900 text-white' : 'text-slate-600'
                  }`}
                >
                  {t.filterTenants}
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryFilter('address')}
                  className={`px-3 py-1.5 min-h-[36px] text-xs font-medium rounded-md ${
                    historyFilter === 'address' ? 'bg-slate-900 text-white' : 'text-slate-600'
                  }`}
                >
                  {t.filterAddress}
                </button>
              </div>
            </div>
            {filteredHistory.length === 0 ? (
              <p className="text-sm text-slate-500">
                {lang === 'am' ? 'እስካሁን የተመዘገበ ታሪክ የለም።' : 'No history records yet.'}
              </p>
            ) : (
              <div className="divide-y divide-slate-200">
                {filteredHistory.map((h) => (
                  <div
                    key={h.historyId}
                    className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">{h.details}</p>
                      <p className="text-xs text-slate-500">
                        {h.city} / {h.woreda} / {h.kebele}
                      </p>
                    </div>
                    <span className="text-xs text-slate-500 tabular-nums shrink-0">
                      {formatDateAm(h.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {/* Pre-Send Verification Modal */}
      {reviewOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-2.5 sm:p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full max-h-[90dvh] overflow-y-auto overflow-x-hidden p-4 sm:p-6 space-y-5">
            <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
              <UserCheck className="w-5 h-5 text-slate-900" />
              <div>
                <h3 className="text-lg font-bold text-slate-900">{t.confirmSendTitle}</h3>
                <p className="text-xs text-slate-500">{t.confirmSendSubtitle}</p>
              </div>
            </div>

            {selectedReplacedTenant && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 font-semibold">
                {lang === 'am'
                  ? `ምትክ ምዝገባ፦ በቀድሞ ተከራይ "${selectedReplacedTenant.fullName}" ምትክ የሚገባ`
                  : `Replacement Entry: Replacing previous tenant "${selectedReplacedTenant.fullName}"`}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div>
                <span className="text-xs text-slate-500 block">{t.tenantNameLabel.replace(' *', '')}</span>
                <span className="font-semibold text-slate-900">{fullName}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">{t.tenantPhoneLabel.replace(' *', '')}</span>
                <span className="font-semibold text-slate-900 tabular-nums">{phone}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">{t.maritalStatusLabel.replace(' *', '')}</span>
                <span className="font-medium text-slate-900">
                  {maritalStatus === 'married' ? t.marriedOption : t.singleOption}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">{t.livingArrangementLabel.replace(' *', '')}</span>
                <span className="font-medium text-slate-900">
                  {livingArrangement === 'alone' ? t.aloneOption : coResidents.join('፣ ')}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">{t.occupationLabel.replace(' *', '')}</span>
                <span className="font-medium text-slate-900">{occupation}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">ID</span>
                <span className="font-semibold text-slate-900 font-mono-tabular">{idNumber}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {sanitizeImageSrc(portraitImage) && (
                <div>
                  <p className="text-xs text-slate-500 mb-1">{t.portraitLabel}</p>
                  <img
                    src={sanitizeImageSrc(portraitImage)}
                    alt="Portrait"
                    className="h-32 w-full object-contain border border-slate-200 rounded-lg"
                  />
                </div>
              )}
              <div>
                <p className="text-xs text-slate-500 mb-1">{t.idFrontLabel}</p>
                <img
                  src={sanitizeImageSrc(idFrontImage)}
                  alt="Front"
                  className="h-32 w-full object-contain border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">{t.idBackLabel}</p>
                <img
                  src={sanitizeImageSrc(idBackImage)}
                  alt="Back"
                  className="h-32 w-full object-contain border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 sm:gap-3 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setReviewOpen(false)}
                className="w-full sm:w-auto px-4 py-2.5 min-h-[44px] text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                {t.backToEditBtn}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleConfirmSubmitTenant()}
                className="w-full sm:w-auto px-5 py-2.5 min-h-[44px] text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg inline-flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                {busy ? t.sendingBtn : t.sendToPoliceBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tenant Details Modal with Full Photos */}
      {selectedTenant && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-2.5 sm:p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full max-h-[90dvh] overflow-y-auto overflow-x-hidden p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-slate-900 truncate">{selectedTenant.fullName}</h3>
                <p className="text-xs text-slate-500 tabular-nums">
                  {selectedTenant.phone} · {selectedTenant.roomLabel} · {selectedTenant.moveInDate}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTenant(null)}
                className="px-3.5 py-2 min-h-[40px] text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg shrink-0"
              >
                {t.closeBtn}
              </button>
            </div>

            {selectedTenant.replacedTenantName && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 font-medium">
                {lang === 'am'
                  ? `በቀድሞ ተከራይ "${selectedTenant.replacedTenantName}" ምትክ የገባ`
                  : `Replaced previous tenant "${selectedTenant.replacedTenantName}"`}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div>
                <span className="text-xs text-slate-500 block">{t.maritalStatusLabel.replace(' *', '')}</span>
                <span className="font-medium text-slate-900">
                  {selectedTenant.maritalStatus === 'married' ? t.marriedOption : t.singleOption}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">{t.livingArrangementLabel.replace(' *', '')}</span>
                <span className="font-medium text-slate-900">
                  {selectedTenant.livingArrangement === 'alone'
                    ? t.aloneOption
                    : selectedTenant.coResidents.join('፣ ')}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">{t.occupationLabel.replace(' *', '')}</span>
                <span className="font-medium text-slate-900">{selectedTenant.occupation}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">ID</span>
                <span className="font-medium text-slate-900 font-mono-tabular">
                  {selectedTenant.idNumber}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {sanitizeImageSrc(selectedTenant.portraitImage) && (
                <div>
                  <p className="text-xs text-slate-500 mb-1">{t.portraitLabel}</p>
                  <img
                    src={sanitizeImageSrc(selectedTenant.portraitImage)}
                    alt="Portrait"
                    className="h-36 w-full object-contain border border-slate-200 rounded-lg"
                  />
                </div>
              )}
              <div>
                <p className="text-xs text-slate-500 mb-1">{t.idFrontLabel}</p>
                <img
                  src={sanitizeImageSrc(selectedTenant.idFrontImage)}
                  alt="Front ID"
                  className="h-36 w-full object-contain border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">{t.idBackLabel}</p>
                <img
                  src={sanitizeImageSrc(selectedTenant.idBackImage)}
                  alt="Back ID"
                  className="h-36 w-full object-contain border border-slate-200 rounded-lg"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
