import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { IntegrationService } from '../services/integration.service';
import { z } from 'zod';

const prisma = new PrismaClient();

const createIntegrationSchema = z.object({
  type: z.enum(['SLACK', 'TEAMS', 'WHATSAPP']),
  name: z.string().min(1),
  webhookUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
  config: z.record(z.any()).optional()
});

const updateIntegrationSchema = z.object({
  name: z.string().min(1).optional(),
  webhookUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
  active: z.boolean().optional(),
  config: z.record(z.any()).optional()
});

export class IntegrationController {
  /**
   * Criar integração (Admin)
   */
  static async create(req: Request, res: Response) {
    try {
      const data = createIntegrationSchema.parse(req.body);

      const integration = await prisma.integration.create({
        data
      });

      return res.status(201).json(integration);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error('Erro ao criar integração:', error);
      return res.status(500).json({ error: 'Erro ao criar integração' });
    }
  }

  /**
   * Listar integrações
   */
  static async list(req: Request, res: Response) {
    try {
      const { type, active } = req.query;

      const where: any = {};
      if (type) where.type = type;
      if (active !== undefined) where.active = active === 'true';

      const integrations = await prisma.integration.findMany({
        where,
        orderBy: { createdAt: 'desc' }
      });

      return res.json(integrations);
    } catch (error) {
      console.error('Erro ao listar integrações:', error);
      return res.status(500).json({ error: 'Erro ao listar integrações' });
    }
  }

  /**
   * Buscar integração por ID
   */
  static async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const integration = await prisma.integration.findUnique({
        where: { id }
      });

      if (!integration) {
        return res.status(404).json({ error: 'Integração não encontrada' });
      }

      return res.json(integration);
    } catch (error) {
      console.error('Erro ao buscar integração:', error);
      return res.status(500).json({ error: 'Erro ao buscar integração' });
    }
  }

  /**
   * Atualizar integração
   */
  static async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const data = updateIntegrationSchema.parse(req.body);

      const integration = await prisma.integration.update({
        where: { id },
        data
      });

      return res.json(integration);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error('Erro ao atualizar integração:', error);
      return res.status(500).json({ error: 'Erro ao atualizar integração' });
    }
  }

  /**
   * Deletar integração
   */
  static async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;

      await prisma.integration.delete({
        where: { id }
      });

      return res.status(204).send();
    } catch (error) {
      console.error('Erro ao deletar integração:', error);
      return res.status(500).json({ error: 'Erro ao deletar integração' });
    }
  }

  /**
   * Testar integração
   */
  static async test(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const integration = await prisma.integration.findUnique({
        where: { id }
      });

      if (!integration) {
        return res.status(404).json({ error: 'Integração não encontrada' });
      }

      if (!integration.active) {
        return res.status(400).json({ error: 'Integração está inativa' });
      }

      // Criar ticket de teste
      const testTicket = {
        id: 'test-' + Date.now(),
        title: 'Ticket de Teste - Integração',
        category: 'TI',
        priority: 2,
        status: 'OPEN',
        createdBy: { name: 'Sistema de Testes' }
      };

      try {
        switch (integration.type) {
          case 'SLACK':
            if (!integration.webhookUrl) {
              return res.status(400).json({ 
                error: 'Webhook URL não configurado' 
              });
            }
            await IntegrationService.sendSlackNotification(
              integration.webhookUrl,
              testTicket
            );
            break;

          case 'TEAMS':
            if (!integration.webhookUrl) {
              return res.status(400).json({ 
                error: 'Webhook URL não configurado' 
              });
            }
            await IntegrationService.sendTeamsNotification(
              integration.webhookUrl,
              testTicket
            );
            break;

          case 'WHATSAPP':
            return res.status(400).json({ 
              error: 'Teste de WhatsApp requer número de telefone' 
            });

          default:
            return res.status(400).json({ 
              error: 'Tipo de integração não suportado' 
            });
        }

        return res.json({ 
          message: 'Integração testada com sucesso!',
          type: integration.type
        });
      } catch (error: any) {
        return res.status(500).json({ 
          error: 'Falha no teste de integração',
          details: error.message
        });
      }
    } catch (error) {
      console.error('Erro ao testar integração:', error);
      return res.status(500).json({ error: 'Erro ao testar integração' });
    }
  }

  /**
   * Ativar/Desativar integração
   */
  static async toggleActive(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const integration = await prisma.integration.findUnique({
        where: { id }
      });

      if (!integration) {
        return res.status(404).json({ error: 'Integração não encontrada' });
      }

      const updated = await prisma.integration.update({
        where: { id },
        data: { active: !integration.active }
      });

      return res.json(updated);
    } catch (error) {
      console.error('Erro ao alternar status:', error);
      return res.status(500).json({ error: 'Erro ao alternar status' });
    }
  }
}
