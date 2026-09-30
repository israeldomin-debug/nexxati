import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import routes from './routes';
import { errorHandler, notFoundHandler, globalLimiter, sanitizeInput } from './middlewares';
import { startBackupScheduler } from './services/backup.scheduler';

// Carrega variáveis de ambiente
const app = express();
const PORT = process.env.PORT || 3333;
const APP_NAME = process.env.APP_NAME || 'NEXXATI - Ativos e Chamados';

// Trust only the local frontend proxy. Direct network clients cannot forge
// X-Forwarded-For, while rate limiting can still identify each browser IP.
app.set('trust proxy', 'loopback');

// Middlewares de segurança
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } })); // Headers de segurança
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// Rate limiting global
app.use(globalLimiter);

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sanitização de inputs (previne XSS)
app.use(sanitizeInput);

// Log de requisições (desenvolvimento)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

// Rotas da API
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/api', routes);

// Tratamento de rotas não encontradas
app.use(notFoundHandler);

// Tratamento global de erros (sempre por último)
app.use(errorHandler);

// Inicia o servidor
app.listen(PORT, () => {
  startBackupScheduler();
  console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║        ${APP_NAME} API - Servidor Rodando
║                                                       ║
║        URL: http://localhost:${PORT}                   ║
║        Ambiente: ${process.env.NODE_ENV || 'development'}              ║
║        Docs: http://localhost:${PORT}/api/health        ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
  `);

});

// Tratamento de erros não capturados
process.on('uncaughtException', (error) => {
  console.error('❌ Erro não capturado:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promise rejeitada não tratada:', reason);
  process.exit(1);
});

export default app;
