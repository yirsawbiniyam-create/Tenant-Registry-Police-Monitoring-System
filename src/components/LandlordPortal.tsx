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
  Upload,
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
import { compressImageFile, formatDateAm, toJsDate } from '../utils/crypto';
import { OCCUPATION_OPTIONS } from '../utils/seedData';
import {
  markTenantMovedOut,
  registerLandlord,
  registerTenant,
  subscribeLandlordOwnData,
  updateLandlordAddress,
} from '../services/firestoreService';
import { BrandingImage } from './BrandingImage';
import { DICT, type Lang } from '../i18n';

interface LandlordPortalProps {
  lang: Lang;
  onToggleLang: () => void;
  firebaseUid: string;
  initialLandlord: Landlord;
  branding: BrandingSetting;
  jurisdictions: Jurisdiction[];
  onLogout: () => void;
}

type LandlordTab = 'register_tenant' | 'my_tenants' | 'change_address' | 'history';

export const LandlordPortal: React.FC<LandlordPortalProps> = ({
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

  // Address Change State
  const [addrCity, setAddrCity] = useState(initialLandlord.city);
  const [addrWoreda, setAddrWoreda] = useState(initialLandlord.woreda);
  const [addrKebele, setAddrKebele] = useState(initialLandlord.kebele);
  const [addrHouseNo, setAddrHouseNo] = useState(initialLandlord.houseNumber);
  const [addrRooms, setAddrRooms] = useState(String(initialLandlord.roomCount));
  const [addrPhone, setAddrPhone] = useState(initialLandlord.phone);

  // Add Additional Rental House State
  const [newPropCity, setNewPropCity] = useState(initialLandlord.city);
  const [newPropWoreda, setNewPropWoreda] = useState(initialLandlord.woreda);
  const [newPropKebele, setNewPropKebele] = useState(initialLandlord.kebele);
  const [newPropHouseNo, setNewPropHouseNo] = useState('');
  const [newPropRooms, setNewPropRooms] = useState('1');
  const [newPropPass, setNewPropPass] = useState('');

  const isPoliceOccupation = occupation === 'ፖሊስ';

  useEffect(() => {
    setAddrCity(landlord.city);
    setAddrWoreda(landlord.woreda);
    setAddrKebele(landlord.kebele);
    setAddrHouseNo(landlord.houseNumber);
    setAddrRooms(String(landlord.roomCount));
    setAddrPhone(landlord.phone);
  }, [
    landlord.landlordId,
    landlord.city,
    landlord.woreda,
    landlord.kebele,
    landlord.houseNumber,
    landlord.roomCount,
    landlord.phone,
  ]);

  useEffect(() => {
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
  }, [firebaseUid]);

  const selectedReplacedTenant = useMemo(
    () => tenants.find((item) => item.tenantId === replacedTenantId),
    [tenants, replacedTenantId]
  );

  const cities = useMemo(
    () => Array.from(new Set(jurisdictions.map((j) => j.city))),
    [jurisdictions]
  );
  const woredas = useMemo(
    () =>
      Array.from(
        new Set(
          jurisdictions
            .filter((j) => !addrCity || j.city === addrCity)
            .map((j) => j.woreda)
        )
      ),
    [jurisdictions, addrCity]
  );
  const kebeles = useMemo(
    () =>
      Array.from(
        new Set(
          jurisdictions
            .filter((j) => (!addrCity || j.city === addrCity) && (!addrWoreda || j.woreda === addrWoreda))
            .map((j) => j.kebele)
        )
      ),
    [jurisdictions, addrCity, addrWoreda]
  );

  async function handleImageUpload(
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
      await registerTenant(firebaseUid, landlord, {
        fullName,
        phone,
        maritalStatus,
        livingArrangement,
        coResidents,
        occupation,
        idType: isPoliceOccupation ? 'police_digital' : 'fayda',
        idNumber,
        idFrontImage,
        idBackImage,
        portraitImage: portraitImage || undefined,
        roomLabel,
        moveInDate,
        replacedTenant: entryMode === 'replace_tenant' ? selectedReplacedTenant : undefined,
      });
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
      await updateLandlordAddress(firebaseUid, landlord, {
        city: addrCity,
        woreda: addrWoreda,
        kebele: addrKebele,
        houseNumber: addrHouseNo,
        roomCount: Number(addrRooms) || 1,
        phone: addrPhone,
      });
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
      await markTenantMovedOut(firebaseUid, 'landlord', landlord.fullName, item);
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
    if (!newPropCity || !newPropWoreda || !newPropKebele || !newPropHouseNo.trim() || newPropPass.length < 4) {
      setErrorMsg(
        lang === 'am'
          ? 'እባክዎ የአዲሱን ቤት ከተማ፣ ወረዳ፣ ቀበሌ፣ የቤት ቁጥር እና የይለፍ ቃልዎን ያስገቡ።'
          : 'Please complete city, woreda, kebele, house number, and password confirmation.'
      );
      return;
    }
    setBusy(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const created = await registerLandlord(
        firebaseUid,
        {
          fullName: landlord.fullName,
          phone: landlord.phone,
          city: newPropCity,
          woreda: newPropWoreda,
          kebele: newPropKebele,
          houseNumber: newPropHouseNo,
          roomCount: Number(newPropRooms) || 1,
          faydaId: landlord.faydaId,
          idFrontImage: landlord.idFrontImage,
          idBackImage: landlord.idBackImage,
          password: newPropPass,
        },
        'landlord',
        landlord.fullName
      );
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

  const newPropWoredas = useMemo(
    () =>
      Array.from(
        new Set(
          jurisdictions
            .filter((j) => !newPropCity || j.city === newPropCity)
            .map((j) => j.woreda)
        )
      ),
    [jurisdictions, newPropCity]
  );

  const newPropKebeles = useMemo(
    () =>
      Array.from(
        new Set(
          jurisdictions
            .filter((j) => (!newPropCity || j.city === newPropCity) && (!newPropWoreda || j.woreda === newPropWoreda))
            .map((j) => j.kebele)
        )
      ),
    [jurisdictions, newPropCity, newPropWoreda]
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
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 sm:gap-6">
          <div className="flex items-center gap-3 min-w-0">
            <BrandingImage
              src={branding.logoDataUrl}
              alt={branding.commissionName}
              className="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0"
            />
            <span className="text-sm sm:text-base font-bold text-slate-900 whitespace-nowrap truncate">
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
              className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap shrink-0"
            >
              <Globe className="w-3.5 h-3.5" />
              {t.langToggle}
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              {t.logout}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Bar */}
      <div className="md:hidden bg-white border-b border-slate-200 px-3 py-2 flex gap-1.5 overflow-x-auto">
        <button
          type="button"
          onClick={() => setTab('register_tenant')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap ${
            tab === 'register_tenant' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
          }`}
        >
          {t.tabRegisterTenant}
        </button>
        <button
          type="button"
          onClick={() => setTab('my_tenants')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap ${
            tab === 'my_tenants' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
          }`}
        >
          {t.tabMyTenants} ({activeTenants.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('change_address')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap ${
            tab === 'change_address' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
          }`}
        >
          {t.tabChangeAddress}
        </button>
        <button
          type="button"
          onClick={() => setTab('history')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap ${
            tab === 'history' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
          }`}
        >
          {t.tabHistory}
        </button>
      </div>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Ornamental System Title Banner */}
        <section className="bg-gradient-to-r from-slate-950 via-blue-950 to-slate-900 border border-amber-500/30 rounded-xl px-6 py-4 text-center">
          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-amber-200 to-white">
            {t.systemTitle}
          </h2>
          <p className="text-xs text-amber-300 font-medium mt-0.5">{branding.commissionName}</p>
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
          <section className="bg-white border border-slate-200 rounded-xl p-6">
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
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={roomLabel}
                      onChange={(e) => setRoomLabel(e.target.value)}
                      placeholder="ክፍል 1"
                      className="w-1/2 px-2.5 py-2.5 border border-slate-300 rounded-lg text-xs"
                    />
                    <input
                      type="date"
                      value={moveInDate}
                      onChange={(e) => setMoveInDate(e.target.value)}
                      className="w-1/2 px-2 py-2.5 border border-slate-300 rounded-lg text-xs tabular-nums"
                    />
                  </div>
                </div>
              </div>

              {livingArrangement === 'with_others' && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                  <label className="block text-xs font-semibold text-slate-700">
                    {t.coResidentsTitle}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={coResidentInput}
                      onChange={(e) => setCoResidentInput(e.target.value)}
                      placeholder={lang === 'am' ? 'አብሮ የሚኖር ሰው ሙሉ ስም' : 'Co-resident full name'}
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                    />
                    <button
                      type="button"
                      onClick={handleAddCoResident}
                      className="px-4 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800 inline-flex items-center gap-1"
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
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      {t.idFrontLabel}
                    </label>
                    <label className="flex flex-col items-center justify-center border border-dashed border-slate-300 bg-white rounded-lg p-3 cursor-pointer hover:bg-slate-50">
                      {idFrontImage ? (
                        <img src={idFrontImage} alt="ID Front" className="h-28 w-full object-contain" />
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs text-slate-600 py-6">
                          <Upload className="w-4 h-4" />
                          <span>{t.uploadFront}</span>
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => void handleImageUpload(e, setIdFrontImage)}
                      />
                    </label>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      {t.idBackLabel}
                    </label>
                    <label className="flex flex-col items-center justify-center border border-dashed border-slate-300 bg-white rounded-lg p-3 cursor-pointer hover:bg-slate-50">
                      {idBackImage ? (
                        <img src={idBackImage} alt="ID Back" className="h-28 w-full object-contain" />
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs text-slate-600 py-6">
                          <Upload className="w-4 h-4" />
                          <span>{t.uploadBack}</span>
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => void handleImageUpload(e, setIdBackImage)}
                      />
                    </label>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      {t.portraitLabel}
                    </label>
                    <label className="flex flex-col items-center justify-center border border-dashed border-slate-300 bg-white rounded-lg p-3 cursor-pointer hover:bg-slate-50">
                      {portraitImage ? (
                        <img src={portraitImage} alt="Portrait" className="h-28 w-full object-contain" />
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs text-slate-600 py-6">
                          <Upload className="w-4 h-4" />
                          <span>{t.portraitLabel}</span>
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => void handleImageUpload(e, setPortraitImage)}
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg inline-flex items-center gap-2 transition-colors"
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
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">{t.myTenantsTitle}</h2>
                <p className="text-xs text-slate-500">{t.myTenantsSubtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setTab('register_tenant')}
                className="px-3.5 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800 inline-flex items-center gap-1.5"
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
                  className="px-4 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg"
                >
                  {t.registerFirstTenantBtn}
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
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
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2"
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
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2"
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

              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setHistoryFilter('all')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                    historyFilter === 'all' ? 'bg-slate-900 text-white' : 'text-slate-600'
                  }`}
                >
                  {t.filterAll}
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryFilter('tenants')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                    historyFilter === 'tenants' ? 'bg-slate-900 text-white' : 'text-slate-600'
                  }`}
                >
                  {t.filterTenants}
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryFilter('address')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md ${
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5">
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

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {portraitImage && (
                <div>
                  <p className="text-xs text-slate-500 mb-1">{t.portraitLabel}</p>
                  <img
                    src={portraitImage}
                    alt="Portrait"
                    className="h-32 w-full object-contain border border-slate-200 rounded-lg"
                  />
                </div>
              )}
              <div>
                <p className="text-xs text-slate-500 mb-1">{t.idFrontLabel}</p>
                <img
                  src={idFrontImage}
                  alt="Front"
                  className="h-32 w-full object-contain border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">{t.idBackLabel}</p>
                <img
                  src={idBackImage}
                  alt="Back"
                  className="h-32 w-full object-contain border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setReviewOpen(false)}
                className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                {t.backToEditBtn}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleConfirmSubmitTenant()}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg inline-flex items-center gap-2"
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{selectedTenant.fullName}</h3>
                <p className="text-xs text-slate-500 tabular-nums">
                  {selectedTenant.phone} · {selectedTenant.roomLabel} · {selectedTenant.moveInDate}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTenant(null)}
                className="px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg"
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
              {selectedTenant.portraitImage && (
                <div>
                  <p className="text-xs text-slate-500 mb-1">{t.portraitLabel}</p>
                  <img
                    src={selectedTenant.portraitImage}
                    alt="Portrait"
                    className="h-36 w-full object-contain border border-slate-200 rounded-lg"
                  />
                </div>
              )}
              <div>
                <p className="text-xs text-slate-500 mb-1">{t.idFrontLabel}</p>
                <img
                  src={selectedTenant.idFrontImage}
                  alt="Front ID"
                  className="h-36 w-full object-contain border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">{t.idBackLabel}</p>
                <img
                  src={selectedTenant.idBackImage}
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
