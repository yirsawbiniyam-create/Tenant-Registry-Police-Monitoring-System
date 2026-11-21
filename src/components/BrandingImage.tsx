import React, { useEffect, useState } from 'react';
import { Shield } from 'lucide-react';
import { sanitizeImageSrc } from '../utils/crypto';

interface BrandingImageProps {
  src?: string;
  alt: string;
  className?: string;
  fallbackText?: string;
}

export const BrandingImage: React.FC<BrandingImageProps> = ({
  src,
  alt,
  className = 'w-12 h-12 rounded-full object-cover',
  fallbackText,
}) => {
  const safeSrc = sanitizeImageSrc(src);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [safeSrc]);

  if (!safeSrc || failed) {
    return (
      <div
        className={`flex items-center justify-center bg-slate-900 text-amber-400 border border-slate-700 shrink-0 ${className}`}
        aria-label={alt}
      >
        <Shield className="w-1/2 h-1/2" />
        {fallbackText ? <span className="sr-only">{fallbackText}</span> : null}
      </div>
    );
  }

  return (
    <img
      src={safeSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};
