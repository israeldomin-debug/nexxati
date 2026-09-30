import { create } from 'zustand';
import { Ticket, TicketFilters } from '@/types';
import { ticketService } from '@/services/ticket.service';

interface TicketState {
  tickets: Ticket[];
  currentTicket: any | null;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  filters: TicketFilters;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchTickets: (filters?: TicketFilters) => Promise<void>;
  fetchTicketById: (id: string) => Promise<void>;
  setFilters: (filters: TicketFilters) => void;
  clearError: () => void;
  clearCurrentTicket: () => void;
}

export const useTicketStore = create<TicketState>((set, get) => ({
  tickets: [],
  currentTicket: null,
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  },
  filters: {},
  isLoading: false,
  error: null,

  fetchTickets: async (filters) => {
    set({ isLoading: true, error: null });
    try {
      const combinedFilters = { ...get().filters, ...filters };
      const response = await ticketService.list(combinedFilters);
      set({
        tickets: response.tickets,
        pagination: response.pagination,
        filters: combinedFilters,
        isLoading: false,
      });
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Erro ao carregar tickets', isLoading: false });
    }
  },

  fetchTicketById: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const ticket = await ticketService.getById(id);
      set({ currentTicket: ticket, isLoading: false });
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Erro ao carregar ticket', isLoading: false });
    }
  },

  setFilters: (filters) => {
    set({ filters });
  },

  clearError: () => set({ error: null }),
  
  clearCurrentTicket: () => set({ currentTicket: null }),
}));
