import { ReactNode } from 'react';
import { LucideIcon, Sparkles } from 'lucide-react';

interface PremiumPageHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
  icon: LucideIcon;
  actions?: ReactNode;
  className?: string;
}

export function PremiumPageHeader({ eyebrow, title, description, icon: Icon, actions, className = '' }: PremiumPageHeaderProps) {
  return (
    <section className={`premium-hero relative mb-4 overflow-hidden rounded-2xl border border-slate-800 px-5 py-4 text-white shadow-lg shadow-slate-900/10 sm:px-6 ${className}`}>
      <div className="premium-hero-glow absolute -right-16 -top-24 h-52 w-52 rounded-full opacity-20 blur-3xl" />
      <div className="absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-white/5 blur-3xl" />
      <Icon className="absolute -bottom-9 right-7 hidden text-white opacity-[0.05] sm:block" size={132} strokeWidth={1.15} aria-hidden="true" />
      <div className="relative flex flex-col justify-between gap-3 xl:flex-row xl:items-center">
        <div className="min-w-0">
          <div className="mb-1.5 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-sky-200">
            <Sparkles size={13} /> {eyebrow}
          </div>
          <h1 className="text-2xl font-black tracking-[-0.035em] text-white">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-300">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </section>
  );
}

export const premiumHeaderSecondaryAction = 'inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white shadow-sm backdrop-blur transition hover:bg-white/20';
export const premiumHeaderPrimaryAction = 'premium-primary-action inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition hover:-translate-y-0.5';
