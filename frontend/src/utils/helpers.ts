import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Formata data completa
 */
export const formatDate = (date: string | Date): string => {
  return format(new Date(date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
};

/**
 * Formata data apenas (sem hora)
 */
export const formatDateOnly = (date: string | Date): string => {
  return format(new Date(date), 'dd/MM/yyyy', { locale: ptBR });
};

/**
 * Formata tempo relativo (ex: "há 2 horas")
 */
export const formatRelativeTime = (date: string | Date): string => {
  return formatDistanceToNow(new Date(date), {
    addSuffix: true,
    locale: ptBR,
  });
};

/**
 * Combina classes CSS com suporte a condicionais
 */
export const cn = (...classes: (string | boolean | undefined)[]): string => {
  return classes.filter(Boolean).join(' ');
};
