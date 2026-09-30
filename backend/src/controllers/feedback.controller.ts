import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

// Schema de validação
const createFeedbackSchema = z.object({
  ticketId: z.string().uuid(),
  rating: z.enum(['VERY_POOR', 'POOR', 'AVERAGE', 'GOOD', 'EXCELLENT']),
  npsScore: z.number().min(0).max(10).optional(),
  comment: z.string().optional()
});

export class FeedbackController {
  /**
   * Criar feedback para um ticket
   */
  static async create(req: Request, res: Response) {
    try {
      const userId = req.userId!;
      const data = createFeedbackSchema.parse(req.body);

      // Verificar se o ticket existe e está concluído
      const ticket = await prisma.ticket.findUnique({
        where: { id: data.ticketId }
      });

      if (!ticket) {
        return res.status(404).json({ error: 'Ticket não encontrado' });
      }

      if (ticket.status !== 'COMPLETED') {
        return res.status(400).json({ 
          error: 'Feedback só pode ser dado para tickets concluídos' 
        });
      }

      // Verificar se já existe feedback
      const existingFeedback = await prisma.feedback.findUnique({
        where: { ticketId: data.ticketId }
      });

      if (existingFeedback) {
        return res.status(400).json({ 
          error: 'Feedback já foi enviado para este ticket' 
        });
      }

      // Criar feedback
      const feedback = await prisma.feedback.create({
        data: {
          ...data,
          userId
        },
        include: {
          ticket: {
            select: {
              id: true,
              title: true
            }
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      return res.status(201).json(feedback);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error('Erro ao criar feedback:', error);
      return res.status(500).json({ error: 'Erro ao criar feedback' });
    }
  }

  /**
   * Listar todos os feedbacks (Admin/Attendant)
   */
  static async list(req: Request, res: Response) {
    try {
      const { page = '1', limit = '20', rating, minNps, maxNps } = req.query;
      
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      const where: any = {};

      if (rating) {
        where.rating = rating;
      }

      if (minNps !== undefined || maxNps !== undefined) {
        where.npsScore = {};
        if (minNps) where.npsScore.gte = parseInt(minNps as string);
        if (maxNps) where.npsScore.lte = parseInt(maxNps as string);
      }

      const [feedbacks, total] = await Promise.all([
        prisma.feedback.findMany({
          where,
          skip,
          take: limitNum,
          include: {
            ticket: {
              select: {
                id: true,
                title: true,
                category: true
              }
            },
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }),
        prisma.feedback.count({ where })
      ]);

      return res.json({
        feedbacks,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      });
    } catch (error) {
      console.error('Erro ao listar feedbacks:', error);
      return res.status(500).json({ error: 'Erro ao listar feedbacks' });
    }
  }

  /**
   * Buscar feedback por ID
   */
  static async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const feedback = await prisma.feedback.findUnique({
        where: { id },
        include: {
          ticket: {
            select: {
              id: true,
              title: true,
              category: true,
              createdBy: {
                select: {
                  name: true,
                  email: true
                }
              }
            }
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      if (!feedback) {
        return res.status(404).json({ error: 'Feedback não encontrado' });
      }

      return res.json(feedback);
    } catch (error) {
      console.error('Erro ao buscar feedback:', error);
      return res.status(500).json({ error: 'Erro ao buscar feedback' });
    }
  }

  /**
   * Obter estatísticas de feedback
   */
  static async getStats(req: Request, res: Response) {
    try {
      const feedbacks = await prisma.feedback.findMany({
        select: {
          rating: true,
          npsScore: true
        }
      });

      // Estatísticas de Rating
      const ratingStats = {
        VERY_POOR: 0,
        POOR: 0,
        AVERAGE: 0,
        GOOD: 0,
        EXCELLENT: 0
      };

      feedbacks.forEach(f => {
        ratingStats[f.rating]++;
      });

      // Calcular NPS
      const npsScores = feedbacks.filter(f => f.npsScore !== null);
      let promoters = 0;
      let passives = 0;
      let detractors = 0;

      npsScores.forEach(f => {
        const score = f.npsScore!;
        if (score >= 9) promoters++;
        else if (score >= 7) passives++;
        else detractors++;
      });

      const totalNps = npsScores.length;
      const nps = totalNps > 0 
        ? Math.round(((promoters - detractors) / totalNps) * 100)
        : 0;

      // Média de satisfação
      const totalRating = feedbacks.length;
      const ratingValues = {
        VERY_POOR: 1,
        POOR: 2,
        AVERAGE: 3,
        GOOD: 4,
        EXCELLENT: 5
      };

      const sumRating = feedbacks.reduce((sum, f) => sum + ratingValues[f.rating], 0);
      const averageRating = totalRating > 0 ? (sumRating / totalRating).toFixed(2) : 0;

      return res.json({
        total: feedbacks.length,
        ratingDistribution: ratingStats,
        averageRating,
        nps: {
          score: nps,
          promoters: Math.round((promoters / totalNps) * 100) || 0,
          passives: Math.round((passives / totalNps) * 100) || 0,
          detractors: Math.round((detractors / totalNps) * 100) || 0,
          total: totalNps
        }
      });
    } catch (error) {
      console.error('Erro ao obter estatísticas:', error);
      return res.status(500).json({ error: 'Erro ao obter estatísticas' });
    }
  }
}
