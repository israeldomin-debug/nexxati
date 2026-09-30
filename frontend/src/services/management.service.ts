import { api } from './api';

export type ManagementOverview = {
  counts: Record<'offlineAgents' | 'lowStock' | 'warranties' | 'maintenance' | 'incompleteAssets' | 'licenseIssues' | 'purchasePending' | 'duplicateHostnames' | 'orphanIps' | 'stockMismatches' | 'overdueTickets', number>;
  offlineAgents: Array<{ id: string; computerName: string; agentName: string; lastSeenAt: string; minutesOffline: number }>;
  lowStock: Array<{ id: string; name: string; quantity: number; minQuantity: number; unit: string }>;
  warranties: Array<{ id: string; name: string; assetTag: string; warrantyExpires: string }>;
  maintenance: Array<{ id: string; name: string; assetTag: string; nextMaintenanceAt: string }>;
  incompleteAssets: Array<{ id: string; name: string; assetTag: string; companyId: string | null; location: string | null }>;
  licenseIssues: Array<{ id: string; softwareName: string; licenseNumber: string; seats: number; _count: { assets: number } }>;
  purchasePending: Array<{ id: string; itemName: string; requestedQuantity: number; unit: string; status: string }>;
  duplicateHostnames: Array<{ hostname: string | null; _count: { hostname: number } }>;
  orphanIps: Array<{ id: string; ipAddress: string; assetId: string | null; networkSegment: { name: string } | null }>;
  stockMismatches: Array<{ id: string; name: string; quantity: number; balanceQuantity: number }>;
  overdueTickets: Array<{ id: string; title: string; priority: string; dueAt: string }>;
};

export type ManagedAgent = { id: string; agentName: string; computerName: string; agentInfo: Record<string, unknown>; firstSeenAt: string; lastSeenAt: string; online: boolean; minutesSinceLastSeen: number; version: string | null };
export type CustodyTerm = { id: string; number: string; type: 'DELIVERY' | 'RETURN'; status: 'DRAFT' | 'SIGNED' | 'CANCELLED'; accessoryItems: Array<{ name: string; quantity: number; serialNumber?: string | null }>; notes: string | null; signedByName: string | null; signedAt: string | null; createdAt: string; responsibleUser: { id: string; name: string; email: string; company?: { name: string } | null }; createdBy: { name: string }; assets: Array<{ asset: { id: string; name: string; assetTag: string; serialNumber: string | null; manufacturer: string | null; model: string | null; type: string } }> };
export type MaintenanceRecord = { id: string; status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'; scheduledAt: string; completedAt: string | null; checklist: Array<{ label: string; done: boolean }>; workPerformed: string | null; partsUsed: string | null; cost: number | string | null; nextMaintenanceAt: string | null; asset: { id: string; name: string; assetTag: string; type: string }; createdBy: { name: string }; completedBy: { name: string } | null; parts: Array<{ id: string; quantity: number; accessory: { id: string; name: string; unit: string } }> };
export type KnowledgeArticle = { id: string; title: string; category: string; problem: string; solution: string; tags: string[]; published: boolean; createdAt: string; updatedAt: string; createdBy: { name: string }; ticket: { id: string; title: string } | null };
export type PurchaseRequest = { id: string; itemName: string; requestedQuantity: number; unit: string; status: 'REQUESTED' | 'QUOTING' | 'APPROVED' | 'ORDERED' | 'RECEIVED' | 'CANCELLED'; estimatedUnitCost: number | string | null; notes: string | null; createdAt: string; receivedAt: string | null; accessory: { id: string; quantity: number; minQuantity: number } | null; supplier: { id: string; name: string } | null; requestedBy: { name: string } };

export const managementService = {
  overview: async () => (await api.get<{ overview: ManagementOverview }>('/management/overview')).data.overview,
  agents: async () => (await api.get<{ agents: ManagedAgent[] }>('/management/agents')).data.agents,
  agentPackage: () => api.get('/management/agents/package', { responseType: 'blob' }),
  deleteAgent: (id: string, password: string) => api.delete(`/management/agents/${id}`, { data: { password } }),
  terms: async () => (await api.get<{ terms: CustodyTerm[] }>('/management/terms')).data.terms,
  createTerm: async (data: { type: string; responsibleUserId: string; assetIds: string[]; accessoryItems: Array<{ name: string; quantity: number; serialNumber?: string | null }>; notes?: string }) => (await api.post('/management/terms', data)).data,
  signTerm: (id: string, signedByName: string) => api.patch(`/management/terms/${id}/sign`, { signedByName }),
  maintenance: async () => (await api.get<{ records: MaintenanceRecord[] }>('/management/maintenance')).data.records,
  createMaintenance: (data: Record<string, unknown>) => api.post('/management/maintenance', data),
  updateMaintenance: (id: string, data: Record<string, unknown>) => api.patch(`/management/maintenance/${id}`, data),
  knowledge: async (search = '') => (await api.get<{ articles: KnowledgeArticle[] }>('/management/knowledge', { params: search ? { search } : undefined })).data.articles,
  createArticle: (data: Record<string, unknown>) => api.post('/management/knowledge', data),
  updateArticle: (id: string, data: Record<string, unknown>) => api.patch(`/management/knowledge/${id}`, data),
  purchases: async () => (await api.get<{ requests: PurchaseRequest[] }>('/management/purchases')).data.requests,
  createPurchase: (data: Record<string, unknown>) => api.post('/management/purchases', data),
  generatePurchases: async () => (await api.post<{ created: number }>('/management/purchases/generate')).data,
  updatePurchase: (id: string, data: Record<string, unknown>) => api.patch(`/management/purchases/${id}`, data),
};
