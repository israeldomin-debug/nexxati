import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

// Schema de validação do payload JWT
const jwtPayloadSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['USER', 'ATTENDANT', 'ADMIN']),
});

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    id: string;
    email: string;
    role: 'USER' | 'ATTENDANT' | 'ADMIN';
  };
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        id: string;
        email: string;
        role: 'USER' | 'ATTENDANT' | 'ADMIN';
      };
      userId?: string;
    }
  }
}

/**
 * Middleware de autenticação JWT
 * Valida o token e adiciona os dados do usuário ao request
 */
export const authenticateToken = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        error: 'Token de autenticação não fornecido',
        code: 'TOKEN_MISSING',
      });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('JWT_SECRET não configurado');
      return res.status(500).json({
        error: 'Erro de configuração do servidor',
        code: 'SERVER_CONFIG_ERROR',
      });
    }

    // Verifica e decodifica o token
    const decoded = jwt.verify(token, secret);

    // Valida o payload do token
    const validatedPayload = jwtPayloadSchema.parse(decoded);

    // Adiciona os dados do usuário ao request
    (req as AuthRequest).user = { ...validatedPayload, id: validatedPayload.userId };
    req.userId = validatedPayload.userId;

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        error: 'Token expirado',
        code: 'TOKEN_EXPIRED',
      });
    }

    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        error: 'Token inválido',
        code: 'TOKEN_INVALID',
      });
    }

    if (error instanceof z.ZodError) {
      return res.status(401).json({
        error: 'Formato do token inválido',
        code: 'TOKEN_FORMAT_INVALID',
      });
    }

    console.error('Erro na autenticação:', error);
    return res.status(500).json({
      error: 'Erro ao processar autenticação',
      code: 'AUTH_PROCESSING_ERROR',
    });
  }
};

/**
 * Middleware para verificar se o usuário tem uma das roles permitidas
 */
export const requireRole = (...allowedRoles: Array<'USER' | 'ATTENDANT' | 'ADMIN'>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;

    if (!authReq.user) {
      return res.status(401).json({
        error: 'Usuário não autenticado',
        code: 'NOT_AUTHENTICATED',
      });
    }

    if (!allowedRoles.includes(authReq.user.role)) {
      return res.status(403).json({
        error: 'Acesso negado. Permissões insuficientes',
        code: 'INSUFFICIENT_PERMISSIONS',
        requiredRoles: allowedRoles,
        userRole: authReq.user.role,
      });
    }

    next();
  };
};

/**
 * Middleware específico para Admin
 */
export const requireAdmin = requireRole('ADMIN');

/**
 * Middleware para Atendente ou Admin
 */
export const requireAttendantOrAdmin = requireRole('ATTENDANT', 'ADMIN');
