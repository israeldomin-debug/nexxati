import { useState, useEffect, useRef } from 'react';
import { Send, X, Bot, User, Loader2 } from 'lucide-react';
import { api } from '../services/api';
import { branding } from '../config/branding';

interface Message {
  id: string;
  message: string;
  isBot: boolean;
  timestamp: Date;
  suggestions?: {
    category?: string;
    priority?: number;
    title?: string;
  };
}

interface ChatbotProps {
  onClose: () => void;
  onCreateTicket?: (data: any) => void;
}

export function Chatbot({ onClose, onCreateTicket }: ChatbotProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => `session-${Date.now()}`);
  const [step, setStep] = useState(0);
  const [ticketData, setTicketData] = useState<any>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Mensagem inicial
    sendInitialMessage();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const sendInitialMessage = async () => {
    try {
      const response = await api.post('/chatbot/message', {
        message: 'start',
        sessionId,
        context: { step: 0 }
      });

      const botMessage: Message = {
        id: response.data.botMessage.id,
        message: response.data.botMessage.message,
        isBot: true,
        timestamp: new Date(response.data.botMessage.createdAt)
      };

      setMessages([botMessage]);
      setStep(1);
    } catch (error) {
      console.error('Erro ao iniciar chat:', error);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      message: input,
      isBot: false,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await api.post('/chatbot/message', {
        message: input,
        sessionId,
        context: { step, ...ticketData }
      });

      const botMessage: Message = {
        id: response.data.botMessage.id,
        message: response.data.botMessage.message,
        isBot: true,
        timestamp: new Date(response.data.botMessage.createdAt),
        suggestions: response.data.suggestions
      };

      setMessages(prev => [...prev, botMessage]);

      // Atualizar dados do ticket com sugestões
      if (response.data.suggestions) {
        setTicketData((prev: any) => ({
          ...prev,
          ...response.data.suggestions
        }));
      }

      setStep(step + 1);

      // Se não precisa de mais info, mostrar botão para criar ticket
      if (!response.data.needsMoreInfo && response.data.suggestions) {
        // Ticket pronto para ser criado
      }
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        message: 'Desculpe, ocorreu um erro. Tente novamente.',
        isBot: true,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleCreateTicket = () => {
    if (onCreateTicket && ticketData) {
      onCreateTicket(ticketData);
      onClose();
    }
  };

  const getCategoryName = (category: string) => {
    const names: Record<string, string> = {
      TI: 'Tecnologia da Informação',
      RECURSOS_HUMANOS: 'Recursos Humanos',
      FINANCEIRO: 'Financeiro',
      COMPRAS: 'Compras',
      MANUTENCAO_INDUSTRIAL: 'ManutenÃ§Ã£o Industrial'
    };
    return names[category] || category;
  };

  const getPriorityName = (priority: number) => {
    const names: Record<number, string> = {
      1: 'Baixa',
      2: 'Média',
      3: 'Alta',
      4: 'Urgente'
    };
    return names[priority] || 'Não definida';
  };

  return (
    <div className="fixed bottom-4 right-4 w-96 h-[600px] bg-white rounded-lg shadow-2xl flex flex-col z-50 border border-gray-200">
      {/* Header */}
      <div className="bg-blue-600 text-white p-4 rounded-t-lg flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-6 w-6" />
          <div>
            <h3 className="font-semibold">Assistente Virtual</h3>
            <p className="text-xs text-blue-100">{branding.appName}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="hover:bg-blue-700 p-1 rounded transition-colors"
          aria-label="Fechar chat"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-2 ${msg.isBot ? 'justify-start' : 'justify-end'}`}
          >
            {msg.isBot && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                <Bot className="h-5 w-5 text-blue-600" />
              </div>
            )}
            
            <div className={`flex flex-col ${msg.isBot ? 'items-start' : 'items-end'} max-w-[75%]`}>
              <div
                className={`px-4 py-2 rounded-lg ${
                  msg.isBot
                    ? 'bg-white border border-gray-200 text-gray-800'
                    : 'bg-blue-600 text-white'
                }`}
              >
                <p className="whitespace-pre-wrap text-sm">{msg.message}</p>
                
                {/* Mostrar sugestões se disponíveis */}
                {msg.suggestions && (
                  <div className="mt-3 pt-3 border-t border-gray-200 space-y-1 text-xs">
                    {msg.suggestions.category && (
                      <p>
                        <span className="font-semibold">Categoria:</span>{' '}
                        {getCategoryName(msg.suggestions.category)}
                      </p>
                    )}
                    {msg.suggestions.priority !== undefined && (
                      <p>
                        <span className="font-semibold">Prioridade:</span>{' '}
                        {getPriorityName(msg.suggestions.priority)}
                      </p>
                    )}
                  </div>
                )}
              </div>
              <span className="text-xs text-gray-500 mt-1">
                {msg.timestamp.toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
            </div>

            {!msg.isBot && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                <User className="h-5 w-5 text-white" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-2 justify-start">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
              <Bot className="h-5 w-5 text-blue-600" />
            </div>
            <div className="bg-white border border-gray-200 px-4 py-2 rounded-lg">
              <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-200 bg-white rounded-b-lg">
        {step > 2 && ticketData.title && (
          <button
            onClick={handleCreateTicket}
            className="w-full mb-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm"
          >
            ✓ Criar Chamado
          </button>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Digite sua mensagem..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            disabled={loading}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Enviar mensagem"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
