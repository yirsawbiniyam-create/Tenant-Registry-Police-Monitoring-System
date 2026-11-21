import React, { useState } from 'react';
import { Shield } from 'lucide-react';

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
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
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
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};
