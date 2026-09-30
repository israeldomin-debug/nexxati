import axios from 'axios';

interface SlackMessage {
  text: string;
  blocks?: any[];
  channel?: string;
}

interface TeamsMessage {
  text: string;
  title?: string;
  themeColor?: string;
  sections?: any[];
}

interface WhatsAppMessage {
  to: string;
  body: string;
}

export class IntegrationService {
  /**
   * Envia notificação para Slack
   */
  static async sendSlackNotification(
    webhookUrl: string,
    ticket: {
      id: string;
      title: string;
      category: string;
      priority: number;
      status: string;
      createdBy: { name: string };
    }
  ): Promise<void> {
    const priorityEmoji = this.getPriorityEmoji(ticket.priority);
    const categoryEmoji = this.getCategoryEmoji(ticket.category);

    const message: SlackMessage = {
      text: `Novo chamado criado: ${ticket.title}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${priorityEmoji} Novo Chamado: ${ticket.title}`,
            emoji: true
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*ID:*\n${ticket.id.substring(0, 8)}`
            },
            {
              type: 'mrkdwn',
              text: `*Categoria:*\n${categoryEmoji} ${ticket.category}`
            },
            {
              type: 'mrkdwn',
              text: `*Prioridade:*\n${this.getPriorityName(ticket.priority)}`
            },
            {
              type: 'mrkdwn',
              text: `*Status:*\n${this.getStatusName(ticket.status)}`
            },
            {
              type: 'mrkdwn',
              text: `*Criado por:*\n${ticket.createdBy.name}`
            }
          ]
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Ver Chamado',
                emoji: true
              },
              url: `${process.env.FRONTEND_URL}/tickets/${ticket.id}`,
              style: 'primary'
            }
          ]
        }
      ]
    };

    try {
      await axios.post(webhookUrl, message);
    } catch (error) {
      console.error('Erro ao enviar notificação para Slack:', error);
      throw new Error('Falha ao enviar notificação para Slack');
    }
  }

  /**
   * Envia notificação para Microsoft Teams
   */
  static async sendTeamsNotification(
    webhookUrl: string,
    ticket: {
      id: string;
      title: string;
      category: string;
      priority: number;
      status: string;
      createdBy: { name: string };
    }
  ): Promise<void> {
    const priorityColor = this.getPriorityColor(ticket.priority);
    
    const message = {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      themeColor: priorityColor,
      summary: `Novo chamado: ${ticket.title}`,
      sections: [
        {
          activityTitle: `🎫 Novo Chamado`,
          activitySubtitle: ticket.title,
          activityImage: 'https://img.icons8.com/color/96/000000/ticket.png',
          facts: [
            {
              name: 'ID:',
              value: ticket.id.substring(0, 8)
            },
            {
              name: 'Categoria:',
              value: `${this.getCategoryEmoji(ticket.category)} ${ticket.category}`
            },
            {
              name: 'Prioridade:',
              value: this.getPriorityName(ticket.priority)
            },
            {
              name: 'Status:',
              value: this.getStatusName(ticket.status)
            },
            {
              name: 'Criado por:',
              value: ticket.createdBy.name
            }
          ],
          markdown: true
        }
      ],
      potentialAction: [
        {
          '@type': 'OpenUri',
          name: 'Ver Chamado',
          targets: [
            {
              os: 'default',
              uri: `${process.env.FRONTEND_URL}/tickets/${ticket.id}`
            }
          ]
        }
      ]
    };

    try {
      await axios.post(webhookUrl, message);
    } catch (error) {
      console.error('Erro ao enviar notificação para Teams:', error);
      throw new Error('Falha ao enviar notificação para Teams');
    }
  }

  /**
   * Envia mensagem via WhatsApp Business API
   */
  static async sendWhatsAppMessage(
    apiKey: string,
    phoneNumber: string,
    message: string
  ): Promise<void> {
    // Exemplo usando Twilio WhatsApp API
    // Você precisará configurar suas credenciais do Twilio
    const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER;

    if (!twilioAccountSid || !twilioAuthToken || !twilioWhatsAppNumber) {
      console.warn('Credenciais do Twilio WhatsApp não configuradas');
      return;
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;

    try {
      await axios.post(
        url,
        new URLSearchParams({
          From: `whatsapp:${twilioWhatsAppNumber}`,
          To: `whatsapp:${phoneNumber}`,
          Body: message
        }),
        {
          auth: {
            username: twilioAccountSid,
            password: twilioAuthToken
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
    } catch (error) {
      console.error('Erro ao enviar mensagem WhatsApp:', error);
      throw new Error('Falha ao enviar mensagem WhatsApp');
    }
  }

  /**
   * Notifica sobre atualização de ticket
   */
  static async notifyTicketUpdate(
    integrations: Array<{ type: string; webhookUrl: string; active: boolean }>,
    ticket: any,
    updateType: 'created' | 'updated' | 'completed'
  ): Promise<void> {
    const activeIntegrations = integrations.filter(i => i.active);

    const promises = activeIntegrations.map(async (integration) => {
      try {
        switch (integration.type) {
          case 'SLACK':
            await this.sendSlackNotification(integration.webhookUrl, ticket);
            break;
          case 'TEAMS':
            await this.sendTeamsNotification(integration.webhookUrl, ticket);
            break;
          // WhatsApp requer número de telefone do usuário
          // Implementar quando tiver essa informação no modelo User
          default:
            console.warn(`Tipo de integração não suportado: ${integration.type}`);
        }
      } catch (error) {
        console.error(`Erro na integração ${integration.type}:`, error);
        // Não falhar a operação se uma integração falhar
      }
    });

    await Promise.allSettled(promises);
  }

  // Helpers
  private static getPriorityEmoji(priority: number): string {
    const emojis: Record<number, string> = {
      1: '🟢',
      2: '🟡',
      3: '🟠',
      4: '🔴'
    };
    return emojis[priority] || '⚪';
  }

  private static getCategoryEmoji(category: string): string {
    const emojis: Record<string, string> = {
      TI: '💻',
      RH: '👥',
      FINANCEIRO: '💰',
      COMPRAS: '🛒',
      INFRAESTRUTURA: '🏢'
    };
    return emojis[category] || '📋';
  }

  private static getPriorityColor(priority: number): string {
    const colors: Record<number, string> = {
      1: '28a745', // Verde
      2: 'ffc107', // Amarelo
      3: 'fd7e14', // Laranja
      4: 'dc3545'  // Vermelho
    };
    return colors[priority] || '6c757d';
  }

  private static getPriorityName(priority: number): string {
    const names: Record<number, string> = {
      1: '🟢 Baixa',
      2: '🟡 Média',
      3: '🟠 Alta',
      4: '🔴 Urgente'
    };
    return names[priority] || 'Não definida';
  }

  private static getStatusName(status: string): string {
    const names: Record<string, string> = {
      OPEN: '🆕 Aberto',
      IN_ANALYSIS: '🔍 Em Análise',
      IN_PROGRESS: '⚙️ Em Progresso',
      COMPLETED: '✅ Concluído',
      CANCELLED: '❌ Cancelado'
    };
    return names[status] || status;
  }
}
