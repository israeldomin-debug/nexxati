import { Router } from 'express';
import { ChatbotController } from '../controllers/chatbot.controller';
import { authenticateToken } from '../middlewares/auth.middleware';

const router = Router();

// Todas as rotas exigem autenticação
router.use(authenticateToken);

// Processar mensagem do chatbot
router.post('/message', ChatbotController.processMessage);

// Analisar ticket com IA
router.post('/analyze', ChatbotController.analyzeTicket);

// Obter histórico de chat
router.get('/history/:sessionId', ChatbotController.getChatHistory);

// Limpar sessão de chat
router.delete('/session/:sessionId', ChatbotController.clearSession);

export default router;
