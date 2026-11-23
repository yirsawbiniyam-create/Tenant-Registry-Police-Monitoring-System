import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Edit3, ListFilter, MapPin } from 'lucide-react';
import type { Jurisdiction } from '../types';
import {
  ASOSA_KEBELE_PRESETS,
  ASOSA_WOREDA_PRESETS,
  DEFAULT_CITY_ADMIN_PRESETS,
  DEFAULT_REGION_NAME,
  DEFAULT_ZONE_PRESETS,
  inferZoneForCity,
} from '../utils/seedData';
import { DICT, type Lang } from '../i18n';

export interface LocationValue {
  region: string;
  zone: string;
  city: string;
  woreda: string;
  kebele: string;
}

type AdminLevelChoice = 'zone' | 'city_admin';

interface ComboOrCustomFieldProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  options: string[];
  selectPlaceholder: string;
  inputPlaceholder: string;
  writeCustomOptionText: string;
  writeCustomToggleText: string;
  pickFromListToggleText: string;
  preferCustomByDefault?: boolean;
  required?: boolean;
  theme?: 'light' | 'dark';
}

const CUSTOM_SENTINEL = '__CUSTOM_FREE_TEXT__';

const ComboOrCustomField: React.FC<ComboOrCustomFieldProps> = ({
  label,
  value,
  onChange,
  options,
  selectPlaceholder,
  inputPlaceholder,
  writeCustomOptionText,
  writeCustomToggleText,
  pickFromListToggleText,
  preferCustomByDefault = false,
  required = true,
  theme = 'light',
}) => {
  const isDark = theme === 'dark';
  const hasOptions = options.length > 0;
  const valueOutsideList = Boolean(value && hasOptions && !options.includes(value));

  const [customMode, setCustomMode] = useState<boolean>(
    () => !hasOptions || preferCustomByDefault || valueOutsideList
  );

  useEffect(() => {
    if (!hasOptions) {
      setCustomMode(true);
    } else if (valueOutsideList) {
      setCustomMode(true);
    } else if (!preferCustomByDefault && value && options.includes(value)) {
      setCustomMode(false);
    }
  }, [hasOptions, valueOutsideList, preferCustomByDefault, value, options]);

  const labelClass = isDark
    ? 'text-xs font-bold text-amber-200'
    : 'text-xs font-semibold text-slate-700';

  const toggleBtnClass = isDark
    ? 'inline-flex items-center gap-1 text-[11px] font-bold text-cyan-200 hover:text-amber-300 transition-colors'
    : 'inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:text-blue-900 transition-colors';

  const controlClass = isDark
    ? 'w-full px-3 py-2.5 min-h-[46px] border border-slate-500/80 rounded-xl text-sm font-semibold bg-slate-900/95 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-300'
    : 'w-full px-3 py-2.5 min-h-[44px] border border-slate-300 rounded-xl text-sm font-medium bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900';

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <label className={labelClass}>{label}</label>
        {hasOptions && (
          <button
            type="button"
            onClick={() => setCustomMode((prev) => !prev)}
            className={toggleBtnClass}
          >
            {customMode ? (
              <>
                <ListFilter className="w-3 h-3 shrink-0" />
                {pickFromListToggleText}
              </>
            ) : (
              <>
                <Edit3 className="w-3 h-3 shrink-0" />
                {writeCustomToggleText}
              </>
            )}
          </button>
        )}
      </div>

      {customMode || !hasOptions ? (
        <input
          type="text"
          required={required}
          maxLength={100}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={inputPlaceholder}
          className={controlClass}
        />
      ) : (
        <select
          required={required}
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (v === CUSTOM_SENTINEL) {
              setCustomMode(true);
              onChange('');
            } else {
              onChange(v);
            }
          }}
          className={controlClass}
        >
          <option value="" className={isDark ? 'bg-slate-900 text-slate-300' : 'bg-white text-slate-500'}>
            {selectPlaceholder}
          </option>
          {options.map((opt) => (
            <option
              key={opt}
              value={opt}
              className={isDark ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'}
            >
              {opt}
            </option>
          ))}
          <option
            value={CUSTOM_SENTINEL}
            className={isDark ? 'bg-slate-900 text-amber-300 font-bold' : 'bg-amber-50 text-amber-900 font-bold'}
          >
            {writeCustomOptionText}
          </option>
        </select>
      )}
    </div>
  );
};

interface LocationSelectorProps {
  value: LocationValue;
  onChange: (next: LocationValue) => void;
  jurisdictions: Jurisdiction[];
  lang: Lang;
  theme?: 'light' | 'dark';
  required?: boolean;
  hideWoreda?: boolean;
  hideKebele?: boolean;
}

function dedupePreserve(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const clean = (item || '').trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

function isZonePresetName(name: string): boolean {
  const n = (name || '').trim();
  if (!n) return false;
  return (
    DEFAULT_ZONE_PRESETS.some((z) => z === n) ||
    n.includes('ዞን') ||
    n.includes('ልዩ ወረዳ')
  );
}

export const LocationSelector: React.FC<LocationSelectorProps> = ({
  value,
  onChange,
  jurisdictions,
  lang,
  theme = 'light',
  required = true,
  hideWoreda = false,
  hideKebele = false,
}) => {
  const t = DICT[lang];
  const isDark = theme === 'dark';

  const inferInitialLevel = (): AdminLevelChoice => {
    if (value.city && value.zone && value.city === value.zone) return 'zone';
    if (value.city && !isZonePresetName(value.city)) return 'city_admin';
    if (value.zone && !value.city) return 'zone';
    return 'city_admin';
  };

  const [adminLevel, setAdminLevel] = useState<AdminLevelChoice>(inferInitialLevel);

  useEffect(() => {
    if (value.city && value.zone && value.city === value.zone && isZonePresetName(value.zone)) {
      setAdminLevel('zone');
    } else if (value.city && !isZonePresetName(value.city)) {
      setAdminLevel('city_admin');
    }
  }, [value.city, value.zone]);

  const regionOptions = useMemo(() => {
    const fromJur = jurisdictions.map((j) => (j.region || DEFAULT_REGION_NAME).trim());
    return dedupePreserve([DEFAULT_REGION_NAME, ...fromJur]);
  }, [jurisdictions]);

  const zoneOptions = useMemo(() => {
    const matching = jurisdictions
      .filter((j) => !value.region || (j.region || DEFAULT_REGION_NAME) === value.region)
      .map((j) => (j.zone || inferZoneForCity(j.city)).trim());
    return dedupePreserve([...DEFAULT_ZONE_PRESETS, ...matching]);
  }, [jurisdictions, value.region]);

  const cityAdminOptions = useMemo(() => {
    const fromJur = jurisdictions
      .filter((j) => {
        const regMatch = !value.region || (j.region || DEFAULT_REGION_NAME) === value.region;
        return regMatch && j.city && j.city !== j.zone && !isZonePresetName(j.city);
      })
      .map((j) => j.city.trim());
    return dedupePreserve([...DEFAULT_CITY_ADMIN_PRESETS, ...fromJur]);
  }, [jurisdictions, value.region]);

  const woredaOptions = useMemo(() => {
    if (adminLevel === 'zone') {
      const fromJur = jurisdictions
        .filter(
          (j) =>
            (!value.region || (j.region || DEFAULT_REGION_NAME) === value.region) &&
            (!value.zone || (j.zone || inferZoneForCity(j.city)) === value.zone)
        )
        .map((j) => j.woreda);
      return dedupePreserve(fromJur);
    }

    const fromJur = jurisdictions
      .filter(
        (j) =>
          (!value.region || (j.region || DEFAULT_REGION_NAME) === value.region) &&
          (!value.city || j.city === value.city)
      )
      .map((j) => j.woreda);

    if (value.city === 'አሶሳ ከተማ' || value.city.includes('አሶሳ')) {
      return dedupePreserve([...ASOSA_WOREDA_PRESETS, ...fromJur]);
    }
    return dedupePreserve(fromJur);
  }, [adminLevel, jurisdictions, value.region, value.zone, value.city]);

  const kebeleOptions = useMemo(() => {
    if (adminLevel === 'zone') {
      const fromJur = jurisdictions
        .filter(
          (j) =>
            (!value.region || (j.region || DEFAULT_REGION_NAME) === value.region) &&
            (!value.zone || (j.zone || inferZoneForCity(j.city)) === value.zone) &&
            (!value.woreda || j.woreda === value.woreda)
        )
        .map((j) => j.kebele);
      return dedupePreserve(fromJur);
    }

    const fromJur = jurisdictions
      .filter(
        (j) =>
          (!value.region || (j.region || DEFAULT_REGION_NAME) === value.region) &&
          (!value.city || j.city === value.city) &&
          (!value.woreda || j.woreda === value.woreda)
      )
      .map((j) => j.kebele);

    if (
      (value.city === 'አሶሳ ከተማ' || value.city.includes('አሶሳ')) &&
      (value.woreda === 'ወረዳ 1' || value.woreda === 'ወረዳ 2')
    ) {
      return dedupePreserve([...ASOSA_KEBELE_PRESETS, ...fromJur]);
    }
    return dedupePreserve(fromJur);
  }, [adminLevel, jurisdictions, value.region, value.zone, value.city, value.woreda]);

  function handleAdminLevelSwitch(nextLevel: AdminLevelChoice) {
    setAdminLevel(nextLevel);
    onChange({
      region: value.region || DEFAULT_REGION_NAME,
      zone: '',
      city: '',
      woreda: '',
      kebele: '',
    });
  }

  return (
    <div className="space-y-3">
      {/* Row 1: Region + Level Switch (Zone OR City Administration) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
        <ComboOrCustomField
          label={t.regionLabel}
          value={value.region}
          onChange={(nextRegion) =>
            onChange({
              region: nextRegion,
              zone: '',
              city: '',
              woreda: '',
              kebele: '',
            })
          }
          options={regionOptions}
          selectPlaceholder={t.selectRegion}
          inputPlaceholder={t.typeRegionPlaceholder}
          writeCustomOptionText={t.writeCustomOption}
          writeCustomToggleText={t.writeCustomToggle}
          pickFromListToggleText={t.pickFromListToggle}
          required={required}
          theme={theme}
        />

        <div>
          <label
            className={`block mb-1.5 ${
              isDark ? 'text-xs font-bold text-amber-200' : 'text-xs font-semibold text-slate-700'
            }`}
          >
            {t.adminTypeLabel}
          </label>
          <div
            className={`grid grid-cols-2 gap-1.5 p-1 rounded-xl border ${
              isDark
                ? 'bg-slate-900/95 border-slate-600'
                : 'bg-slate-100 border-slate-200'
            }`}
          >
            <button
              type="button"
              onClick={() => handleAdminLevelSwitch('zone')}
              className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-2 min-h-[38px] rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                adminLevel === 'zone'
                  ? isDark
                    ? 'bg-amber-400 text-slate-950 shadow-sm'
                    : 'bg-slate-900 text-white shadow-xs'
                  : isDark
                    ? 'text-slate-200 hover:text-white'
                    : 'text-slate-700 hover:text-slate-950'
              }`}
            >
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              {t.adminTypeZone}
            </button>

            <button
              type="button"
              onClick={() => handleAdminLevelSwitch('city_admin')}
              className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-2 min-h-[38px] rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                adminLevel === 'city_admin'
                  ? isDark
                    ? 'bg-amber-400 text-slate-950 shadow-sm'
                    : 'bg-slate-900 text-white shadow-xs'
                  : isDark
                    ? 'text-slate-200 hover:text-white'
                    : 'text-slate-700 hover:text-slate-950'
              }`}
            >
              <Building2 className="w-3.5 h-3.5 shrink-0" />
              {t.adminTypeCity}
            </button>
          </div>
        </div>
      </div>

      {/* Row 2: Selected Branch (Zone -> Woreda -> Kebele OR City Admin -> Woreda -> Kebele) */}
      <div
        className={`grid grid-cols-1 ${
          hideWoreda && hideKebele
            ? 'sm:grid-cols-1'
            : hideKebele
              ? 'sm:grid-cols-2'
              : 'sm:grid-cols-3'
        } gap-3`}
      >
        {adminLevel === 'zone' ? (
          <ComboOrCustomField
            label={t.zoneLabel}
            value={value.zone}
            onChange={(nextZone) =>
              onChange({
                region: value.region || DEFAULT_REGION_NAME,
                zone: nextZone,
                city: nextZone,
                woreda: '',
                kebele: '',
              })
            }
            options={zoneOptions}
            selectPlaceholder={t.selectZone}
            inputPlaceholder={t.typeZonePlaceholder}
            writeCustomOptionText={t.writeCustomOption}
            writeCustomToggleText={t.writeCustomToggle}
            pickFromListToggleText={t.pickFromListToggle}
            required={required}
            theme={theme}
          />
        ) : (
          <ComboOrCustomField
            label={t.cityAdminLabel}
            value={value.city}
            onChange={(nextCity) => {
              const matched = jurisdictions.find((j) => j.city === nextCity);
              onChange({
                region: value.region || DEFAULT_REGION_NAME,
                zone: matched?.zone || inferZoneForCity(nextCity),
                city: nextCity,
                woreda: '',
                kebele: '',
              });
            }}
            options={cityAdminOptions}
            selectPlaceholder={t.selectCity}
            inputPlaceholder={t.typeCityPlaceholder}
            writeCustomOptionText={t.writeCustomOption}
            writeCustomToggleText={t.writeCustomToggle}
            pickFromListToggleText={t.pickFromListToggle}
            required={required}
            theme={theme}
          />
        )}

        {!hideWoreda && (
          <ComboOrCustomField
            label={t.woredaLabel}
            value={value.woreda}
            onChange={(nextWoreda) =>
              onChange({
                ...value,
                region: value.region || DEFAULT_REGION_NAME,
                zone:
                  adminLevel === 'zone'
                    ? value.zone
                    : value.zone || inferZoneForCity(value.city),
                city: adminLevel === 'zone' ? value.zone || value.city : value.city,
                woreda: nextWoreda,
                kebele: '',
              })
            }
            options={woredaOptions}
            selectPlaceholder={t.selectWoreda}
            inputPlaceholder={t.typeWoredaPlaceholder}
            writeCustomOptionText={t.writeCustomOption}
            writeCustomToggleText={t.writeCustomToggle}
            pickFromListToggleText={t.pickFromListToggle}
            preferCustomByDefault={adminLevel === 'zone'}
            required={required}
            theme={theme}
          />
        )}

        {!hideKebele && (
          <ComboOrCustomField
            label={t.kebeleLabel}
            value={value.kebele}
            onChange={(nextKebele) =>
              onChange({
                ...value,
                region: value.region || DEFAULT_REGION_NAME,
                zone:
                  adminLevel === 'zone'
                    ? value.zone
                    : value.zone || inferZoneForCity(value.city),
                city: adminLevel === 'zone' ? value.zone || value.city : value.city,
                kebele: nextKebele,
              })
            }
            options={kebeleOptions}
            selectPlaceholder={t.selectKebele}
            inputPlaceholder={t.typeKebelePlaceholder}
            writeCustomOptionText={t.writeCustomOption}
            writeCustomToggleText={t.writeCustomToggle}
            pickFromListToggleText={t.pickFromListToggle}
            preferCustomByDefault={adminLevel === 'zone'}
            required={required}
            theme={theme}
          />
        )}
      </div>
    </div>
  );
};
