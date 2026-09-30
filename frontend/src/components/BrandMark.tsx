import { branding } from '../config/branding';

type BrandMarkProps = {
  compact?: boolean;
  centered?: boolean;
  fullLogo?: boolean;
};

export function BrandMark({ compact = false, centered = false, fullLogo = false }: BrandMarkProps) {
  if (fullLogo && branding.useLogo) {
    return (
      <div className={centered ? 'flex justify-center' : ''}>
        <img
          src={branding.fullLogoUrl}
          alt={branding.appName}
          className={`${compact ? 'h-12' : 'h-28'} w-auto max-w-full object-contain`}
        />
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 ${centered ? 'justify-center text-center' : ''}`}>
      {branding.useLogo ? (
        <img
          src={branding.iconUrl}
          alt=""
          className={`${compact ? 'h-10 w-10' : 'h-16 w-16'} shrink-0 object-contain`}
        />
      ) : (
        <div className={`${compact ? 'h-10 w-10 text-sm' : 'h-16 w-16 text-xl'} grid shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-700 via-indigo-600 to-cyan-500 font-black tracking-tight text-white shadow-lg shadow-blue-200`}>
          {branding.shortName}
        </div>
      )}
      <div className="min-w-0">
        <strong className={`${compact ? 'text-sm' : 'text-xl'} block truncate font-extrabold text-slate-900`}>
          {branding.appName}
        </strong>
        <span className={`${compact ? 'text-[11px]' : 'text-sm'} block truncate font-medium text-slate-500`}>
          {branding.subtitle}
        </span>
      </div>
    </div>
  );
}
