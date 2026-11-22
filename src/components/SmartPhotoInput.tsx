import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Image as ImageIcon,
  Maximize2,
  RotateCw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  detectAutoCropBounds,
  loadImageForEditing,
  renderCroppedAndCompressed,
  type NormalizedCropRect,
  type PhotoCropMode,
} from '../utils/imageAutoCrop';
import { sanitizeImageSrc } from '../utils/crypto';
import type { Lang } from '../i18n';

interface SmartPhotoInputProps {
  label?: string;
  value: string;
  onChange: (dataUrl: string) => void;
  cropMode: PhotoCropMode;
  cameraFacing?: 'environment' | 'user';
  preserveTransparency?: boolean;
  theme?: 'light' | 'dark';
  lang: Lang;
  maxDimension?: number;
  maxChars?: number;
  compact?: boolean;
  hidePreview?: boolean;
  previewAlt?: string;
}

export const SmartPhotoInput: React.FC<SmartPhotoInputProps> = ({
  label,
  value,
  onChange,
  cropMode,
  cameraFacing,
  preserveTransparency = false,
  theme = 'light',
  lang,
  maxDimension = 860,
  maxChars = 250000,
  compact = false,
  hidePreview = false,
  previewAlt = 'Selected image',
}) => {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const [processing, setProcessing] = useState(false);
  const [localError, setLocalError] = useState('');

  // Modal editing state
  const [editorOpen, setEditorOpen] = useState(false);
  const [rawSourceUrl, setRawSourceUrl] = useState('');
  const [cropRect, setCropRect] = useState<NormalizedCropRect>({ x: 0, y: 0, w: 1, h: 1 });
  const [rotationDeg, setRotationDeg] = useState<0 | 90 | 180 | 270>(0);
  const [enhanceDocument, setEnhanceDocument] = useState<boolean>(cropMode === 'id_card');
  const [showFineSliders, setShowFineSliders] = useState(false);
  const [croppedPreviewUrl, setCroppedPreviewUrl] = useState('');
  const [savingCrop, setSavingCrop] = useState(false);

  const safeValue = sanitizeImageSrc(value);
  const effectiveFacing = cameraFacing || (cropMode === 'id_card' ? 'environment' : 'user');

  // Generate live debounced cropped preview inside modal
  useEffect(() => {
    if (!editorOpen || !rawSourceUrl) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void renderCroppedAndCompressed({
        sourceDataUrl: rawSourceUrl,
        crop: cropRect,
        rotationDeg,
        enhanceDocument,
        maxDimension: 480,
        maxChars: 180000,
        preserveTransparency,
      })
        .then((url) => {
          if (!cancelled) setCroppedPreviewUrl(url);
        })
        .catch(() => undefined);
    }, 90);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [editorOpen, rawSourceUrl, cropRect, rotationDeg, enhanceDocument, preserveTransparency]);

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setLocalError('');
    setProcessing(true);
    try {
      const loaded = await loadImageForEditing(file);
      const detected = await detectAutoCropBounds(loaded.dataUrl, cropMode);
      setRawSourceUrl(loaded.dataUrl);
      setCropRect(detected);
      setRotationDeg(0);
      setEnhanceDocument(cropMode === 'id_card');
      setShowFineSliders(false);
      setCroppedPreviewUrl('');
      setEditorOpen(true);
    } catch (err) {
      setLocalError(
        err instanceof Error
          ? err.message
          : lang === 'am'
            ? 'ምስሉን ማንበብ አልተቻለም'
            : 'Failed to load image'
      );
    } finally {
      setProcessing(false);
    }
  }

  async function handleReAutoDetect() {
    if (!rawSourceUrl) return;
    try {
      // Re-run detection directly on rotated canvas if rotated, else rawSourceUrl
      let targetUrl = rawSourceUrl;
      if (rotationDeg !== 0) {
        targetUrl = await renderCroppedAndCompressed({
          sourceDataUrl: rawSourceUrl,
          crop: { x: 0, y: 0, w: 1, h: 1 },
          rotationDeg,
          enhanceDocument: false,
          maxDimension: 1000,
          maxChars: 600000,
          preserveTransparency,
        });
        setRawSourceUrl(targetUrl);
        setRotationDeg(0);
      }
      const detected = await detectAutoCropBounds(targetUrl, cropMode);
      setCropRect(detected);
    } catch {
      setCropRect({ x: 0.05, y: 0.05, w: 0.9, h: 0.9 });
    }
  }

  function handleRotate90() {
    setRotationDeg((prev) => (((prev + 90) % 360) as 0 | 90 | 180 | 270));
  }

  async function handleConfirmSave() {
    if (!rawSourceUrl) return;
    setSavingCrop(true);
    setLocalError('');
    try {
      const finalDataUrl = await renderCroppedAndCompressed({
        sourceDataUrl: rawSourceUrl,
        crop: cropRect,
        rotationDeg,
        enhanceDocument,
        maxDimension,
        maxChars,
        preserveTransparency,
      });
      onChange(finalDataUrl);
      setEditorOpen(false);
      setRawSourceUrl('');
    } catch (err) {
      setLocalError(
        err instanceof Error
          ? err.message
          : lang === 'am'
            ? 'ምስሉን ማቀነባበር አልተቻለም'
            : 'Could not save cropped image'
      );
    } finally {
      setSavingCrop(false);
    }
  }

  // Edge slider setters (0..100%) with safety clamping so min width/height >= 15%
  const leftPct = Math.round(cropRect.x * 100);
  const topPct = Math.round(cropRect.y * 100);
  const rightPct = Math.round((cropRect.x + cropRect.w) * 100);
  const bottomPct = Math.round((cropRect.y + cropRect.h) * 100);

  const updateEdge = (edge: 'left' | 'right' | 'top' | 'bottom', pct: number) => {
    const val = Math.max(0, Math.min(100, pct)) / 100;
    setCropRect((prev) => {
      const x1 = prev.x;
      const y1 = prev.y;
      const x2 = prev.x + prev.w;
      const y2 = prev.y + prev.h;
      if (edge === 'left') {
        const nx1 = Math.min(val, x2 - 0.15);
        return { ...prev, x: nx1, w: x2 - nx1 };
      }
      if (edge === 'right') {
        const nx2 = Math.max(val, x1 + 0.15);
        return { ...prev, w: nx2 - x1 };
      }
      if (edge === 'top') {
        const ny1 = Math.min(val, y2 - 0.15);
        return { ...prev, y: ny1, h: y2 - ny1 };
      }
      const ny2 = Math.max(val, y1 + 0.15);
      return { ...prev, h: ny2 - y1 };
    });
  };

  const isDark = theme === 'dark';

  return (
    <div className="space-y-1.5">
      {label && (
        <label
          className={`block text-xs font-bold mb-1 ${
            isDark
              ? 'text-amber-200 drop-shadow-[0_1px_5px_rgba(0,0,0,0.98)]'
              : 'text-slate-700 font-semibold'
          }`}
        >
          {label}
        </label>
      )}

      {/* Hidden Dual Native Inputs: Camera & Gallery */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture={effectiveFacing}
        className="hidden"
        onChange={(e) => void handleFileChosen(e)}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void handleFileChosen(e)}
      />

      <div
        className={`rounded-xl border transition-colors ${
          isDark
            ? 'border-cyan-200/35 bg-slate-950/60 p-2.5 text-white'
            : 'border-slate-300 bg-white p-2.5 text-slate-900'
        }`}
      >
        {!hidePreview && safeValue && (
          <div className="relative mb-2 rounded-lg overflow-hidden border border-slate-200/30 bg-slate-900/10">
            <img
              src={safeValue}
              alt={previewAlt}
              className={`${compact ? 'h-20' : 'h-24 sm:h-28'} w-full object-contain mx-auto`}
            />
            <button
              type="button"
              onClick={() => onChange('')}
              aria-label="Remove image"
              className="absolute top-1.5 right-1.5 p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg bg-slate-950/80 hover:bg-red-700 text-white shadow transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={processing}
            onClick={() => cameraRef.current?.click()}
            className={`inline-flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-lg text-xs font-bold transition-colors disabled:opacity-50 ${
              isDark
                ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-sm'
                : 'bg-slate-900 hover:bg-slate-800 text-white shadow-xs'
            }`}
          >
            <Camera className="w-4 h-4 shrink-0" />
            <span className="truncate">
              {processing ? '...' : lang === 'am' ? 'በካሜራ አንሳ' : 'Camera'}
            </span>
          </button>

          <button
            type="button"
            disabled={processing}
            onClick={() => galleryRef.current?.click()}
            className={`inline-flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-lg text-xs font-bold border transition-colors disabled:opacity-50 ${
              isDark
                ? 'bg-slate-900/80 hover:bg-slate-800 border-cyan-200/30 text-slate-100'
                : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
            }`}
          >
            <ImageIcon className="w-4 h-4 shrink-0" />
            <span className="truncate">
              {processing ? '...' : lang === 'am' ? 'ከጋለሪ ምረጥ' : 'Gallery'}
            </span>
          </button>
        </div>

        {!safeValue && !compact && (
          <p
            className={`mt-1.5 text-[11px] text-center ${
              isDark ? 'text-amber-200/90' : 'text-slate-500'
            }`}
          >
            {cropMode === 'id_card'
              ? lang === 'am'
                ? 'መታወቂያውን ሲያነሱ ሲስተሙ በራሱ ቆርጦ ያስተካክለዋል'
                : 'System auto-detects & crops the ID card boundaries'
              : lang === 'am'
                ? 'ሲስተሙ ፎቶውን በራሱ አስተካክሎ ይቆርጠዋል'
                : 'System auto-crops & enhances the photo'}
          </p>
        )}

        {localError && (
          <p className="mt-1.5 text-[11px] text-red-500 font-semibold text-center">{localError}</p>
        )}
      </div>

      {/* AUTO-CROP REVIEW & ADJUST MODAL */}
      {editorOpen && rawSourceUrl && (
        <div
          className="fixed inset-0 z-[80] bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white text-slate-900 border border-slate-200 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden my-auto">
            {/* Modal Header */}
            <div className="px-4 sm:px-5 py-3.5 bg-slate-950 text-white flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-amber-400 text-slate-950 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold truncate">
                    {lang === 'am'
                      ? 'የመታወቂያ / ፎቶ አውቶ-ክሮፕ ማስተካከያ'
                      : 'Auto ID & Photo Crop Reviewer'}
                  </h3>
                  <p className="text-[11px] text-amber-200 truncate">
                    {lang === 'am'
                      ? 'ሲስተሙ የሚፈለገውን ክፍል ብቻ ቆርጦ አስተካክሎታል — ማረም ከፈለጉ ያስተካክሉ'
                      : 'Detected subject boundaries automatically — adjust or save directly'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditorOpen(false);
                  setRawSourceUrl('');
                }}
                aria-label="Close cropper"
                className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4 max-h-[82vh] overflow-y-auto">
              {/* Two-Column Visual Compare: Original+Crop Box vs Cropped Result */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                {/* Original Photo + Visual Crop Bounds */}
                <div className="space-y-1.5">
                  <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                    {lang === 'am' ? 'ዋናው ፎቶ እና የተቆረጠው ክልል' : 'Original + Detected Crop Box'}
                  </p>
                  <div className="relative bg-slate-900 rounded-xl overflow-hidden flex items-center justify-center min-h-[180px] max-h-[260px] p-2">
                    <div className="relative inline-block max-w-full max-h-[240px]">
                      <img
                        src={rawSourceUrl}
                        alt="Original"
                        style={{ transform: `rotate(${rotationDeg}deg)` }}
                        className="max-w-full max-h-[230px] object-contain transition-transform duration-150 block"
                      />
                      {/* Overlay masks highlighting only cropped bounds when rotation is 0 */}
                      {rotationDeg === 0 && (
                        <div className="pointer-events-none absolute inset-0">
                          <div
                            className="absolute left-0 right-0 top-0 bg-slate-950/60"
                            style={{ height: `${cropRect.y * 100}%` }}
                          />
                          <div
                            className="absolute left-0 right-0 bottom-0 bg-slate-950/60"
                            style={{ height: `${Math.max(0, 1 - (cropRect.y + cropRect.h)) * 100}%` }}
                          />
                          <div
                            className="absolute left-0 bg-slate-950/60"
                            style={{
                              top: `${cropRect.y * 100}%`,
                              height: `${cropRect.h * 100}%`,
                              width: `${cropRect.x * 100}%`,
                            }}
                          />
                          <div
                            className="absolute right-0 bg-slate-950/60"
                            style={{
                              top: `${cropRect.y * 100}%`,
                              height: `${cropRect.h * 100}%`,
                              width: `${Math.max(0, 1 - (cropRect.x + cropRect.w)) * 100}%`,
                            }}
                          />
                          <div
                            className="absolute border-2 border-amber-400 shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
                            style={{
                              left: `${cropRect.x * 100}%`,
                              top: `${cropRect.y * 100}%`,
                              width: `${cropRect.w * 100}%`,
                              height: `${cropRect.h * 100}%`,
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Live Cropped Output Preview */}
                <div className="space-y-1.5">
                  <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />
                    {lang === 'am' ? 'ተቆርጦ የተስተካከለው ውጤት' : 'Final Cropped Result'}
                  </p>
                  <div className="bg-slate-100 border-2 border-emerald-300 rounded-xl overflow-hidden flex items-center justify-center min-h-[180px] max-h-[260px] p-2">
                    {croppedPreviewUrl ? (
                      <img
                        src={croppedPreviewUrl}
                        alt="Cropped preview"
                        className="max-w-full max-h-[230px] object-contain rounded shadow-sm"
                      />
                    ) : (
                      <span className="text-xs text-slate-500">
                        {lang === 'am' ? 'በማዘጋጀት ላይ...' : 'Generating preview...'}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleRotate90}
                  className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-800"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  {lang === 'am' ? '90° አዙር' : 'Rotate 90°'}
                </button>

                <button
                  type="button"
                  onClick={() => void handleReAutoDetect()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-xs font-semibold text-amber-900"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {lang === 'am' ? 'በራሱ እንደገና ቁረጥ' : 'Auto-Crop'}
                </button>

                <button
                  type="button"
                  onClick={() => setCropRect({ x: 0, y: 0, w: 1, h: 1 })}
                  className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-800"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  {lang === 'am' ? 'ሙሉ ፎቶ (100%)' : 'Full Frame'}
                </button>

                <button
                  type="button"
                  onClick={() => setShowFineSliders((s) => !s)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-lg border text-xs font-semibold transition-colors ${
                    showFineSliders
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  {lang === 'am' ? 'ጠርዞችን አስተካክል' : 'Adjust Edges'}
                </button>
              </div>

              {/* Document Contrast Enhancement Toggle */}
              {!preserveTransparency && (
                <label className="flex items-center gap-2.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer text-xs font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={enhanceDocument}
                    onChange={(e) => setEnhanceDocument(e.target.checked)}
                    className="w-4 h-4 accent-slate-900 rounded"
                  />
                  <span>
                    {lang === 'am'
                      ? 'የመታወቂያ ጽሑፍ እና ንፅፅር አጥራ (Auto-Enhance Clarity)'
                      : 'Enhance ID text legibility & lighting contrast'}
                  </span>
                </label>
              )}

              {/* Fine Edge Sliders for Touch Adjustment */}
              {showFineSliders && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                  <label className="space-y-1">
                    <span className="flex justify-between font-semibold text-slate-700">
                      <span>{lang === 'am' ? 'ግራ ጠርዝ (Left)' : 'Left Edge'}</span>
                      <span className="tabular-nums">{leftPct}%</span>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={80}
                      value={leftPct}
                      onChange={(e) => updateEdge('left', Number(e.target.value))}
                      className="w-full accent-slate-900"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="flex justify-between font-semibold text-slate-700">
                      <span>{lang === 'am' ? 'ቀኝ ጠርዝ (Right)' : 'Right Edge'}</span>
                      <span className="tabular-nums">{rightPct}%</span>
                    </span>
                    <input
                      type="range"
                      min={20}
                      max={100}
                      value={rightPct}
                      onChange={(e) => updateEdge('right', Number(e.target.value))}
                      className="w-full accent-slate-900"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="flex justify-between font-semibold text-slate-700">
                      <span>{lang === 'am' ? 'ላይ ጠርዝ (Top)' : 'Top Edge'}</span>
                      <span className="tabular-nums">{topPct}%</span>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={80}
                      value={topPct}
                      onChange={(e) => updateEdge('top', Number(e.target.value))}
                      className="w-full accent-slate-900"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="flex justify-between font-semibold text-slate-700">
                      <span>{lang === 'am' ? 'ታች ጠርዝ (Bottom)' : 'Bottom Edge'}</span>
                      <span className="tabular-nums">{bottomPct}%</span>
                    </span>
                    <input
                      type="range"
                      min={20}
                      max={100}
                      value={bottomPct}
                      onChange={(e) => updateEdge('bottom', Number(e.target.value))}
                      className="w-full accent-slate-900"
                    />
                  </label>
                </div>
              )}

              {/* Modal Footer Buttons */}
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setEditorOpen(false);
                    setRawSourceUrl('');
                  }}
                  className="px-4 py-2.5 min-h-[42px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold"
                >
                  {lang === 'am' ? 'ተው / Cancel' : 'Cancel'}
                </button>
                <button
                  type="button"
                  disabled={savingCrop}
                  onClick={() => void handleConfirmSave()}
                  className="px-5 py-2.5 min-h-[42px] rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Check className="w-4 h-4" />
                  {savingCrop
                    ? lang === 'am'
                      ? 'በማስቀመጥ ላይ...'
                      : 'Saving...'
                    : lang === 'am'
                      ? 'ቆርጠህ አስቀምጥ (Confirm & Use)'
                      : 'Confirm & Use Cropped Photo'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
