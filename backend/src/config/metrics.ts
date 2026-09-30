import client from 'prom-client';
import { Request, Response, NextFunction } from 'express';

// Criar registro do Prometheus
const register = new client.Registry();

// Adicionar métricas padrão (CPU, memória, etc)
client.collectDefaultMetrics({ register });

// Métrica: Total de requisições HTTP
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total de requisições HTTP',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// Métrica: Duração das requisições HTTP
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duração das requisições HTTP em segundos',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

// Métrica: Requisições ativas
const httpRequestsInProgress = new client.Gauge({
  name: 'http_requests_in_progress',
  help: 'Número de requisições HTTP em progresso',
  labelNames: ['method', 'route'],
  registers: [register],
});

// Métrica: Total de tickets criados
const ticketsCreatedTotal = new client.Counter({
  name: 'tickets_created_total',
  help: 'Total de tickets criados',
  labelNames: ['priority', 'status'],
  registers: [register],
});

// Métrica: Tickets por status
const ticketsByStatus = new client.Gauge({
  name: 'tickets_by_status',
  help: 'Número de tickets por status',
  labelNames: ['status'],
  registers: [register],
});

// Métrica: Análises de IA realizadas
const aiAnalysesTotal = new client.Counter({
  name: 'ai_analyses_total',
  help: 'Total de análises de IA realizadas',
  labelNames: ['type'],
  registers: [register],
});

// Métrica: Tempo de análise de IA
const aiAnalysisDuration = new client.Histogram({
  name: 'ai_analysis_duration_seconds',
  help: 'Duração das análises de IA em segundos',
  labelNames: ['type'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
  registers: [register],
});

// Métrica: Integrações externas
const externalIntegrationsTotal = new client.Counter({
  name: 'external_integrations_total',
  help: 'Total de chamadas para integrações externas',
  labelNames: ['service', 'status'],
  registers: [register],
});

// Métrica: NPS Score
const npsScore = new client.Gauge({
  name: 'nps_score',
  help: 'Net Promoter Score atual',
  registers: [register],
});

// Middleware para coletar métricas de HTTP
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const route = req.route?.path || req.path;
  const method = req.method;

  // Incrementa contador de requisições em progresso
  httpRequestsInProgress.inc({ method, route });

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const statusCode = res.statusCode.toString();

    // Decrementa contador de requisições em progresso
    httpRequestsInProgress.dec({ method, route });

    // Incrementa total de requisições
    httpRequestsTotal.inc({ method, route, status_code: statusCode });

    // Registra duração
    httpRequestDuration.observe({ method, route, status_code: statusCode }, duration);
  });

  next();
};

// Função para registrar criação de ticket
export const recordTicketCreated = (priority: string, status: string) => {
  ticketsCreatedTotal.inc({ priority, status });
};

// Função para atualizar tickets por status
export const updateTicketsByStatus = (status: string, count: number) => {
  ticketsByStatus.set({ status }, count);
};

// Função para registrar análise de IA
export const recordAIAnalysis = (type: 'chatbot' | 'prioritization' | 'sentiment', duration: number) => {
  aiAnalysesTotal.inc({ type });
  aiAnalysisDuration.observe({ type }, duration);
};

// Função para registrar chamada de integração
export const recordIntegrationCall = (service: 'slack' | 'teams' | 'whatsapp', success: boolean) => {
  const status = success ? 'success' : 'error';
  externalIntegrationsTotal.inc({ service, status });
};

// Função para atualizar NPS
export const updateNPSScore = (score: number) => {
  npsScore.set(score);
};

// Endpoint para expor métricas
export const metricsHandler = async (req: Request, res: Response) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
};

export { register };
export default {
  metricsMiddleware,
  metricsHandler,
  recordTicketCreated,
  updateTicketsByStatus,
  recordAIAnalysis,
  recordIntegrationCall,
  updateNPSScore,
};
