import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuditService } from './audit.service';

const prisma = new PrismaClient();
const auditService = new AuditService();
const usernameSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,50}$/, 'Usuário inválido');
const passwordRecoveryCode = process.env.PASSWORD_RECOVERY_CODE?.trim();

export const registerSchema = z.object({
  name: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  username: usernameSchema,
  email: z.string().email('Email inválido').transform((value) => value.toLowerCase()),
  password: z
    .string()
    .min(8, 'Senha deve ter no mínimo 8 caracteres')
    .regex(/[A-Z]/, 'Senha deve conter ao menos uma letra maiúscula')
    .regex(/[a-z]/, 'Senha deve conter ao menos uma letra minúscula')
    .regex(/[0-9]/, 'Senha deve conter ao menos um número')
    .regex(/[^A-Za-z0-9]/, 'Senha deve conter ao menos um caractere especial'),
  role: z.enum(['USER', 'ATTENDANT', 'ADMIN']).optional(),
});

export const loginSchema = z.object({
  login: z.string().trim().min(1, 'Usuário ou e-mail é obrigatório').optional(),
  email: z.string().trim().min(1).optional(),
  password: z.string().min(1, 'Senha é obrigatória'),
}).refine((value) => value.login || value.email, {
  message: 'Usuário ou e-mail é obrigatório',
  path: ['login'],
});

export const forgotPasswordSchema = z.object({
  login: z.string().trim().min(1, 'Usuário ou e-mail é obrigatório').max(255, 'Usuário ou e-mail muito longo'),
});

export const resetPasswordWithCodeSchema = z.object({
  login: z.string().trim().min(1, 'Usuário ou e-mail é obrigatório').max(255, 'Usuário ou e-mail muito longo'),
  recoveryCode: z.string().trim().min(1, 'Código de recuperação é obrigatório'),
  newPassword: z.string().min(6, 'Nova senha deve ter no mínimo 6 caracteres'),
  confirmPassword: z.string().min(6, 'Confirmação de senha deve ter no mínimo 6 caracteres'),
}).refine((value) => value.newPassword === value.confirmPassword, {
  message: 'A confirmação não confere com a nova senha',
  path: ['confirmPassword'],
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Senha atual é obrigatória'),
  newPassword: z.string().min(6, 'Nova senha deve ter no mínimo 6 caracteres'),
  confirmPassword: z.string().min(6, 'Confirmação de senha deve ter no mínimo 6 caracteres'),
}).refine((value) => value.newPassword === value.confirmPassword, {
  message: 'A confirmação não confere com a nova senha',
  path: ['confirmPassword'],
}).refine((value) => value.currentPassword !== value.newPassword, {
  message: 'A nova senha precisa ser diferente da senha atual',
  path: ['newPassword'],
});

const normalizeUser = (user: any) => ({
  id: user.id,
  name: user.name,
  username: user.username,
  email: user.email,
  role: user.role,
  active: user.active,
  mustChangePassword: user.mustChangePassword,
  passwordResetRequestedAt: user.passwordResetRequestedAt,
  passwordResetHandledAt: user.passwordResetHandledAt,
  avatarUrl: user.avatarUrl,
  themePreference: user.themePreference,
  appearanceMode: user.appearanceMode,
  permissions: user.permissions?.map((item: any) => item.permission) || [],
});

export class AuthService {
  async register(data: z.infer<typeof registerSchema>) {
    const validated = registerSchema.parse(data);

    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ email: validated.email }, { username: validated.username }] },
    });

    if (existingUser) {
      throw new Error(existingUser.email === validated.email ? 'EMAIL_ALREADY_EXISTS' : 'USERNAME_ALREADY_EXISTS');
    }

    const passwordHash = await bcrypt.hash(validated.password, 12);

    return prisma.user.create({
      data: {
        name: validated.name,
        username: validated.username,
        email: validated.email,
        passwordHash,
        role: validated.role || 'USER',
      },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        active: true,
        mustChangePassword: true,
        avatarUrl: true,
        themePreference: true,
        appearanceMode: true,
        createdAt: true,
      },
    });
  }

  async login(data: z.infer<typeof loginSchema>) {
    const validated = loginSchema.parse(data);
    const identifier = (validated.login || validated.email || '').trim().toLowerCase();

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { username: identifier },
        ],
      },
      include: {
        permissions: {
          select: { permission: true },
        },
      },
    });

    if (!user) throw new Error('INVALID_CREDENTIALS');
    if (!user.active) throw new Error('USER_INACTIVE');

    const isPasswordValid = await bcrypt.compare(validated.password, user.passwordHash);
    if (!isPasswordValid) throw new Error('INVALID_CREDENTIALS');

    const token = this.generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      user: normalizeUser(user),
      token,
    };
  }

  async forgotPassword(data: z.infer<typeof forgotPasswordSchema>) {
    const { login } = forgotPasswordSchema.parse(data);
    const identifier = login.trim().toLowerCase();

    const user = await prisma.user.findFirst({
      where: {
        active: true,
        OR: [
          { email: identifier },
          { username: identifier },
        ],
      },
      select: { id: true },
    });

    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetRequestedAt: new Date(),
          passwordResetHandledAt: null,
        },
      });
    }

    return {
      message: 'Se o usuário existir e estiver ativo, o pedido de recuperação foi enviado ao administrador.',
    };
  }

  async resetPasswordWithCode(data: z.infer<typeof resetPasswordWithCodeSchema>) {
    const validated = resetPasswordWithCodeSchema.parse(data);
    const identifier = validated.login.trim().toLowerCase();

    if (!passwordRecoveryCode || validated.recoveryCode.trim() !== passwordRecoveryCode) {
      throw new Error('INVALID_RECOVERY_CODE_OR_USER');
    }

    const user = await prisma.user.findFirst({
      where: {
        active: true,
        OR: [
          { email: identifier },
          { username: identifier },
        ],
      },
      include: {
        permissions: {
          select: { permission: true },
        },
      },
    });

    if (!user) throw new Error('INVALID_RECOVERY_CODE_OR_USER');

    const passwordHash = await bcrypt.hash(validated.newPassword, 10);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        passwordResetHandledAt: new Date(),
      },
      include: {
        permissions: {
          select: { permission: true },
        },
      },
    });

    await auditService.record({
      action: 'PASSWORD_RECOVERY_CODE',
      resourceType: 'user',
      resourceId: user.id,
      resourceName: user.name || user.email,
      changedFields: ['passwordHash', 'mustChangePassword', 'passwordResetHandledAt'],
      details: { recoveryCodeUsed: true },
      performedById: null,
    });

    return {
      message: 'Senha redefinida com sucesso. Entre usando a nova senha.',
      user: normalizeUser(updated),
    };
  }

  async changePassword(userId: string, data: z.infer<typeof changePasswordSchema>) {
    const validated = changePasswordSchema.parse(data);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { permissions: { select: { permission: true } } },
    });

    if (!user) throw new Error('USER_NOT_FOUND');

    const isPasswordValid = await bcrypt.compare(validated.currentPassword, user.passwordHash);
    if (!isPasswordValid) throw new Error('INVALID_CURRENT_PASSWORD');

    const passwordHash = await bcrypt.hash(validated.newPassword, 10);
    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePassword: false,
      },
      include: { permissions: { select: { permission: true } } },
    });

    return normalizeUser(updated);
  }

  private generateToken(payload: {
    userId: string;
    email: string;
    role: string;
  }) {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET não configurado');

    return jwt.sign(payload, secret, {
      expiresIn: (process.env.JWT_EXPIRES_IN || '12h') as SignOptions['expiresIn'],
      issuer: 'idl-ativos',
      subject: payload.userId,
    });
  }

  verifyToken(token: string) {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET não configurado');
    return jwt.verify(token, secret);
  }
}
