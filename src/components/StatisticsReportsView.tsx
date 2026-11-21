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
  Download,
  FileSpreadsheet,
  FileText,
  Presentation,
  Printer,
  TrendingUp,
} from 'lucide-react';
import type {
  ActivityHistory,
  BrandingSetting,
  CriminalRecord,
  Landlord,
  Tenant,
  WantedAlert,
} from '../types';
import { normalizePhone, normalizeText, toJsDate } from '../utils/crypto';
import {
  exportElementToPdf,
  exportToExcel,
  exportToPowerPoint,
  exportToWord,
  type ReportPayload,
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
  const [cityFilter, setCityFilter] = useState(defaultCityFilter);
  const [woredaFilter, setWoredaFilter] = useState('');
  const [kebeleFilter, setKebeleFilter] = useState('');
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
        new Set([...landlords.map((l) => l.city), ...tenants.map((ten) => ten.city)])
      ).filter(Boolean),
    [landlords, tenants]
  );

  const woredas = useMemo(
    () =>
      Array.from(
        new Set(
          [...landlords, ...tenants]
            .filter((x) => !cityFilter || x.city === cityFilter)
            .map((x) => x.woreda)
        )
      ).filter(Boolean),
    [landlords, tenants, cityFilter]
  );

  const kebeles = useMemo(
    () =>
      Array.from(
        new Set(
          [...landlords, ...tenants]
            .filter(
              (x) =>
                (!cityFilter || x.city === cityFilter) &&
                (!woredaFilter || x.woreda === woredaFilter)
            )
            .map((x) => x.kebele)
        )
      ).filter(Boolean),
    [landlords, tenants, cityFilter, woredaFilter]
  );

  const cutoffMs = useMemo(() => {
    const now = Date.now();
    if (period === 'weekly') return now - 7 * 86400 * 1000;
    if (period === 'monthly') return now - 30 * 86400 * 1000;
    if (period === 'yearly') return now - 365 * 86400 * 1000;
    return 0;
  }, [period]);

  const inPeriod = (ts: unknown) => {
    if (cutoffMs === 0) return true;
    const d = toJsDate(ts);
    if (!d) return true;
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
    [landlords, cutoffMs, cityFilter, woredaFilter, kebeleFilter]
  );
  const filteredTenants = useMemo(
    () => tenants.filter((ten) => inPeriod(ten.createdAt) && inArea(ten)),
    [tenants, cutoffMs, cityFilter, woredaFilter, kebeleFilter]
  );
  const filteredCrimes = useMemo(
    () => criminalRecords.filter((c) => inPeriod(c.createdAt) && inArea(c)),
    [criminalRecords, cutoffMs, cityFilter, woredaFilter, kebeleFilter]
  );
  const filteredAlerts = useMemo(
    () => wantedAlerts.filter((a) => inPeriod(a.createdAt) && inArea(a)),
    [wantedAlerts, cutoffMs, cityFilter, woredaFilter, kebeleFilter]
  );
  const filteredHistory = useMemo(
    () => history.filter((h) => inPeriod(h.createdAt) && inArea(h)),
    [history, cutoffMs, cityFilter, woredaFilter, kebeleFilter]
  );

  const todayIso = new Date().toISOString().slice(0, 10);

  // Breakdown by Woreda (for Recharts BarChart + Table)
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

  // Breakdown by City + Woreda + Kebele (for Recharts Kebele BarChart + Table)
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

  // Daily Live Trend (Last 14 Days) for Recharts AreaChart
  const dailyTrendData = useMemo(() => {
    const days: Array<{ date: string; landlords: number; tenants: number; arrests: number }> = [];
    const byDate = new Map<string, { landlords: number; tenants: number; arrests: number }>();

    for (let i = 13; i >= 0; i -= 1) {
      const d = new Date(Date.now() - i * 86400 * 1000);
      const iso = d.toISOString().slice(0, 10);
      const row = { landlords: 0, tenants: 0, arrests: 0 };
      byDate.set(iso, row);
      days.push({ date: iso.slice(5), ...row });
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

  const reportPayload: ReportPayload = {
    commissionName: branding.commissionName,
    periodLabel: periodLabels[period],
    jurisdictionLabel,
    generatedAtLabel: new Date().toLocaleDateString(lang === 'am' ? 'am-ET' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    logoUrl: branding.logoDataUrl,
    summary,
    breakdownByArea,
    landlords: filteredLandlords,
    tenants: filteredTenants,
    criminalRecords: filteredCrimes,
    history: filteredHistory,
  };

  async function runExport(type: 'excel' | 'word' | 'pdf' | 'pptx') {
    setExporting(type);
    try {
      if (type === 'excel') {
        exportToExcel(reportPayload);
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

  return (
    <div className="space-y-6">
      {/* Filter & Export Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 no-print">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(['weekly', 'monthly', 'yearly', 'all'] as PeriodMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setPeriod(mode)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  period === mode
                    ? 'bg-white text-slate-900 shadow-sm font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {periodLabels[mode]}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={exporting !== null}
              onClick={() => void runExport('excel')}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium rounded-lg whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              {exporting === 'excel' ? '...' : t.exportExcel}
            </button>
            <button
              type="button"
              disabled={exporting !== null}
              onClick={() => void runExport('word')}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-medium rounded-lg whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5" />
              {exporting === 'word' ? '...' : t.exportWord}
            </button>
            <button
              type="button"
              disabled={exporting !== null}
              onClick={() => void runExport('pdf')}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-red-700 hover:bg-red-800 text-white text-xs font-medium rounded-lg whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              {exporting === 'pdf' ? '...' : t.exportPdf}
            </button>
            <button
              type="button"
              disabled={exporting !== null}
              onClick={() => void runExport('pptx')}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg whitespace-nowrap"
            >
              <Presentation className="w-3.5 h-3.5" />
              {exporting === 'pptx' ? '...' : t.exportPpt}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              {t.exportPrint}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
          <select
            value={cityFilter}
            onChange={(e) => {
              setCityFilter(e.target.value);
              setWoredaFilter('');
              setKebeleFilter('');
            }}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
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
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
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
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
          >
            <option value="">{t.allKebeles}</option>
            {kebeles.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Printable & Exportable Official Report Canvas */}
      <div
        ref={reportRef}
        className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-8"
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
              <p className="text-sm text-slate-600">{t.reportTitle}</p>
              <div className="flex flex-wrap gap-2 text-xs text-slate-500 mt-1">
                <span>{periodLabels[period]}</span>
                <span aria-hidden="true">·</span>
                <span>{jurisdictionLabel}</span>
              </div>
            </div>
          </div>
          <div className="text-xs text-slate-500 tabular-nums">{reportPayload.generatedAtLabel}</div>
        </div>

        {/* Extended Live KPI Row */}
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

        {/* RECHARTS 1 & 2: WOREDA + KEBELE CHARTS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-slate-700" />
              {t.chartWoredaTitle}
            </h3>
            {woredaStats.length === 0 ? (
              <p className="text-xs text-slate-500 py-14 text-center">No data available</p>
            ) : (
              <div className="w-full h-72">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={woredaStats.slice(0, 10)} margin={{ top: 10, right: 16, left: 0, bottom: 20 }}>
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

          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-slate-700" />
              {t.chartKebeleTitle}
            </h3>
            {breakdownByArea.length === 0 ? (
              <p className="text-xs text-slate-500 py-14 text-center">No data available</p>
            ) : (
              <div className="w-full h-72">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={breakdownByArea.slice(0, 10)} margin={{ top: 10, right: 16, left: 0, bottom: 20 }}>
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

        {/* RECHARTS 3: LIVE DAILY TREND (14 DAYS) */}
        <div className="border border-slate-200 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-slate-700" />
            {t.chartDailyLiveTitle}
          </h3>
          <div className="w-full h-64">
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={dailyTrendData} margin={{ top: 10, right: 16, left: 0, bottom: 5 }}>
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

        {/* Woreda Summary Table */}
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
                    <td className="py-2.5 px-3 text-right tabular-nums font-semibold">{w.tenants}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-blue-700">{w.policeTenants}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Kebele Breakdown Table */}
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
                      <td className="py-2.5 px-3 text-right tabular-nums font-semibold">{row.tenants}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-blue-700">{row.policeTenants}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
