const readEnv = (value: string | undefined, fallback: string) => value?.trim() || fallback;

export const branding = {
  appName: readEnv(import.meta.env.VITE_APP_NAME, 'NEXXATI'),
  shortName: readEnv(import.meta.env.VITE_APP_SHORT_NAME, 'NX'),
  subtitle: readEnv(import.meta.env.VITE_APP_SUBTITLE, 'Ativos e Chamados'),
  iconUrl: readEnv(import.meta.env.VITE_APP_ICON_URL, '/nexxati-icon-modern.svg'),
  fullLogoUrl: readEnv(import.meta.env.VITE_APP_FULL_LOGO_URL, '/nexxati-logo-modern.svg'),
  useLogo: import.meta.env.VITE_APP_USE_LOGO !== 'false',
};

export function applyDocumentBranding() {
  document.title = branding.appName;

  const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (description) description.content = `${branding.appName} - ${branding.subtitle}`;

  const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (favicon) favicon.href = branding.iconUrl;
}
