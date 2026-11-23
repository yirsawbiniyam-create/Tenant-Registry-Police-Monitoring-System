import React, { useMemo, useRef, useState } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BarChart3,
  Building2,
  CheckSquare,
  Download,
  FileSpreadsheet,
  FileText,
  MapPin,
  Presentation,
  Printer,
  RotateCcw,
  SlidersHorizontal,
  Square,
  TrendingUp,
} from 'lucide-react';
import type {
  ActivityHistory,
  BrandingSetting,
  CriminalRecord,
  Landlord,
  RecordType,
  Tenant,
  WantedAlert,
} from '../types';
import { formatDateAm, normalizePhone, normalizeText, toJsDate } from '../utils/crypto';
import {
  exportElementToPdf,
  exportToExcel,
  exportToPowerPoint,
  exportToWord,
  type ReportPayload,
  type ReportSectionsConfig,
} from '../utils/exporters';
import {
  DEFAULT_ETHIOPIAN_FLAG_PATH,
  DEFAULT_LOGO_PATH,
  DEFAULT_REGIONAL_FLAG_PATH,
  inferZoneForCity,
  resolveEthiopianFlagSrc,
  resolveLogoSrc,
  resolveRegionalFlagSrc,
} from '../utils/seedData';
import { BrandingImage } from './BrandingImage';
import { DICT, type Lang } from '../i18n';

interface StatisticsReportsViewProps {
  lang: Lang;
  branding: BrandingSetting;
  landlords: Landlord[];
  tenants: Tenant[];
  criminalRecords: CriminalRecord[];
  wantedAlerts: WantedAlert[];
  history: ActivityHistory[];
  defaultCityFilter?: string;
}

type PeriodMode = 'weekly' | 'monthly' | 'yearly' | 'all';
type DateGranularity = 'daily' | 'monthly' | 'yearly';

export function computeRepeatOffendersCount(records: CriminalRecord[]): number {
  const counts = new Map<string, number>();
  for (const r of records) {
    const key =
      (r.faydaId && normalizeText(r.faydaId)) ||
      (r.phone && normalizePhone(r.phone).length >= 7 ? normalizePhone(r.phone) : '') ||
      normalizeText(r.personName);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let repeat = 0;
  for (const c of counts.values()) {
    if (c >= 2) repeat += 1;
  }
  return repeat;
}

function getZoneName(item: { zone?: string; city: string }): string {
  const raw = (item.zone || '').trim();
  if (raw) return raw;
  return inferZoneForCity(item.city);
}

function extractIsoDate(ts: unknown, fallbackIsoDate?: string): string {
  const d = toJsDate(ts);
  if (d && !Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  if (fallbackIsoDate && /^\d{4}-\d{2}-\d{2}/.test(fallbackIsoDate)) {
    return fallbackIsoDate.slice(0, 10);
  }
  return '';
}

interface CustomTooltipPayloadItem {
  name?: string;
  value?: number;
  color?: string;
}

interface CustomChartTooltipProps {
  active?: boolean;
  payload?: CustomTooltipPayloadItem[];
  label?: string;
}

const ChartTooltipContent: React.FC<CustomChartTooltipProps> = ({ active, payload, label }) => {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm px-3 py-2 text-xs space-y-1">
      <p className="font-bold text-slate-900 border-b border-slate-100 pb-1">{label}</p>
      {payload.map((entry, idx) => (
        <div key={`${entry.name || idx}`} className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-slate-700">
            <span
              className="w-2.5 h-2.5 rounded-xs shrink-0"
              style={{ backgroundColor: entry.color || '#0f172a' }}
            />
            {entry.name}
          </span>
          <span className="font-mono-tabular font-bold text-slate-900 tabular-nums">
            {entry.value ?? 0}
          </span>
        </div>
      ))}
    </div>
  );
};

export const StatisticsReportsView: React.FC<StatisticsReportsViewProps> = ({
  lang,
  branding,
  landlords,
  tenants,
  criminalRecords,
  wantedAlerts,
  history,
  defaultCityFilter = '',
}) => {
  const t = DICT[lang];
  const [period, setPeriod] = useState<PeriodMode>('monthly');
  const [dateGranularity, setDateGranularity] = useState<DateGranularity>('daily');
  const [customTitle, setCustomTitle] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const isDefaultZone =
    Boolean(defaultCityFilter) &&
    (defaultCityFilter.includes('ዞን') || defaultCityFilter.includes('ልዩ ወረዳ'));
  const [zoneFilter, setZoneFilter] = useState(isDefaultZone ? defaultCityFilter : '');
  const [cityFilter, setCityFilter] = useState(isDefaultZone ? '' : defaultCityFilter);
  const [woredaFilter, setWoredaFilter] = useState('');
  const [kebeleFilter, setKebeleFilter] = useState('');
  const [crimeStatusFilter, setCrimeStatusFilter] = useState<'all' | RecordType>('all');
  const [sections, setSections] = useState<ReportSectionsConfig>({
    summary: true,
    charts: true,
    areaTable: true,
    landlords: true,
    tenants: true,
    criminalRecords: true,
  });
  const [exporting, setExporting] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement | null>(null);

  const periodLabels: Record<PeriodMode, string> = {
    weekly: t.periodWeekly,
    monthly: t.periodMonthly,
    yearly: t.periodYearly,
    all: t.periodAll,
  };

  const zones = useMemo(
    () =>
      Array.from(
        new Set(
          [...landlords, ...tenants, ...criminalRecords].map((item) => getZoneName(item))
        )
      ).filter(Boolean),
    [landlords, tenants, criminalRecords]
  );

  const cities = useMemo(
    () =>
      Array.from(
        new Set(
          [...landlords, ...tenants, ...criminalRecords]
            .filter((item) => !zoneFilter || getZoneName(item) === zoneFilter)
            .map((item) => item.city)
        )
      ).filter(Boolean),
    [landlords, tenants, criminalRecords, zoneFilter]
  );

  const woredas = useMemo(
    () =>
      Array.from(
        new Set(
          [...landlords, ...tenants, ...criminalRecords]
            .filter(
              (x) =>
                (!zoneFilter || getZoneName(x) === zoneFilter) &&
                (!cityFilter || x.city === cityFilter)
            )
            .map((x) => x.woreda)
        )
      ).filter(Boolean),
    [landlords, tenants, criminalRecords, zoneFilter, cityFilter]
  );

  const kebeles = useMemo(
    () =>
      Array.from(
        new Set(
          [...landlords, ...tenants, ...criminalRecords]
            .filter(
              (x) =>
                (!zoneFilter || getZoneName(x) === zoneFilter) &&
                (!cityFilter || x.city === cityFilter) &&
                (!woredaFilter || x.woreda === woredaFilter)
            )
            .map((x) => x.kebele)
        )
      ).filter(Boolean),
    [landlords, tenants, criminalRecords, zoneFilter, cityFilter, woredaFilter]
  );

  const cutoffMs = useMemo(() => {
    const now = Date.now();
    if (period === 'weekly') return now - 7 * 86400 * 1000;
    if (period === 'monthly') return now - 30 * 86400 * 1000;
    if (period === 'yearly') return now - 365 * 86400 * 1000;
    return 0;
  }, [period]);

  const inPeriod = (ts: unknown, fallbackIsoDate?: string) => {
    const d = toJsDate(ts) || (fallbackIsoDate ? new Date(`${fallbackIsoDate}T12:00:00`) : null);
    if (dateFrom || dateTo) {
      if (!d || Number.isNaN(d.getTime())) return false;
      const iso = d.toISOString().slice(0, 10);
      if (dateFrom && iso < dateFrom) return false;
      if (dateTo && iso > dateTo) return false;
      return true;
    }
    if (cutoffMs === 0) return true;
    if (!d || Number.isNaN(d.getTime())) return true;
    return d.getTime() >= cutoffMs;
  };

  const inArea = (item: { zone?: string; city: string; woreda: string; kebele: string }) => {
    if (zoneFilter && getZoneName(item) !== zoneFilter) return false;
    if (cityFilter && item.city !== cityFilter) return false;
    if (woredaFilter && item.woreda !== woredaFilter) return false;
    if (kebeleFilter && item.kebele !== kebeleFilter) return false;
    return true;
  };

  const filteredLandlords = useMemo(
    () => landlords.filter((l) => inPeriod(l.createdAt) && inArea(l)),
    [landlords, cutoffMs, dateFrom, dateTo, zoneFilter, cityFilter, woredaFilter, kebeleFilter]
  );
  const filteredTenants = useMemo(
    () => tenants.filter((ten) => inPeriod(ten.createdAt, ten.moveInDate) && inArea(ten)),
    [tenants, cutoffMs, dateFrom, dateTo, zoneFilter, cityFilter, woredaFilter, kebeleFilter]
  );
  const filteredCrimes = useMemo(
    () =>
      criminalRecords.filter((c) => {
        if (crimeStatusFilter !== 'all' && c.recordType !== crimeStatusFilter) return false;
        return inPeriod(c.createdAt, c.incidentDate) && inArea(c);
      }),
    [
      criminalRecords,
      crimeStatusFilter,
      cutoffMs,
      dateFrom,
      dateTo,
      zoneFilter,
      cityFilter,
      woredaFilter,
      kebeleFilter,
    ]
  );
  const filteredAlerts = useMemo(
    () => wantedAlerts.filter((a) => inPeriod(a.createdAt) && inArea(a)),
    [wantedAlerts, cutoffMs, dateFrom, dateTo, zoneFilter, cityFilter, woredaFilter, kebeleFilter]
  );
  const filteredHistory = useMemo(
    () => history.filter((h) => inPeriod(h.createdAt) && inArea(h)),
    [history, cutoffMs, dateFrom, dateTo, zoneFilter, cityFilter, woredaFilter, kebeleFilter]
  );

  const todayIso = new Date().toISOString().slice(0, 10);

  // Zone aggregation for Recharts + Zone Summary Table
  const zoneStats = useMemo(() => {
    const map = new Map<
      string,
      {
        zone: string;
        landlords: number;
        tenants: number;
        total: number;
        policeTenants: number;
      }
    >();
    for (const l of filteredLandlords) {
      const z = getZoneName(l);
      const cur = map.get(z) || {
        zone: z,
        landlords: 0,
        tenants: 0,
        total: 0,
        policeTenants: 0,
      };
      cur.landlords += 1;
      cur.total += 1;
      map.set(z, cur);
    }
    for (const ten of filteredTenants) {
      const z = getZoneName(ten);
      const cur = map.get(z) || {
        zone: z,
        landlords: 0,
        tenants: 0,
        total: 0,
        policeTenants: 0,
      };
      cur.tenants += 1;
      cur.total += 1;
      if (ten.isPoliceTenant) cur.policeTenants += 1;
      map.set(z, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filteredLandlords, filteredTenants]);

  // City aggregation for Recharts
  const cityStats = useMemo(() => {
    const map = new Map<
      string,
      {
        city: string;
        zone: string;
        landlords: number;
        tenants: number;
        total: number;
        policeTenants: number;
      }
    >();
    for (const l of filteredLandlords) {
      const cur = map.get(l.city) || {
        city: l.city,
        zone: getZoneName(l),
        landlords: 0,
        tenants: 0,
        total: 0,
        policeTenants: 0,
      };
      cur.landlords += 1;
      cur.total += 1;
      map.set(l.city, cur);
    }
    for (const ten of filteredTenants) {
      const cur = map.get(ten.city) || {
        city: ten.city,
        zone: getZoneName(ten),
        landlords: 0,
        tenants: 0,
        total: 0,
        policeTenants: 0,
      };
      cur.tenants += 1;
      cur.total += 1;
      if (ten.isPoliceTenant) cur.policeTenants += 1;
      map.set(ten.city, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filteredLandlords, filteredTenants]);

  const woredaStats = useMemo(() => {
    const map = new Map<
      string,
      { name: string; city: string; woreda: string; landlords: number; tenants: number; policeTenants: number }
    >();
    for (const l of filteredLandlords) {
      const key = `${l.city} / ${l.woreda}`;
      const cur = map.get(key) || {
        name: key,
        city: l.city,
        woreda: l.woreda,
        landlords: 0,
        tenants: 0,
        policeTenants: 0,
      };
      cur.landlords += 1;
      map.set(key, cur);
    }
    for (const ten of filteredTenants) {
      const key = `${ten.city} / ${ten.woreda}`;
      const cur = map.get(key) || {
        name: key,
        city: ten.city,
        woreda: ten.woreda,
        landlords: 0,
        tenants: 0,
        policeTenants: 0,
      };
      cur.tenants += 1;
      if (ten.isPoliceTenant) cur.policeTenants += 1;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.tenants - a.tenants);
  }, [filteredLandlords, filteredTenants]);

  const breakdownByArea = useMemo(() => {
    const map = new Map<
      string,
      {
        label: string;
        city: string;
        woreda: string;
        kebele: string;
        landlords: number;
        tenants: number;
        policeTenants: number;
      }
    >();

    for (const l of filteredLandlords) {
      const key = `${l.city}__${l.woreda}__${l.kebele}`;
      const cur = map.get(key) || {
        label: `${l.woreda} - ${l.kebele}`,
        city: l.city,
        woreda: l.woreda,
        kebele: l.kebele,
        landlords: 0,
        tenants: 0,
        policeTenants: 0,
      };
      cur.landlords += 1;
      map.set(key, cur);
    }

    for (const ten of filteredTenants) {
      const key = `${ten.city}__${ten.woreda}__${ten.kebele}`;
      const cur = map.get(key) || {
        label: `${ten.woreda} - ${ten.kebele}`,
        city: ten.city,
        woreda: ten.woreda,
        kebele: ten.kebele,
        landlords: 0,
        tenants: 0,
        policeTenants: 0,
      };
      cur.tenants += 1;
      if (ten.isPoliceTenant) cur.policeTenants += 1;
      map.set(key, cur);
    }

    return Array.from(map.values()).sort((a, b) => b.tenants - a.tenants);
  }, [filteredLandlords, filteredTenants]);

  // Dynamic Registration Trend by Date (Daily, Monthly, or Yearly) adapting to filters
  const dateTrendData = useMemo(() => {
    const bucketKey = (iso: string): string => {
      if (dateGranularity === 'yearly') return iso.slice(0, 4);
      if (dateGranularity === 'monthly') return iso.slice(0, 7);
      return iso;
    };

    const byBucket = new Map<
      string,
      { landlords: number; tenants: number; total: number; arrests: number }
    >();

    const ensureBucket = (key: string) => {
      if (!byBucket.has(key)) {
        byBucket.set(key, { landlords: 0, tenants: 0, total: 0, arrests: 0 });
      }
      return byBucket.get(key)!;
    };

    if (dateGranularity === 'daily') {
      if (dateFrom || dateTo) {
        const endIso = dateTo || todayIso;
        const startDateObj = dateFrom
          ? new Date(`${dateFrom}T12:00:00`)
          : new Date(new Date(`${endIso}T12:00:00`).getTime() - 29 * 86400 * 1000);
        const endDateObj = new Date(`${endIso}T12:00:00`);
        const spanDays = Math.round((endDateObj.getTime() - startDateObj.getTime()) / 86400000);
        if (spanDays >= 0 && spanDays <= 60) {
          for (let d = 0; d <= spanDays; d += 1) {
            const cur = new Date(startDateObj.getTime() + d * 86400 * 1000);
            ensureBucket(cur.toISOString().slice(0, 10));
          }
        }
      } else {
        const windowDays = period === 'weekly' ? 7 : period === 'monthly' ? 30 : 14;
        for (let i = windowDays - 1; i >= 0; i -= 1) {
          const d = new Date(Date.now() - i * 86400 * 1000);
          ensureBucket(d.toISOString().slice(0, 10));
        }
      }
    }

    for (const l of filteredLandlords) {
      const iso = extractIsoDate(l.createdAt);
      if (!iso) continue;
      const cell = ensureBucket(bucketKey(iso));
      cell.landlords += 1;
      cell.total += 1;
    }
    for (const ten of filteredTenants) {
      const iso = extractIsoDate(ten.createdAt, ten.moveInDate);
      if (!iso) continue;
      const cell = ensureBucket(bucketKey(iso));
      cell.tenants += 1;
      cell.total += 1;
    }
    for (const c of filteredCrimes) {
      if (c.recordType !== 'arrested' && c.recordType !== 'convicted') continue;
      const iso = extractIsoDate(c.createdAt, c.incidentDate);
      if (!iso) continue;
      const cell = ensureBucket(bucketKey(iso));
      cell.arrests += 1;
    }

    const sortedKeys = Array.from(byBucket.keys()).sort((a, b) => a.localeCompare(b));
    return sortedKeys.map((key) => {
      const val = byBucket.get(key)!;
      return {
        date: dateGranularity === 'daily' ? key.slice(5) : key,
        fullDate: key,
        ...val,
      };
    });
  }, [
    filteredLandlords,
    filteredTenants,
    filteredCrimes,
    dateGranularity,
    period,
    dateFrom,
    dateTo,
    todayIso,
  ]);

  const repeatOffendersCount = useMemo(
    () => computeRepeatOffendersCount(filteredCrimes),
    [filteredCrimes]
  );

  const arrestedRecords = useMemo(
    () => filteredCrimes.filter((c) => c.recordType === 'arrested' || c.recordType === 'convicted'),
    [filteredCrimes]
  );

  const arrestedTodayCount = useMemo(
    () =>
      arrestedRecords.filter((c) => {
        const d = toJsDate(c.createdAt);
        return c.incidentDate === todayIso || (d && d.toISOString().slice(0, 10) === todayIso);
      }).length,
    [arrestedRecords, todayIso]
  );

  const suspectsCount = useMemo(
    () => filteredCrimes.filter((c) => c.recordType === 'suspect').length,
    [filteredCrimes]
  );

  const summary = useMemo(
    () => ({
      totalLandlords: filteredLandlords.length,
      totalTenants: filteredTenants.length,
      activeTenants: filteredTenants.filter((item) => item.status === 'active').length,
      policeTenants: filteredTenants.filter((item) => item.isPoliceTenant).length,
      totalRooms: filteredLandlords.reduce((acc, l) => acc + (Number(l.roomCount) || 0), 0),
      criminalRecordsCount: filteredCrimes.length,
      wantedAlertsCount: filteredAlerts.length,
      repeatOffendersCount,
      arrestedTodayCount,
      totalArrestedCount: arrestedRecords.length,
      suspectsCount,
    }),
    [
      filteredLandlords,
      filteredTenants,
      filteredCrimes,
      filteredAlerts,
      repeatOffendersCount,
      arrestedTodayCount,
      arrestedRecords,
      suspectsCount,
    ]
  );

  const jurisdictionLabel = [
    zoneFilter || t.allZones,
    cityFilter || t.allCities,
    woredaFilter,
    kebeleFilter,
  ]
    .filter(Boolean)
    .join(' / ');

  const effectivePeriodLabel =
    dateFrom || dateTo
      ? `${dateFrom || '...'} → ${dateTo || '...'}`
      : periodLabels[period];

  const hasActiveFilters = Boolean(
    zoneFilter !== (isDefaultZone ? defaultCityFilter : '') ||
      cityFilter !== (isDefaultZone ? '' : defaultCityFilter) ||
      woredaFilter ||
      kebeleFilter ||
      dateFrom ||
      dateTo ||
      crimeStatusFilter !== 'all'
  );

  function resetAllFilters() {
    setZoneFilter(isDefaultZone ? defaultCityFilter : '');
    setCityFilter(isDefaultZone ? '' : defaultCityFilter);
    setWoredaFilter('');
    setKebeleFilter('');
    setDateFrom('');
    setDateTo('');
    setPeriod('monthly');
    setCrimeStatusFilter('all');
  }

  const reportPayload: ReportPayload = {
    commissionName: branding.commissionName,
    customTitle: customTitle.trim() || undefined,
    periodLabel: effectivePeriodLabel,
    jurisdictionLabel,
    generatedAtLabel: new Date().toLocaleDateString(lang === 'am' ? 'am-ET' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    logoUrl: branding.logoDataUrl,
    sections,
    summary,
    breakdownByArea,
    landlords: filteredLandlords,
    tenants: filteredTenants,
    criminalRecords: filteredCrimes,
    history: filteredHistory,
  };

  function toggleSection(key: keyof ReportSectionsConfig) {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function runExport(type: 'excel' | 'word' | 'pdf' | 'pptx') {
    setExporting(type);
    try {
      if (type === 'excel') {
        await exportToExcel(reportPayload);
      } else if (type === 'word') {
        await exportToWord(reportPayload);
      } else if (type === 'pptx') {
        await exportToPowerPoint(reportPayload);
      } else if (type === 'pdf' && reportRef.current) {
        await exportElementToPdf(reportRef.current);
      }
    } finally {
      setExporting(null);
    }
  }

  function crimeStatusText(type: CriminalRecord['recordType']): string {
    if (type === 'suspect') return t.statusSuspect;
    if (type === 'arrested') return t.statusArrested;
    if (type === 'convicted') return t.statusConvicted;
    return t.statusReleased;
  }

  const noFilteredRecords =
    filteredLandlords.length === 0 && filteredTenants.length === 0 && filteredCrimes.length === 0;

  return (
    <div className="space-y-6">
      {/* REPORT GENERATOR STUDIO & FILTERS */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-5 no-print">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-900 text-amber-300 flex items-center justify-center shrink-0">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                {t.reportGeneratorTitle}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">{t.reportGeneratorSubtitle}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={exporting !== null}
              onClick={() => void runExport('pdf')}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 min-h-[42px] bg-red-700 hover:bg-red-800 disabled:opacity-60 text-white text-xs font-bold rounded-xl whitespace-nowrap transition-colors"
            >
              <Download className="w-4 h-4 shrink-0" />
              {exporting === 'pdf' ? '...' : t.exportPdf}
            </button>
            <button
              type="button"
              disabled={exporting !== null}
              onClick={() => void runExport('excel')}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 min-h-[42px] bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-bold rounded-xl whitespace-nowrap transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4 shrink-0" />
              {exporting === 'excel' ? '...' : t.exportExcel}
            </button>
            <button
              type="button"
              disabled={exporting !== null}
              onClick={() => void runExport('word')}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 min-h-[42px] bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-xs font-bold rounded-xl whitespace-nowrap transition-colors"
            >
              <FileText className="w-4 h-4 shrink-0" />
              {exporting === 'word' ? '...' : t.exportWord}
            </button>
            <button
              type="button"
              disabled={exporting !== null}
              onClick={() => void runExport('pptx')}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 min-h-[42px] bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-xs font-bold rounded-xl whitespace-nowrap transition-colors"
            >
              <Presentation className="w-4 h-4 shrink-0" />
              {exporting === 'pptx' ? '...' : t.exportPpt}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 min-h-[42px] bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl whitespace-nowrap transition-colors"
            >
              <Printer className="w-4 h-4 shrink-0" />
              {t.exportPrint}
            </button>
          </div>
        </div>

        {/* Custom Title + Time Period + Custom Date Range */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-end">
          <div className="lg:col-span-4">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {t.customTitleLabel}
            </label>
            <input
              type="text"
              maxLength={120}
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder={t.reportTitle}
              className="w-full px-3.5 py-2.5 min-h-[44px] border border-slate-300 rounded-xl text-sm"
            />
          </div>

          <div className="lg:col-span-4">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {lang === 'am' ? 'የጊዜ ክልል' : 'Reporting Period'}
            </label>
            <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-xl">
              {(['weekly', 'monthly', 'yearly', 'all'] as PeriodMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setPeriod(mode);
                    setDateFrom('');
                    setDateTo('');
                  }}
                  className={`px-2 py-2 min-h-[38px] text-xs font-semibold rounded-lg transition-colors whitespace-nowrap truncate ${
                    !dateFrom && !dateTo && period === mode
                      ? 'bg-white text-slate-900 shadow-xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {periodLabels[mode]}
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {t.dateFromLabel}
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 min-h-[44px] border border-slate-300 rounded-xl text-xs tabular-nums"
            />
          </div>

          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {t.dateToLabel}
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 min-h-[44px] border border-slate-300 rounded-xl text-xs tabular-nums"
            />
          </div>
        </div>

        {/* Zone -> City -> Woreda -> Kebele & Criminal Status Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2 border-t border-slate-100">
          <select
            value={zoneFilter}
            onChange={(e) => {
              setZoneFilter(e.target.value);
              setCityFilter('');
              setWoredaFilter('');
              setKebeleFilter('');
            }}
            className="px-3.5 py-2.5 min-h-[44px] border border-slate-300 rounded-xl text-sm bg-white"
          >
            <option value="">{t.allZones}</option>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>

          <select
            value={cityFilter}
            onChange={(e) => {
              setCityFilter(e.target.value);
              setWoredaFilter('');
              setKebeleFilter('');
            }}
            className="px-3.5 py-2.5 min-h-[44px] border border-slate-300 rounded-xl text-sm bg-white"
          >
            <option value="">{t.allCities}</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={woredaFilter}
            onChange={(e) => {
              setWoredaFilter(e.target.value);
              setKebeleFilter('');
            }}
            className="px-3.5 py-2.5 min-h-[44px] border border-slate-300 rounded-xl text-sm bg-white"
          >
            <option value="">{t.allWoredas}</option>
            {woredas.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>

          <select
            value={kebeleFilter}
            onChange={(e) => setKebeleFilter(e.target.value)}
            className="px-3.5 py-2.5 min-h-[44px] border border-slate-300 rounded-xl text-sm bg-white"
          >
            <option value="">{t.allKebeles}</option>
            {kebeles.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>

          <select
            value={crimeStatusFilter}
            onChange={(e) => setCrimeStatusFilter(e.target.value as 'all' | RecordType)}
            className="px-3.5 py-2.5 min-h-[44px] border border-slate-300 rounded-xl text-sm bg-white"
          >
            <option value="all">
              {t.recordStatusFilterLabel}: {t.filterAll}
            </option>
            <option value="suspect">{t.statusSuspect}</option>
            <option value="arrested">{t.statusArrested}</option>
            <option value="convicted">{t.statusConvicted}</option>
            <option value="released">{t.statusReleased}</option>
          </select>
        </div>

        {/* Selectable Report Sections + Reset Filters */}
        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-600">{t.includeSectionsLabel}</p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['summary', t.sectionSummary],
                  ['charts', t.sectionCharts],
                  ['areaTable', t.sectionAreaTable],
                  ['landlords', t.sectionLandlordsTable],
                  ['tenants', t.sectionTenantsTable],
                  ['criminalRecords', t.sectionCriminalTable],
                ] as Array<[keyof ReportSectionsConfig, string]>
              ).map(([key, label]) => {
                const active = sections[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleSection(key)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {active ? (
                      <CheckSquare className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    )}
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[38px] bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              {t.resetFiltersBtn}
            </button>
          )}
        </div>
      </div>

      {/* PRINTABLE & EXPORTABLE OFFICIAL REPORT CANVAS */}
      <div
        ref={reportRef}
        className="bg-white border border-slate-200 rounded-xl p-4 sm:p-8 space-y-6 sm:space-y-8 overflow-x-hidden"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
          <div className="flex items-center gap-3 sm:gap-4">
            <BrandingImage
              src={resolveRegionalFlagSrc(branding.regionalFlagDataUrl)}
              fallbackSrc={DEFAULT_REGIONAL_FLAG_PATH}
              alt="Regional Flag"
              className="w-10 h-6 rounded object-cover border border-slate-200 shrink-0"
            />
            <BrandingImage
              src={resolveLogoSrc(branding.logoDataUrl)}
              fallbackSrc={DEFAULT_LOGO_PATH}
              alt={branding.commissionName}
              className="w-14 h-14 rounded-full object-cover border-2 border-amber-400/80 bg-white shrink-0"
            />
            <BrandingImage
              src={resolveEthiopianFlagSrc(branding.ethiopianFlagDataUrl)}
              fallbackSrc={DEFAULT_ETHIOPIAN_FLAG_PATH}
              alt="Ethiopian Flag"
              className="w-10 h-6 rounded object-cover border border-slate-200 shrink-0"
            />
            <div>
              <h2 className="text-lg font-bold text-slate-900">{branding.commissionName}</h2>
              <p className="text-sm font-medium text-slate-700">
                {customTitle.trim() || t.reportTitle}
              </p>
              <div className="flex flex-wrap gap-2 text-xs text-slate-500 mt-1">
                <span>{effectivePeriodLabel}</span>
                <span aria-hidden="true">·</span>
                <span>{jurisdictionLabel}</span>
              </div>
            </div>
          </div>
          <div className="text-xs text-slate-500 tabular-nums">{reportPayload.generatedAtLabel}</div>
        </div>

        {/* Extended Live KPI Row */}
        {sections.summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4 border-b border-slate-200 pb-6">
            <div>
              <p className="text-xs text-slate-500">{t.kpiLandlords}</p>
              <p className="text-2xl font-bold text-slate-900 tabular-nums">{summary.totalLandlords}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">{t.kpiTenants}</p>
              <p className="text-2xl font-bold text-slate-900 tabular-nums">{summary.totalTenants}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">{t.activeTenantsStat}</p>
              <p className="text-2xl font-bold text-emerald-700 tabular-nums">{summary.activeTenants}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">{t.kpiPoliceTenants}</p>
              <p className="text-2xl font-bold text-blue-700 tabular-nums">{summary.policeTenants}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">{t.kpiSuspects}</p>
              <p className="text-2xl font-bold text-amber-600 tabular-nums">{suspectsCount}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">{t.kpiRepeatOffenders}</p>
              <p className="text-2xl font-bold text-red-700 tabular-nums">{repeatOffendersCount}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">{t.kpiTotalArrested}</p>
              <p className="text-2xl font-bold text-red-900 tabular-nums">
                {arrestedTodayCount} / {arrestedRecords.length}
              </p>
            </div>
          </div>
        )}

        {/* Empty State Notice */}
        {noFilteredRecords && (
          <div className="border border-slate-200 rounded-xl bg-slate-50 px-4 py-8 text-center space-y-3 no-print">
            <p className="text-sm font-semibold text-slate-800">
              {lang === 'am'
                ? 'በተመረጡት የዞን፣ የከተማ እና የቀን ማጣሪያዎች የተመዘገበ መረጃ አልተገኘም።'
                : 'No registration records match the selected zone, city, and date filters.'}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {t.resetFiltersBtn}
              </button>
            )}
          </div>
        )}

        {/* RECHARTS ANALYTICS: ZONE, CITY, DATE + WOREDA & KEBELE */}
        {sections.charts && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-slate-500 no-print">
              <span>{t.clickBarHint}</span>
              {(zoneFilter || cityFilter) && (
                <span className="font-semibold text-slate-800">
                  {[zoneFilter, cityFilter].filter(Boolean).join(' / ')}
                </span>
              )}
            </div>

            {/* Row 1: Registrations by Zone & Registrations by City */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="border border-slate-200 rounded-xl p-4 space-y-3 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-slate-700 shrink-0" />
                    {t.chartZoneTitle}
                  </h3>
                  {zoneFilter && (
                    <button
                      type="button"
                      onClick={() => {
                        setZoneFilter('');
                        setCityFilter('');
                        setWoredaFilter('');
                        setKebeleFilter('');
                      }}
                      className="text-xs font-semibold text-blue-700 hover:text-blue-900 no-print"
                    >
                      {t.allZones}
                    </button>
                  )}
                </div>
                {zoneStats.length === 0 ? (
                  <p className="text-xs text-slate-500 py-14 text-center">
                    {lang === 'am' ? 'በዞን የተመዘገበ መረጃ የለም' : 'No zone data available'}
                  </p>
                ) : (
                  <div className="w-full h-64 sm:h-72 min-w-0">
                    <ResponsiveContainer width="100%" height={272}>
                      <BarChart
                        data={zoneStats}
                        margin={{ top: 10, right: 12, left: -10, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="zone" tick={{ fontSize: 11, fill: '#475569' }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#475569' }} />
                        <Tooltip content={<ChartTooltipContent />} />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                        <Bar
                          dataKey="landlords"
                          name={t.kpiLandlords}
                          fill="#d97706"
                          radius={[4, 4, 0, 0]}
                          cursor="pointer"
                          onClick={(barData) => {
                            const clickedZone = String(
                              (barData as { payload?: { zone?: string } })?.payload?.zone || ''
                            );
                            if (!clickedZone) return;
                            setZoneFilter((prev) => (prev === clickedZone ? '' : clickedZone));
                            setCityFilter('');
                            setWoredaFilter('');
                            setKebeleFilter('');
                          }}
                        />
                        <Bar
                          dataKey="tenants"
                          name={t.kpiTenants}
                          fill="#0f172a"
                          radius={[4, 4, 0, 0]}
                          cursor="pointer"
                          onClick={(barData) => {
                            const clickedZone = String(
                              (barData as { payload?: { zone?: string } })?.payload?.zone || ''
                            );
                            if (!clickedZone) return;
                            setZoneFilter((prev) => (prev === clickedZone ? '' : clickedZone));
                            setCityFilter('');
                            setWoredaFilter('');
                            setKebeleFilter('');
                          }}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="border border-slate-200 rounded-xl p-4 space-y-3 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-slate-700 shrink-0" />
                    {t.chartCityTitle}
                  </h3>
                  {cityFilter && (
                    <button
                      type="button"
                      onClick={() => {
                        setCityFilter('');
                        setWoredaFilter('');
                        setKebeleFilter('');
                      }}
                      className="text-xs font-semibold text-blue-700 hover:text-blue-900 no-print"
                    >
                      {t.allCities}
                    </button>
                  )}
                </div>
                {cityStats.length === 0 ? (
                  <p className="text-xs text-slate-500 py-14 text-center">
                    {lang === 'am' ? 'በከተማ የተመዘገበ መረጃ የለም' : 'No city data available'}
                  </p>
                ) : (
                  <div className="w-full h-64 sm:h-72 min-w-0">
                    <ResponsiveContainer width="100%" height={272}>
                      <BarChart
                        data={cityStats.slice(0, 10)}
                        margin={{ top: 10, right: 12, left: -10, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="city" tick={{ fontSize: 11, fill: '#475569' }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#475569' }} />
                        <Tooltip content={<ChartTooltipContent />} />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                        <Bar
                          dataKey="landlords"
                          name={t.kpiLandlords}
                          fill="#f59e0b"
                          radius={[4, 4, 0, 0]}
                          cursor="pointer"
                          onClick={(barData) => {
                            const clickedCity = String(
                              (barData as { payload?: { city?: string } })?.payload?.city || ''
                            );
                            if (!clickedCity) return;
                            setCityFilter((prev) => (prev === clickedCity ? '' : clickedCity));
                            setWoredaFilter('');
                            setKebeleFilter('');
                          }}
                        />
                        <Bar
                          dataKey="tenants"
                          name={t.kpiTenants}
                          fill="#1d4ed8"
                          radius={[4, 4, 0, 0]}
                          cursor="pointer"
                          onClick={(barData) => {
                            const clickedCity = String(
                              (barData as { payload?: { city?: string } })?.payload?.city || ''
                            );
                            if (!clickedCity) return;
                            setCityFilter((prev) => (prev === clickedCity ? '' : clickedCity));
                            setWoredaFilter('');
                            setKebeleFilter('');
                          }}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>

            {/* Row 2: Registration Trends by Date (Daily / Monthly / Yearly) */}
            <div className="border border-slate-200 rounded-xl p-4 space-y-3 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h3 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-slate-700 shrink-0" />
                  {t.chartDateTitle}
                </h3>
                <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start sm:self-auto no-print">
                  {(
                    [
                      ['daily', t.granularityDaily],
                      ['monthly', t.granularityMonthly],
                      ['yearly', t.granularityYearly],
                    ] as Array<[DateGranularity, string]>
                  ).map(([gran, label]) => (
                    <button
                      key={gran}
                      type="button"
                      onClick={() => setDateGranularity(gran)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                        dateGranularity === gran
                          ? 'bg-white text-slate-900 shadow-xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {dateTrendData.length === 0 ? (
                <p className="text-xs text-slate-500 py-14 text-center">
                  {lang === 'am' ? 'በተመረጠው ቀን የተመዘገበ መረጃ የለም' : 'No date trend data available'}
                </p>
              ) : (
                <div className="w-full h-64 sm:h-72 min-w-0">
                  <ResponsiveContainer width="100%" height={272}>
                    <ComposedChart
                      data={dateTrendData}
                      margin={{ top: 10, right: 12, left: -10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#475569' }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#475569' }} />
                      <Tooltip content={<ChartTooltipContent />} />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <Area
                        type="monotone"
                        dataKey="tenants"
                        name={t.kpiTenants}
                        stroke="#1d4ed8"
                        fill="#1d4ed8"
                        fillOpacity={0.14}
                      />
                      <Area
                        type="monotone"
                        dataKey="landlords"
                        name={t.kpiLandlords}
                        stroke="#d97706"
                        fill="#d97706"
                        fillOpacity={0.16}
                      />
                      <Line
                        type="monotone"
                        dataKey="total"
                        name={t.totalRegistrationsLabel}
                        stroke="#16a34a"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="arrests"
                        name={t.kpiTotalArrested}
                        stroke="#dc2626"
                        fill="#dc2626"
                        fillOpacity={0.14}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Row 3: Woreda & Kebele Drilldown Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="border border-slate-200 rounded-xl p-4 space-y-3 min-w-0">
                <h3 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-slate-700 shrink-0" />
                  {t.chartWoredaTitle}
                </h3>
                {woredaStats.length === 0 ? (
                  <p className="text-xs text-slate-500 py-14 text-center">No data available</p>
                ) : (
                  <div className="w-full h-64 sm:h-72 min-w-0">
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart
                        data={woredaStats.slice(0, 10)}
                        margin={{ top: 10, right: 12, left: -10, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="woreda" tick={{ fontSize: 11, fill: '#475569' }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#475569' }} />
                        <Tooltip content={<ChartTooltipContent />} />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                        <Bar
                          dataKey="landlords"
                          name={t.kpiLandlords}
                          fill="#d97706"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          dataKey="tenants"
                          name={t.kpiTenants}
                          fill="#0f172a"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="border border-slate-200 rounded-xl p-4 space-y-3 min-w-0">
                <h3 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-slate-700 shrink-0" />
                  {t.chartKebeleTitle}
                </h3>
                {breakdownByArea.length === 0 ? (
                  <p className="text-xs text-slate-500 py-14 text-center">No data available</p>
                ) : (
                  <div className="w-full h-64 sm:h-72 min-w-0">
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart
                        data={breakdownByArea.slice(0, 10)}
                        margin={{ top: 10, right: 12, left: -10, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="kebele" tick={{ fontSize: 11, fill: '#475569' }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#475569' }} />
                        <Tooltip content={<ChartTooltipContent />} />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                        <Bar
                          dataKey="landlords"
                          name={t.kpiLandlords}
                          fill="#f59e0b"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          dataKey="tenants"
                          name={t.kpiTenants}
                          fill="#1d4ed8"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* AREA TABLES */}
        {sections.areaTable && (
          <>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-slate-900">{t.zoneBreakdownTitle}</h3>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <th className="py-2.5 px-3">{t.zoneLabel.replace(' *', '')}</th>
                      <th className="py-2.5 px-3 text-right">{t.kpiLandlords}</th>
                      <th className="py-2.5 px-3 text-right">{t.kpiTenants}</th>
                      <th className="py-2.5 px-3 text-right">{t.totalRegistrationsLabel}</th>
                      <th className="py-2.5 px-3 text-right">{t.kpiPoliceTenants}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {zoneStats.map((z) => (
                      <tr key={z.zone} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-medium text-slate-900">{z.zone}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums">{z.landlords}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums font-semibold">
                          {z.tenants}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums font-bold text-slate-900">
                          {z.total}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-blue-700">
                          {z.policeTenants}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-bold text-slate-900">{t.chartWoredaTitle}</h3>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <th className="py-2.5 px-3">{t.cityLabel.replace(' *', '')}</th>
                      <th className="py-2.5 px-3">{t.woredaLabel.replace(' *', '')}</th>
                      <th className="py-2.5 px-3 text-right">{t.kpiLandlords}</th>
                      <th className="py-2.5 px-3 text-right">{t.kpiTenants}</th>
                      <th className="py-2.5 px-3 text-right">{t.kpiPoliceTenants}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {woredaStats.map((w) => (
                      <tr key={w.name} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-medium text-slate-900">{w.city}</td>
                        <td className="py-2.5 px-3 text-slate-700">{w.woreda}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums">{w.landlords}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums font-semibold">
                          {w.tenants}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-blue-700">
                          {w.policeTenants}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-bold text-slate-900">{t.chartKebeleTitle}</h3>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <th className="py-2.5 px-3">{t.cityLabel.replace(' *', '')}</th>
                      <th className="py-2.5 px-3">{t.woredaLabel.replace(' *', '')}</th>
                      <th className="py-2.5 px-3">{t.kebeleLabel.replace(' *', '')}</th>
                      <th className="py-2.5 px-3 text-right">{t.kpiLandlords}</th>
                      <th className="py-2.5 px-3 text-right">{t.kpiTenants}</th>
                      <th className="py-2.5 px-3 text-right">{t.kpiPoliceTenants}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {breakdownByArea.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500 text-sm">
                          {lang === 'am'
                            ? 'በተመረጠው የጊዜ ገደብና አካባቢ የተመዘገበ መረጃ የለም።'
                            : 'No records found for selected period and area.'}
                        </td>
                      </tr>
                    ) : (
                      breakdownByArea.map((row) => (
                        <tr key={`${row.city}-${row.woreda}-${row.kebele}`} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-medium text-slate-900">{row.city}</td>
                          <td className="py-2.5 px-3 text-slate-700">{row.woreda}</td>
                          <td className="py-2.5 px-3 text-slate-700">{row.kebele}</td>
                          <td className="py-2.5 px-3 text-right tabular-nums">{row.landlords}</td>
                          <td className="py-2.5 px-3 text-right tabular-nums font-semibold">
                            {row.tenants}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-blue-700">
                            {row.policeTenants}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* LANDLORDS TABLE IN REPORT */}
        {sections.landlords && (
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900">
              {t.landlordsReportHeading} ({filteredLandlords.length})
            </h3>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-2.5 px-3">{t.fullNameLabel.replace(' *', '')}</th>
                    <th className="py-2.5 px-3">{t.tenantPhoneLabel.replace(' *', '')}</th>
                    <th className="py-2.5 px-3">{t.faydaIdLabel.replace(' *', '')}</th>
                    <th className="py-2.5 px-3">አድራሻ / Address</th>
                    <th className="py-2.5 px-3 text-right">{t.roomsStat}</th>
                    <th className="py-2.5 px-3">ቀን</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredLandlords.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-500 text-xs">
                        {lang === 'am' ? 'ምንም አከራይ አልተገኘም።' : 'No landlords in range.'}
                      </td>
                    </tr>
                  ) : (
                    filteredLandlords.slice(0, 60).map((l) => (
                      <tr key={l.landlordId}>
                        <td className="py-2 px-3 font-medium text-slate-900">{l.fullName}</td>
                        <td className="py-2 px-3 tabular-nums text-slate-700">{l.phone}</td>
                        <td className="py-2 px-3 font-mono-tabular text-slate-700">{l.faydaId}</td>
                        <td className="py-2 px-3 text-slate-700">
                          {l.city} / {l.woreda} / {l.kebele} (#{l.houseNumber})
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums">{l.roomCount}</td>
                        <td className="py-2 px-3 text-slate-500 tabular-nums">
                          {formatDateAm(l.createdAt)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TENANTS TABLE IN REPORT */}
        {sections.tenants && (
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900">
              {t.tenantsReportHeading} ({filteredTenants.length})
            </h3>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-2.5 px-3">{t.tenantNameLabel.replace(' *', '')}</th>
                    <th className="py-2.5 px-3">{t.tenantPhoneLabel.replace(' *', '')}</th>
                    <th className="py-2.5 px-3">{t.occupationLabel.replace(' *', '')}</th>
                    <th className="py-2.5 px-3">መታወቂያ ቁጥር</th>
                    <th className="py-2.5 px-3">አድራሻ / Address</th>
                    <th className="py-2.5 px-3">አከራይ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredTenants.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-500 text-xs">
                        {lang === 'am' ? 'ምንም ተከራይ አልተገኘም።' : 'No tenants in range.'}
                      </td>
                    </tr>
                  ) : (
                    filteredTenants.slice(0, 80).map((ten) => (
                      <tr key={ten.tenantId}>
                        <td className="py-2 px-3 font-medium text-slate-900">{ten.fullName}</td>
                        <td className="py-2 px-3 tabular-nums text-slate-700">{ten.phone}</td>
                        <td className="py-2 px-3 text-slate-700">{ten.occupation}</td>
                        <td className="py-2 px-3 font-mono-tabular text-slate-700">{ten.idNumber}</td>
                        <td className="py-2 px-3 text-slate-700">
                          {ten.city} / {ten.woreda} / {ten.kebele}
                        </td>
                        <td className="py-2 px-3 text-slate-700">{ten.landlordName}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CRIMINAL RECORDS TABLE IN REPORT */}
        {sections.criminalRecords && (
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900">
              {t.criminalReportHeading} ({filteredCrimes.length})
            </h3>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-2.5 px-3">{t.fullNameLabel.replace(' *', '')}</th>
                    <th className="py-2.5 px-3">ስልክ / ፋይዳ</th>
                    <th className="py-2.5 px-3">ሁኔታ</th>
                    <th className="py-2.5 px-3">ጥፋት / ጉዳይ</th>
                    <th className="py-2.5 px-3">ጣቢያ እና አድራሻ</th>
                    <th className="py-2.5 px-3">ቀን</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredCrimes.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-500 text-xs">
                        {lang === 'am'
                          ? 'በተመረጠው የጊዜ ገደብ ውስጥ የተመዘገበ የወንጀል/ተጠርጣሪ ሪከርድ የለም።'
                          : 'No criminal or suspect records in range.'}
                      </td>
                    </tr>
                  ) : (
                    filteredCrimes.slice(0, 80).map((c) => (
                      <tr key={c.recordId}>
                        <td className="py-2 px-3 font-medium text-slate-900">{c.personName}</td>
                        <td className="py-2 px-3 tabular-nums text-slate-700">
                          {c.phone || '-'} · {c.faydaId || '-'}
                        </td>
                        <td className="py-2 px-3 font-semibold text-slate-800">
                          {crimeStatusText(c.recordType)}
                        </td>
                        <td className="py-2 px-3 text-slate-700">{c.offenseTitle}</td>
                        <td className="py-2 px-3 text-slate-700">
                          {c.stationName} ({c.city})
                        </td>
                        <td className="py-2 px-3 tabular-nums text-slate-500">{c.incidentDate}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
