import { User, UserPermission, UserRole } from '../types';

const technicalRoles: UserRole[] = ['ATTENDANT', 'ADMIN'];

export const permissionGroups = [
  {
    title: 'Menus',
    permissions: [
      { value: 'ACCESS_DASHBOARD', label: 'Dashboard', description: 'Pode acessar a visão geral do sistema.' },
      { value: 'ACCESS_TICKETS', label: 'Chamados', description: 'Pode acessar a área de chamados.' },
      { value: 'ACCESS_ASSETS', label: 'Ativos', description: 'Pode visualizar o inventário de ativos.' },
      { value: 'ACCESS_ACCESSORIES', label: 'Estoque', description: 'Pode visualizar itens em estoque.' },
      { value: 'ACCESS_LICENSES', label: 'Licenças', description: 'Pode visualizar licenças de software.' },
      { value: 'ACCESS_IP_ADDRESSES', label: 'Endereços de IP', description: 'Pode visualizar IPs utilizados.' },
      { value: 'ACCESS_PASSWORD_VAULT', label: 'Banco de senhas', description: 'Pode visualizar senhas de equipamentos de rede.' },
      { value: 'ACCESS_REPORTS', label: 'Relatórios', description: 'Pode visualizar relatórios de movimentações.' },
      { value: 'ACCESS_COMPANIES', label: 'Empresas', description: 'Pode visualizar empresas cadastradas.' },
      { value: 'ACCESS_SUPPLIERS', label: 'Fornecedores', description: 'Pode visualizar fornecedores cadastrados.' },
      { value: 'ACCESS_USERS', label: 'Usuários', description: 'Pode visualizar usuários cadastrados.' },
    ],
  },
  {
    title: 'Ações técnicas',
    permissions: [
      { value: 'MANAGE_ASSETS', label: 'Alterar ativos', description: 'Pode cadastrar e editar ativos.' },
      { value: 'DISCOVER_ASSETS', label: 'Buscar rede', description: 'Pode rodar busca/inventário de rede.' },
      { value: 'MANAGE_ACCESSORIES', label: 'Movimentar estoque', description: 'Pode cadastrar e registrar saída/entrada de itens de estoque.' },
      { value: 'MANAGE_LICENSES', label: 'Alterar licenças', description: 'Pode cadastrar, editar e excluir licenças.' },
      { value: 'MANAGE_IP_ADDRESSES', label: 'Alterar IPs', description: 'Pode incluir, editar e excluir IPs manuais.' },
      { value: 'MANAGE_PASSWORD_VAULT', label: 'Alterar banco de senhas', description: 'Pode cadastrar, editar e excluir senhas de equipamentos.' },
      { value: 'MANAGE_COMPANIES', label: 'Alterar empresas', description: 'Pode cadastrar, editar e excluir empresas.' },
      { value: 'MANAGE_SUPPLIERS', label: 'Alterar fornecedores', description: 'Pode cadastrar, editar e excluir fornecedores.' },
      { value: 'MANAGE_USERS', label: 'Alterar usuários', description: 'Pode criar, editar e excluir usuários.' },
    ],
  },
] as const satisfies Array<{
  title: string;
  permissions: Array<{ value: UserPermission; label: string; description: string }>;
}>;

export const defaultPermissionsByRole: Record<UserRole, UserPermission[]> = {
  USER: ['ACCESS_DASHBOARD', 'ACCESS_TICKETS'],
  ATTENDANT: [
    'ACCESS_DASHBOARD',
    'ACCESS_TICKETS',
    'ACCESS_ASSETS',
    'ACCESS_ACCESSORIES',
    'ACCESS_LICENSES',
    'ACCESS_IP_ADDRESSES',
    'ACCESS_PASSWORD_VAULT',
    'ACCESS_REPORTS',
    'ACCESS_SUPPLIERS',
  ],
  ADMIN: [
    'ACCESS_DASHBOARD',
    'ACCESS_TICKETS',
    'ACCESS_ASSETS',
    'MANAGE_ASSETS',
    'DISCOVER_ASSETS',
    'ACCESS_ACCESSORIES',
    'MANAGE_ACCESSORIES',
    'ACCESS_LICENSES',
    'MANAGE_LICENSES',
    'ACCESS_IP_ADDRESSES',
    'MANAGE_IP_ADDRESSES',
    'ACCESS_PASSWORD_VAULT',
    'MANAGE_PASSWORD_VAULT',
    'ACCESS_REPORTS',
    'ACCESS_COMPANIES',
    'MANAGE_COMPANIES',
    'ACCESS_SUPPLIERS',
    'MANAGE_SUPPLIERS',
    'ACCESS_USERS',
    'MANAGE_USERS',
  ],
};

export function hasPermission(user: User | null | undefined, permission: UserPermission, fallbackRoles: UserRole[] = []) {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (fallbackRoles.includes(user.role)) return true;
  return user.permissions?.includes(permission) || false;
}

export function canAccessTechnicalArea(user: User | null | undefined, permission: UserPermission) {
  return hasPermission(user, permission, technicalRoles);
}
