import React, { useEffect, useState } from 'react';
import { Shield } from 'lucide-react';
import { sanitizeImageSrc } from '../utils/crypto';
import { normalizeLegacyAssetPath } from '../utils/seedData';

interface BrandingImageProps {
  src?: string;
  fallbackSrc?: string;
  alt: string;
  className?: string;
  fallbackText?: string;
}

export const BrandingImage: React.FC<BrandingImageProps> = ({
  src,
  fallbackSrc,
  alt,
  className = 'w-12 h-12 rounded-full object-cover',
  fallbackText,
}) => {
  const normalizedPrimary = normalizeLegacyAssetPath(src);
  const safeSrc = sanitizeImageSrc(normalizedPrimary);
  const safeFallback = sanitizeImageSrc(normalizeLegacyAssetPath(fallbackSrc));
  const [failedPrimary, setFailedPrimary] = useState(false);
  const [failedFallback, setFailedFallback] = useState(false);

  useEffect(() => {
    setFailedPrimary(false);
    setFailedFallback(false);
  }, [safeSrc, safeFallback]);

  const activeSrc =
    safeSrc && !failedPrimary
      ? safeSrc
      : safeFallback && !failedFallback
        ? safeFallback
        : '';

  if (!activeSrc) {
    return (
      <div
        className={`flex items-center justify-center bg-slate-900 text-amber-400 border border-amber-400/60 shrink-0 ${className}`}
        aria-label={alt}
      >
        <Shield className="w-3/5 h-3/5" />
        {fallbackText ? <span className="sr-only">{fallbackText}</span> : null}
      </div>
    );
  }

  return (
    <img
      src={activeSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => {
        if (!failedPrimary && activeSrc === safeSrc) {
          setFailedPrimary(true);
        } else {
          setFailedFallback(true);
        }
      }}
      className={className}
    />
  );
};
