import React, { useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BarChart3,
  CheckSquare,
  Download,
  FileSpreadsheet,
  FileText,
  Presentation,
  Printer,
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
  const [customTitle, setCustomTitle] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [cityFilter, setCityFilter] = useState(defaultCityFilter);
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

  const cities = useMemo(
    () =>
      Array.from(
        new Set([
          ...landlords.map((l) => l.city),
          ...tenants.map((ten) => ten.city),
          ...criminalRecords.map((c) => c.city),
        ])
      ).filter(Boolean),
    [landlords, tenants, criminalRecords]
  );

  const woredas = useMemo(
    () =>
      Array.from(
        new Set(
          [...landlords, ...tenants, ...criminalRecords]
            .filter((x) => !cityFilter || x.city === cityFilter)
            .map((x) => x.woreda)
        )
      ).filter(Boolean),
    [landlords, tenants, criminalRecords, cityFilter]
  );

  const kebeles = useMemo(
    () =>
      Array.from(
        new Set(
          [...landlords, ...tenants, ...criminalRecords]
            .filter(
              (x) =>
                (!cityFilter || x.city === cityFilter) &&
                (!woredaFilter || x.woreda === woredaFilter)
            )
            .map((x) => x.kebele)
        )
      ).filter(Boolean),
    [landlords, tenants, criminalRecords, cityFilter, woredaFilter]
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

  const inArea = (item: { city: string; woreda: string; kebele: string }) => {
    if (cityFilter && item.city !== cityFilter) return false;
    if (woredaFilter && item.woreda !== woredaFilter) return false;
    if (kebeleFilter && item.kebele !== kebeleFilter) return false;
    return true;
  };

  const filteredLandlords = useMemo(
    () => landlords.filter((l) => inPeriod(l.createdAt) && inArea(l)),
    [landlords, cutoffMs, dateFrom, dateTo, cityFilter, woredaFilter, kebeleFilter]
  );
  const filteredTenants = useMemo(
    () => tenants.filter((ten) => inPeriod(ten.createdAt, ten.moveInDate) && inArea(ten)),
    [tenants, cutoffMs, dateFrom, dateTo, cityFilter, woredaFilter, kebeleFilter]
  );
  const filteredCrimes = useMemo(
    () =>
      criminalRecords.filter((c) => {
        if (crimeStatusFilter !== 'all' && c.recordType !== crimeStatusFilter) return false;
        return inPeriod(c.createdAt, c.incidentDate) && inArea(c);
      }),
    [criminalRecords, crimeStatusFilter, cutoffMs, dateFrom, dateTo, cityFilter, woredaFilter, kebeleFilter]
  );
  const filteredAlerts = useMemo(
    () => wantedAlerts.filter((a) => inPeriod(a.createdAt) && inArea(a)),
    [wantedAlerts, cutoffMs, dateFrom, dateTo, cityFilter, woredaFilter, kebeleFilter]
  );
  const filteredHistory = useMemo(
    () => history.filter((h) => inPeriod(h.createdAt) && inArea(h)),
    [history, cutoffMs, dateFrom, dateTo, cityFilter, woredaFilter, kebeleFilter]
  );

  const todayIso = new Date().toISOString().slice(0, 10);

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

  const dailyTrendData = useMemo(() => {
    const byDate = new Map<string, { landlords: number; tenants: number; arrests: number }>();

    for (let i = 13; i >= 0; i -= 1) {
      const d = new Date(Date.now() - i * 86400 * 1000);
      const iso = d.toISOString().slice(0, 10);
      byDate.set(iso, { landlords: 0, tenants: 0, arrests: 0 });
    }

    for (const l of filteredLandlords) {
      const d = toJsDate(l.createdAt);
      if (!d) continue;
      const iso = d.toISOString().slice(0, 10);
      const cell = byDate.get(iso);
      if (cell) cell.landlords += 1;
    }
    for (const ten of filteredTenants) {
      const d = toJsDate(ten.createdAt);
      if (!d) continue;
      const iso = d.toISOString().slice(0, 10);
      const cell = byDate.get(iso);
      if (cell) cell.tenants += 1;
    }
    for (const c of filteredCrimes) {
      if (c.recordType !== 'arrested' && c.recordType !== 'convicted') continue;
      const d = toJsDate(c.createdAt);
      const iso = c.incidentDate || (d ? d.toISOString().slice(0, 10) : '');
      const cell = byDate.get(iso);
      if (cell) cell.arrests += 1;
    }

    return Array.from(byDate.entries()).map(([iso, val]) => ({
      date: iso.slice(5),
      ...val,
    }));
  }, [filteredLandlords, filteredTenants, filteredCrimes]);

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

  const jurisdictionLabel = [cityFilter || t.allCities, woredaFilter, kebeleFilter]
    .filter(Boolean)
    .join(' / ');

  const effectivePeriodLabel =
    dateFrom || dateTo
      ? `${dateFrom || '...'} → ${dateTo || '...'}`
      : periodLabels[period];

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

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={exporting !== null}
              onClick={() => void runExport('pdf')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] bg-red-700 hover:bg-red-800 disabled:opacity-60 text-white text-xs font-semibold rounded-lg whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              {exporting === 'pdf' ? '...' : t.exportPdf}
            </button>
            <button
              type="button"
              disabled={exporting !== null}
              onClick={() => void runExport('excel')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-semibold rounded-lg whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              {exporting === 'excel' ? '...' : t.exportExcel}
            </button>
            <button
              type="button"
              disabled={exporting !== null}
              onClick={() => void runExport('word')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-xs font-semibold rounded-lg whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5" />
              {exporting === 'word' ? '...' : t.exportWord}
            </button>
            <button
              type="button"
              disabled={exporting !== null}
              onClick={() => void runExport('pptx')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-xs font-semibold rounded-lg whitespace-nowrap"
            >
              <Presentation className="w-3.5 h-3.5" />
              {exporting === 'pptx' ? '...' : t.exportPpt}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              {t.exportPrint}
            </button>
          </div>
        </div>

        {/* Custom Title + Time Period + Custom Date Range */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
          <div className="lg:col-span-4">
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              {t.customTitleLabel}
            </label>
            <input
              type="text"
              maxLength={120}
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder={t.reportTitle}
              className="w-full px-3 py-2 min-h-[40px] border border-slate-300 rounded-lg text-sm"
            />
          </div>

          <div className="lg:col-span-4">
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              {lang === 'am' ? 'የጊዜ ክልል' : 'Reporting Period'}
            </label>
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(['weekly', 'monthly', 'yearly', 'all'] as PeriodMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setPeriod(mode);
                    setDateFrom('');
                    setDateTo('');
                  }}
                  className={`flex-1 px-2.5 py-1.5 min-h-[34px] text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    !dateFrom && !dateTo && period === mode
                      ? 'bg-white text-slate-900 shadow-sm font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {periodLabels[mode]}
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              {t.dateFromLabel}
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-2.5 py-2 min-h-[40px] border border-slate-300 rounded-lg text-xs tabular-nums"
            />
          </div>

          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              {t.dateToLabel}
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-2.5 py-2 min-h-[40px] border border-slate-300 rounded-lg text-xs tabular-nums"
            />
          </div>
        </div>

        {/* Jurisdiction & Criminal Status Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
          <select
            value={cityFilter}
            onChange={(e) => {
              setCityFilter(e.target.value);
              setWoredaFilter('');
              setKebeleFilter('');
            }}
            className="px-3 py-2 min-h-[40px] border border-slate-300 rounded-lg text-sm bg-white"
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
            className="px-3 py-2 min-h-[40px] border border-slate-300 rounded-lg text-sm bg-white"
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
            className="px-3 py-2 min-h-[40px] border border-slate-300 rounded-lg text-sm bg-white"
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
            className="px-3 py-2 min-h-[40px] border border-slate-300 rounded-lg text-sm bg-white"
          >
            <option value="all">{t.recordStatusFilterLabel}: {t.filterAll}</option>
            <option value="suspect">{t.statusSuspect}</option>
            <option value="arrested">{t.statusArrested}</option>
            <option value="convicted">{t.statusConvicted}</option>
            <option value="released">{t.statusReleased}</option>
          </select>
        </div>

        {/* Selectable Report Sections */}
        <div className="pt-2 border-t border-slate-100 space-y-2">
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
      </div>

      {/* PRINTABLE & EXPORTABLE OFFICIAL REPORT CANVAS */}
      <div
        ref={reportRef}
        className="bg-white border border-slate-200 rounded-xl p-4 sm:p-8 space-y-6 sm:space-y-8 overflow-x-hidden"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
          <div className="flex items-center gap-4">
            <BrandingImage
              src={branding.logoDataUrl}
              alt={branding.commissionName}
              className="w-14 h-14 rounded-full object-cover border border-slate-200"
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

        {/* RECHARTS */}
        {sections.charts && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="border border-slate-200 rounded-xl p-3 sm:p-4 space-y-3 min-w-0">
                <h3 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-slate-700" />
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
                        <Tooltip />
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

              <div className="border border-slate-200 rounded-xl p-3 sm:p-4 space-y-3 min-w-0">
                <h3 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-slate-700" />
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
                        <Tooltip />
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

            <div className="border border-slate-200 rounded-xl p-3 sm:p-4 space-y-3 min-w-0">
              <h3 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-slate-700" />
                {t.chartDailyLiveTitle}
              </h3>
              <div className="w-full h-60 sm:h-64 min-w-0">
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart
                    data={dailyTrendData}
                    margin={{ top: 10, right: 12, left: -10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#475569' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#475569' }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Area
                      type="monotone"
                      dataKey="tenants"
                      name={t.kpiTenants}
                      stroke="#0f172a"
                      fill="#0f172a"
                      fillOpacity={0.12}
                    />
                    <Area
                      type="monotone"
                      dataKey="landlords"
                      name={t.kpiLandlords}
                      stroke="#d97706"
                      fill="#d97706"
                      fillOpacity={0.15}
                    />
                    <Area
                      type="monotone"
                      dataKey="arrests"
                      name={t.kpiTotalArrested}
                      stroke="#dc2626"
                      fill="#dc2626"
                      fillOpacity={0.18}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}

        {/* AREA TABLES */}
        {sections.areaTable && (
          <>
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
                      <tr key={w.name}>
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
                        <tr key={`${row.city}-${row.woreda}-${row.kebele}`}>
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
                        <td className="py-2 px-3 font-semibold text-red-700">
                          {crimeStatusText(c.recordType)}
                        </td>
                        <td className="py-2 px-3 text-slate-700">{c.offenseTitle}</td>
                        <td className="py-2 px-3 text-slate-700">
                          {c.stationName} ({c.city}/{c.woreda})
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
