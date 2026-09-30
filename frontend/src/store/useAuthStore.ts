import { create } from 'zustand';
import { User, LoginCredentials, LoginResponse } from '@/types';
import { authService } from '@/services/auth.service';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  login: (credentials: LoginCredentials) => Promise<LoginResponse>;
  logout: () => void;
  loadUser: () => Promise<void>;
  changePassword: (data: { currentPassword: string; newPassword: string; confirmPassword: string }) => Promise<User>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: authService.getUser(),
  token: localStorage.getItem('token'),
  isLoading: false,
  error: null,

  login: async (credentials) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.login(credentials);
      authService.saveAuth(response.token, response.user);
      set({ user: response.user, token: response.token, isLoading: false });
      return response;
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Erro ao fazer login', isLoading: false });
      throw error;
    }
  },

  logout: () => {
    authService.logout();
    set({ user: null, token: null });
  },

  loadUser: async () => {
    if (!authService.isAuthenticated()) return;
    
    set({ isLoading: true });
    try {
      const response = await authService.me();
      authService.saveAuth(localStorage.getItem('token') || '', response.user);
      set({ user: response.user, isLoading: false });
    } catch (error) {
      // O interceptor remove o token apenas em falhas de autenticação.
      // Falhas temporárias ao consultar o perfil não encerram a sessão.
      if (!authService.isAuthenticated()) {
        set({ user: null, token: null, isLoading: false });
      } else {
        set({ isLoading: false });
      }
      throw error;
    }
  },

  changePassword: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.changePassword(data);
      authService.saveAuth(localStorage.getItem('token') || '', response.user);
      set({ user: response.user, isLoading: false });
      return response.user;
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Erro ao alterar senha', isLoading: false });
      throw error;
    }
  },

  clearError: () => set({ error: null }),
}));
