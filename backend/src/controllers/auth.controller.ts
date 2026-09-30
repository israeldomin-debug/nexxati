import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { ZodError } from 'zod';

const authService = new AuthService();

export class AuthController {
  /**
   * POST /api/auth/register
   * Registra um novo usuário
   */
  async register(req: Request, res: Response) {
    try {
      const user = await authService.register(req.body);

      return res.status(201).json({
        message: 'Usuário registrado com sucesso',
        user,
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Dados inválidos',
          code: 'VALIDATION_ERROR',
          details: error.errors,
        });
      }

      if (error instanceof Error) {
        if (error.message === 'EMAIL_ALREADY_EXISTS') {
          return res.status(409).json({
            error: 'Email já está em uso',
            code: 'EMAIL_ALREADY_EXISTS',
          });
        }
      }

      console.error('Erro no registro:', error);
      return res.status(500).json({
        error: 'Erro ao registrar usuário',
        code: 'REGISTER_ERROR',
      });
    }
  }

  /**
   * POST /api/auth/login
   * Realiza login
   */
  async login(req: Request, res: Response) {
    try {
      const result = await authService.login(req.body);

      return res.status(200).json({
        message: 'Login realizado com sucesso',
        ...result,
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Dados inválidos',
          code: 'VALIDATION_ERROR',
          details: error.errors,
        });
      }

      if (error instanceof Error) {
        if (error.message === 'INVALID_CREDENTIALS') {
          return res.status(401).json({
            error: 'Email ou senha inválidos',
            code: 'INVALID_CREDENTIALS',
          });
        }

        if (error.message === 'USER_INACTIVE') {
          return res.status(403).json({
            error: 'Usuário inativo. Entre em contato com o administrador',
            code: 'USER_INACTIVE',
          });
        }
      }

      console.error('Erro no login:', error);
      return res.status(500).json({
        error: 'Erro ao realizar login',
        code: 'LOGIN_ERROR',
      });
    }
  }

  /**
   * POST /api/auth/forgot-password
   * Registra um pedido de recuperação para o administrador
   */
  async forgotPassword(req: Request, res: Response) {
    try {
      const result = await authService.forgotPassword(req.body);
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Dados inválidos',
          code: 'VALIDATION_ERROR',
          details: error.errors,
        });
      }

      console.error('Erro ao solicitar recuperação de senha:', error);
      return res.status(500).json({
        error: 'Erro ao solicitar recuperação de senha',
        code: 'FORGOT_PASSWORD_ERROR',
      });
    }
  }

  /**
   * POST /api/auth/reset-password-with-code
   * Redefine a senha pela tela de login usando o código de recuperação
   */
  async resetPasswordWithCode(req: Request, res: Response) {
    try {
      const result = await authService.resetPasswordWithCode(req.body);
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Dados inválidos',
          code: 'VALIDATION_ERROR',
          details: error.errors,
        });
      }

      if (error instanceof Error && error.message === 'INVALID_RECOVERY_CODE_OR_USER') {
        return res.status(400).json({
          error: 'Código de recuperação, usuário ou e-mail inválido',
          code: 'INVALID_RECOVERY_CODE_OR_USER',
        });
      }

      console.error('Erro ao redefinir senha por código:', error);
      return res.status(500).json({
        error: 'Erro ao redefinir senha',
        code: 'RESET_PASSWORD_WITH_CODE_ERROR',
      });
    }
  }

  /**
   * GET /api/auth/me
   * Retorna os dados do usuário autenticado
   */
  async me(req: Request, res: Response) {
    try {
      const authReq = req as any; // AuthRequest
      const userId = authReq.user?.userId;

      if (!userId) {
        return res.status(401).json({
          error: 'Não autenticado',
          code: 'NOT_AUTHENTICATED',
        });
      }

      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          role: true,
          active: true,
          mustChangePassword: true,
          passwordResetRequestedAt: true,
          passwordResetHandledAt: true,
          avatarUrl: true,
          themePreference: true,
          appearanceMode: true,
          createdAt: true,
          permissions: {
            select: { permission: true },
          },
        },
      });

      if (!user) {
        return res.status(404).json({
          error: 'Usuário não encontrado',
          code: 'USER_NOT_FOUND',
        });
      }

      return res.status(200).json({
        user: {
          ...user,
          permissions: user.permissions.map((item) => item.permission),
        },
      });
    } catch (error) {
      console.error('Erro ao buscar usuário:', error);
      return res.status(500).json({
        error: 'Erro ao buscar dados do usuário',
        code: 'USER_FETCH_ERROR',
      });
    }
  }

  async changePassword(req: Request, res: Response) {
    try {
      const authReq = req as any;
      const userId = authReq.user?.userId;

      if (!userId) {
        return res.status(401).json({
          error: 'Não autenticado',
          code: 'NOT_AUTHENTICATED',
        });
      }

      const user = await authService.changePassword(userId, req.body);
      return res.status(200).json({
        message: 'Senha alterada com sucesso',
        user,
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: 'Dados inválidos', details: error.errors });
      }
      if (error.message === 'INVALID_CURRENT_PASSWORD') {
        return res.status(400).json({ error: 'Senha atual inválida' });
      }
      if (error.message === 'USER_NOT_FOUND') {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      console.error('Erro ao alterar senha:', error);
      return res.status(500).json({
        error: 'Erro ao alterar senha',
        code: 'CHANGE_PASSWORD_ERROR',
      });
    }
  }
}
