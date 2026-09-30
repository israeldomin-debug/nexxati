import axios, { AxiosError } from 'axios';

// Mantém o frontend independente do IP da placa de rede. Em desenvolvimento,
// o Vite encaminha /api para o backend local na porta 3333.
const API_URL = import.meta.env.VITE_API_URL || '/api';

// Cria instância do axios
export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para adicionar token em todas as requisições
api.interceptors.request.use((config) => {
  // Deixa o navegador definir multipart/form-data com o boundary do arquivo.
  if (config.data instanceof FormData) {
    config.headers.delete('Content-Type');
  }
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor para tratar erros de autenticação
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const responseData = error.response?.data as { code?: string } | undefined;
    const authenticationFailureCodes = new Set([
      'TOKEN_MISSING',
      'TOKEN_EXPIRED',
      'TOKEN_INVALID',
      'TOKEN_FORMAT_INVALID',
      'NOT_AUTHENTICATED',
    ]);
    // Um 401 também pode significar senha incorreta em uma confirmação de
    // operação. A sessão só deve ser encerrada quando o backend informar
    // explicitamente que o token da sessão falhou.
    if (error.response?.status === 401 && responseData?.code && authenticationFailureCodes.has(responseData.code)) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Tratamento de erros centralizado
export const handleApiError = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const apiError = error.response?.data;
    return apiError?.error || apiError?.message || 'Erro ao comunicar com o servidor';
  }
  if (error instanceof Error) {
    return error.message || 'Erro inesperado';
  }
  return 'Erro inesperado';
};
