import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AIService } from '../services/ai.service';
import { z } from 'zod';

const prisma = new PrismaClient();

const chatMessageSchema = z.object({
  message: z.string().min(1),
  sessionId: z.string(),
  context: z.object({
    step: z.number().optional(),
    category: z.string().optional(),
    priority: z.number().optional()
  }).optional()
});

export class ChatbotController {
  /**
   * Processar mensagem do chatbot
   */
  static async processMessage(req: Request, res: Response) {
    try {
      const userId = req.userId;
      const data = chatMessageSchema.parse(req.body);

      // Salvar mensagem do usuário
      const userMessage = await prisma.chatMessage.create({
        data: {
          sessionId: data.sessionId,
          userId,
          message: data.message,
          isBot: false
        }
      });

      // Processar com IA
      const botResponse = AIService.processChatMessage(
        data.message,
        data.context || {}
      );

      // Salvar resposta do bot
      const botMessage = await prisma.chatMessage.create({
        data: {
          sessionId: data.sessionId,
          userId,
          message: botResponse.message,
          isBot: true,
          metadata: botResponse.suggestions || {}
        }
      });

      return res.json({
        userMessage,
        botMessage,
        suggestions: botResponse.suggestions,
        needsMoreInfo: botResponse.needsMoreInfo,
        questions: botResponse.questions
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error('Erro ao processar mensagem:', error);
      return res.status(500).json({ error: 'Erro ao processar mensagem' });
    }
  }

  /**
   * Analisar ticket com IA
   */
  static async analyzeTicket(req: Request, res: Response) {
    try {
      const { title, description } = req.body;

      if (!title || !description) {
        return res.status(400).json({ 
          error: 'Título e descrição são obrigatórios' 
        });
      }

      const analysis = AIService.analyzePriority(title, description);

      return res.json(analysis);
    } catch (error) {
      console.error('Erro ao analisar ticket:', error);
      return res.status(500).json({ error: 'Erro ao analisar ticket' });
    }
  }

  /**
   * Obter histórico de chat
   */
  static async getChatHistory(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;
      const userId = req.userId;

      const messages = await prisma.chatMessage.findMany({
        where: {
          sessionId,
          userId
        },
        orderBy: { createdAt: 'asc' }
      });

      return res.json(messages);
    } catch (error) {
      console.error('Erro ao obter histórico:', error);
      return res.status(500).json({ error: 'Erro ao obter histórico' });
    }
  }

  /**
   * Limpar sessão de chat
   */
  static async clearSession(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;
      const userId = req.userId;

      await prisma.chatMessage.deleteMany({
        where: {
          sessionId,
          userId
        }
      });

      return res.json({ message: 'Sessão limpa com sucesso' });
    } catch (error) {
      console.error('Erro ao limpar sessão:', error);
      return res.status(500).json({ error: 'Erro ao limpar sessão' });
    }
  }
}
