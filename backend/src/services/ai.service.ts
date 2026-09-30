// Serviço de Inteligência Artificial para análise e priorização de tickets

interface AnalysisResult {
  suggestedPriority: number;
  suggestedCategory: string;
  confidence: number;
  keywords: string[];
  urgencyIndicators: string[];
}

interface ChatbotResponse {
  message: string;
  suggestions?: {
    category?: string;
    priority?: number;
    title?: string;
  };
  needsMoreInfo?: boolean;
  questions?: string[];
}

export class AIService {
  /**
   * Analisa o conteúdo do ticket para sugerir prioridade
   */
  static analyzePriority(title: string, description: string): AnalysisResult {
    const content = `${title} ${description}`.toLowerCase();
    
    // Palavras-chave de urgência
    const urgentKeywords = [
      'urgente', 'crítico', 'emergência', 'parado', 'travado',
      'não funciona', 'caiu', 'fora do ar', 'bloqueado', 'imediato',
      'agora', 'grave', 'sério', 'importante'
    ];
    
    const highKeywords = [
      'problema', 'erro', 'falha', 'bug', 'lento',
      'não abre', 'não carrega', 'atrasado', 'perda'
    ];
    
    const mediumKeywords = [
      'dúvida', 'ajuda', 'melhoria', 'sugestão', 'configuração',
      'ajuste', 'alteração', 'atualização'
    ];
    
    const lowKeywords = [
      'informação', 'consulta', 'pergunta', 'orientação',
      'tutorial', 'documentação', 'treinamento'
    ];

    // Contadores
    let urgentCount = 0;
    let highCount = 0;
    let mediumCount = 0;
    let lowCount = 0;
    const foundKeywords: string[] = [];
    const urgencyIndicators: string[] = [];

    // Análise de palavras-chave
    urgentKeywords.forEach(keyword => {
      if (content.includes(keyword)) {
        urgentCount++;
        foundKeywords.push(keyword);
        urgencyIndicators.push(keyword);
      }
    });

    highKeywords.forEach(keyword => {
      if (content.includes(keyword)) {
        highCount++;
        foundKeywords.push(keyword);
      }
    });

    mediumKeywords.forEach(keyword => {
      if (content.includes(keyword)) {
        mediumCount++;
        foundKeywords.push(keyword);
      }
    });

    lowKeywords.forEach(keyword => {
      if (content.includes(keyword)) {
        lowCount++;
        foundKeywords.push(keyword);
      }
    });

    // Determinar prioridade
    let suggestedPriority = 1;
    let confidence = 0.5;

    if (urgentCount >= 2) {
      suggestedPriority = 4; // Urgente
      confidence = 0.9;
    } else if (urgentCount >= 1 || highCount >= 2) {
      suggestedPriority = 3; // Alta
      confidence = 0.8;
    } else if (highCount >= 1 || mediumCount >= 2) {
      suggestedPriority = 2; // Média
      confidence = 0.7;
    } else {
      suggestedPriority = 1; // Baixa
      confidence = 0.6;
    }

    // Aumentar confiança se houver múltiplos indicadores
    if (foundKeywords.length > 3) {
      confidence = Math.min(confidence + 0.1, 0.95);
    }

    // Sugerir categoria baseada no conteúdo
    const suggestedCategory = this.suggestCategory(content);

    return {
      suggestedPriority,
      suggestedCategory,
      confidence,
      keywords: foundKeywords,
      urgencyIndicators
    };
  }

  /**
   * Sugere uma categoria baseada no conteúdo
   */
  static suggestCategory(content: string): string {
    const categories = {
      TI: [
        'sistema', 'software', 'computador', 'internet', 'rede',
        'email', 'acesso', 'senha', 'login', 'impressora',
        'backup', 'servidor', 'aplicativo', 'site', 'banco de dados'
      ],
      RECURSOS_HUMANOS: [
        'férias', 'folha', 'pagamento', 'salário', 'contrato',
        'admissão', 'demissão', 'benefício', 'plano de saúde',
        'vale', 'atestado', 'falta', 'ponto', 'horas extras'
      ],
      FINANCEIRO: [
        'pagamento', 'nota fiscal', 'cobrança', 'fatura',
        'reembolso', 'despesa', 'orçamento', 'compra',
        'fornecedor', 'conta', 'boleto', 'transferência'
      ],
      COMPRAS: [
        'compra', 'cotação', 'fornecedor', 'pedido',
        'aquisição', 'material', 'equipamento', 'produto',
        'entrega', 'estoque'
      ],
      MANUTENCAO_INDUSTRIAL: [
        'manutenção', 'reparo', 'instalação', 'elétrica',
        'ar condicionado', 'limpeza', 'segurança', 'acesso',
        'chave', 'sala', 'prédio', 'facilities'
      ]
    };

    let maxScore = 0;
    let suggestedCategory = 'TI';

    Object.entries(categories).forEach(([category, keywords]) => {
      let score = 0;
      keywords.forEach(keyword => {
        if (content.includes(keyword)) {
          score++;
        }
      });
      if (score > maxScore) {
        maxScore = score;
        suggestedCategory = category;
      }
    });

    return suggestedCategory;
  }

  /**
   * Chatbot para triagem de chamados
   */
  static processChatMessage(
    message: string,
    context: { step?: number; category?: string; priority?: number } = {}
  ): ChatbotResponse {
    const lowerMessage = message.toLowerCase();

    // Primeiro contato
    if (!context.step || context.step === 0) {
      return {
        message: `Olá! 👋 Sou o assistente virtual do ${process.env.APP_NAME || 'NEXXATI - Ativos e Chamados'}. Vou ajudá-lo a abrir seu chamado.\n\nPor favor, descreva brevemente qual é o problema ou solicitação.`,
        needsMoreInfo: true,
        questions: ['Qual é o problema ou solicitação?']
      };
    }

    // Análise inicial
    if (context.step === 1) {
      const analysis = this.analyzePriority(message, message);
      
      return {
        message: `Entendi! Analisando sua solicitação...\n\n` +
          `📊 Análise:\n` +
          `- Categoria sugerida: ${this.getCategoryName(analysis.suggestedCategory)}\n` +
          `- Prioridade sugerida: ${this.getPriorityName(analysis.suggestedPriority)}\n` +
          `- Confiança: ${Math.round(analysis.confidence * 100)}%\n\n` +
          `${analysis.urgencyIndicators.length > 0 ? 
            `⚠️ Detectei indicadores de urgência: ${analysis.urgencyIndicators.join(', ')}\n\n` : ''}` +
          `Para criar o chamado, preciso de mais algumas informações:\n` +
          `1. Você confirma a categoria e prioridade sugeridas?\n` +
          `2. Pode fornecer mais detalhes sobre o problema?`,
        suggestions: {
          category: analysis.suggestedCategory,
          priority: analysis.suggestedPriority,
          title: this.generateTitle(message)
        },
        needsMoreInfo: true
      };
    }

    // Confirmar e criar
    if (context.step === 2) {
      return {
        message: '✅ Perfeito! Com essas informações já posso criar seu chamado.\n\n' +
          'Deseja adicionar algum arquivo ou informação adicional? (Opcional)\n\n' +
          'Caso contrário, clique em "Criar Chamado" para finalizar.',
        needsMoreInfo: false
      };
    }

    return {
      message: 'Desculpe, não entendi. Pode reformular sua mensagem?',
      needsMoreInfo: true
    };
  }

  /**
   * Gera um título automático baseado na mensagem
   */
  static generateTitle(message: string): string {
    const words = message.split(' ').slice(0, 10);
    let title = words.join(' ');
    if (title.length > 100) {
      title = title.substring(0, 97) + '...';
    }
    return title;
  }

  /**
   * Retorna nome amigável da categoria
   */
  static getCategoryName(category: string): string {
    const names: Record<string, string> = {
      TI: 'Tecnologia da Informação',
      RECURSOS_HUMANOS: 'Recursos Humanos',
      FINANCEIRO: 'Financeiro',
      COMPRAS: 'Compras',
      MANUTENCAO_INDUSTRIAL: 'ManutenÃ§Ã£o Industrial'
    };
    return names[category] || category;
  }

  /**
   * Retorna nome amigável da prioridade
   */
  static getPriorityName(priority: number): string {
    const names: Record<number, string> = {
      1: '🟢 Baixa',
      2: '🟡 Média',
      3: '🟠 Alta',
      4: '🔴 Urgente'
    };
    return names[priority] || 'Não definida';
  }

  /**
   * Calcula NPS (Net Promoter Score)
   */
  static calculateNPS(feedbacks: { npsScore: number | null }[]): {
    nps: number;
    promoters: number;
    passives: number;
    detractors: number;
  } {
    const validFeedbacks = feedbacks.filter(f => f.npsScore !== null);
    
    if (validFeedbacks.length === 0) {
      return { nps: 0, promoters: 0, passives: 0, detractors: 0 };
    }

    let promoters = 0;
    let passives = 0;
    let detractors = 0;

    validFeedbacks.forEach(feedback => {
      const score = feedback.npsScore!;
      if (score >= 9) promoters++;
      else if (score >= 7) passives++;
      else detractors++;
    });

    const total = validFeedbacks.length;
    const nps = ((promoters - detractors) / total) * 100;

    return {
      nps: Math.round(nps),
      promoters: Math.round((promoters / total) * 100),
      passives: Math.round((passives / total) * 100),
      detractors: Math.round((detractors / total) * 100)
    };
  }
}
