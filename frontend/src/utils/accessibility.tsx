import { useEffect, useRef } from 'react';

/**
 * Utilitários de acessibilidade para PCDs
 * Seguindo as diretrizes WCAG 2.1 Level AA
 */

/**
 * Hook para anunciar mensagens para leitores de tela
 */
export function useScreenReader() {
  const announcerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Cria um elemento ARIA live region se não existir
    if (!announcerRef.current) {
      const announcer = document.createElement('div');
      announcer.setAttribute('role', 'status');
      announcer.setAttribute('aria-live', 'polite');
      announcer.setAttribute('aria-atomic', 'true');
      announcer.className = 'sr-only';
      announcer.style.position = 'absolute';
      announcer.style.left = '-10000px';
      announcer.style.width = '1px';
      announcer.style.height = '1px';
      announcer.style.overflow = 'hidden';
      document.body.appendChild(announcer);
      announcerRef.current = announcer;
    }

    return () => {
      if (announcerRef.current) {
        document.body.removeChild(announcerRef.current);
      }
    };
  }, []);

  const announce = (message: string, priority: 'polite' | 'assertive' = 'polite') => {
    if (announcerRef.current) {
      announcerRef.current.setAttribute('aria-live', priority);
      announcerRef.current.textContent = message;
    }
  };

  return { announce };
}

/**
 * Hook para gerenciar foco ao abrir/fechar modais
 */
export function useFocusTrap(isOpen: boolean) {
  const containerRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    // Salva o elemento com foco atual
    previousFocusRef.current = document.activeElement as HTMLElement;

    // Encontra todos os elementos focáveis
    const focusableElements = containerRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    // Foca no primeiro elemento
    firstElement?.focus();

    // Gerencia Tab e Shift+Tab
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Restaura o foco ao fechar
      previousFocusRef.current?.focus();
    };
  }, [isOpen]);

  return containerRef;
}

/**
 * Hook para gerenciar navegação por teclado em listas
 */
export function useKeyboardNavigation(itemsCount: number, onSelect: (index: number) => void) {
  const selectedIndexRef = useRef(0);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        selectedIndexRef.current = Math.min(selectedIndexRef.current + 1, itemsCount - 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        selectedIndexRef.current = Math.max(selectedIndexRef.current - 1, 0);
        break;
      case 'Home':
        e.preventDefault();
        selectedIndexRef.current = 0;
        break;
      case 'End':
        e.preventDefault();
        selectedIndexRef.current = itemsCount - 1;
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        onSelect(selectedIndexRef.current);
        break;
    }
  };

  return { handleKeyDown, selectedIndex: selectedIndexRef.current };
}

/**
 * Componente para textos visualmente ocultos mas acessíveis para leitores de tela
 */
export function VisuallyHidden({ children }: { children: React.ReactNode }) {
  return (
    <span className="sr-only absolute left-[-10000px] w-[1px] h-[1px] overflow-hidden">
      {children}
    </span>
  );
}

/**
 * Hook para anunciar mudanças de página
 */
export function usePageAnnouncement(pageName: string) {
  const { announce } = useScreenReader();

  useEffect(() => {
    announce(`Página carregada: ${pageName}`, 'polite');
  }, [pageName, announce]);
}

/**
 * Valida contraste de cores (WCAG AA requer 4.5:1 para texto normal)
 */
export function getContrastRatio(foreground: string, background: string): number {
  // Converte hex para RGB
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : { r: 0, g: 0, b: 0 };
  };

  const getLuminance = (rgb: { r: number; g: number; b: number }) => {
    const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((val) => {
      const normalized = val / 255;
      return normalized <= 0.03928
        ? normalized / 12.92
        : Math.pow((normalized + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const fg = getLuminance(hexToRgb(foreground));
  const bg = getLuminance(hexToRgb(background));

  const lighter = Math.max(fg, bg);
  const darker = Math.min(fg, bg);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Componente de Skip Link (WCAG 2.4.1)
 */
export function SkipToContent() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-md focus:shadow-lg"
    >
      Pular para o conteúdo principal
    </a>
  );
}

/**
 * Hook para detectar modo de alto contraste
 */
export function useHighContrastMode() {
  const preferesHighContrast = window.matchMedia('(prefers-contrast: high)').matches;
  return preferesHighContrast;
}

/**
 * Hook para detectar preferência de movimento reduzido
 */
export function useReducedMotion() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return prefersReducedMotion;
}

/**
 * Componente de Loading acessível
 */
export function AccessibleLoading({ message = 'Carregando...' }: { message?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex items-center gap-2">
      <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full" />
      <span className="sr-only">{message}</span>
    </div>
  );
}

/**
 * Gerencia foco em inputs com erro
 */
export function useFocusOnError(errors: Record<string, any>) {
  useEffect(() => {
    const firstErrorField = Object.keys(errors)[0];
    if (firstErrorField) {
      const element = document.querySelector(`[name="${firstErrorField}"]`) as HTMLElement;
      element?.focus();
    }
  }, [errors]);
}
