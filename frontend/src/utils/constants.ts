export const TICKET_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Aberto',
  IN_ANALYSIS: 'Em Análise',
  IN_PROGRESS: 'Em Progresso',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
};

export const TICKET_CATEGORY_LABELS: Record<string, string> = {
  TI: 'TI',
  FINANCEIRO: 'Financeiro',
  COMPRAS: 'Compras',
  MANUTENCAO_INDUSTRIAL: 'ManutenÃ§Ã£o Industrial',
  DIRETORIA: 'Diretoria',
  EXPEDICAO: 'ExpediÃ§Ã£o',
  ENGENHARIA_DE_MINAS: 'Engenharia de Minas',
  RECEPCAO: 'RecepÃ§Ã£o',
  PORTARIA: 'Portaria',
  RECURSOS_HUMANOS: 'Recursos Humanos',
  COMERCIAL: 'Comercial',
  SELECAO_E_RECRUTAMENTO: 'SeleÃ§Ã£o e Recrutamento',
  MANUTENCAO_DE_AUTO: 'ManutenÃ§Ã£o de Auto',
};

export const PRIORITY_LABELS: Record<number, string> = {
  1: 'Baixa',
  2: 'Média',
  3: 'Alta',
  4: 'Urgente',
};

export const ROLE_LABELS: Record<string, string> = {
  USER: 'Usuário',
  ATTENDANT: 'Atendente',
  ADMIN: 'Administrador',
};

export const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-800',
  IN_ANALYSIS: 'bg-yellow-100 text-yellow-800',
  IN_PROGRESS: 'bg-purple-100 text-purple-800',
  COMPLETED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-gray-100 text-gray-800',
};

export const PRIORITY_COLORS: Record<number, string> = {
  1: 'bg-gray-100 text-gray-800',
  2: 'bg-blue-100 text-blue-800',
  3: 'bg-orange-100 text-orange-800',
  4: 'bg-red-100 text-red-800',
};
