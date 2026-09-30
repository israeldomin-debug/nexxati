import { PrismaClient, UserPermission } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import { randomBytes } from 'crypto';
import { deleteFile, reuseIdenticalUpload } from '../middlewares/upload';
import { AuditService } from './audit.service';

const prisma = new PrismaClient();
const auditService = new AuditService();
const usernameSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,50}$/, 'Usuário inválido');
const permissionSchema = z.nativeEnum(UserPermission);
const themePreferenceSchema = z.enum(['controlall', 'burgundy', 'black-red', 'blue-orange', 'teal-gold', 'violet-pink']);
const appearanceModeSchema = z.enum(['LIGHT', 'DARK', 'SYSTEM']);

const defaultUserPermissions: UserPermission[] = [
  UserPermission.ACCESS_DASHBOARD,
  UserPermission.ACCESS_TICKETS,
];

export const createUserSchema = z.object({
  name: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  username: usernameSchema,
  email: z.string().email('Email inválido').transform((value) => value.toLowerCase()),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  role: z.enum(['USER', 'ATTENDANT', 'ADMIN']).default('USER'),
  active: z.boolean().optional(),
  mustChangePassword: z.boolean().default(false),
  permissions: z.array(permissionSchema).default([]),
});

export const updateUserSchema = z.object({
  name: z.string().min(3).optional(),
  username: usernameSchema.optional(),
  email: z.string().email().transform((value) => value.toLowerCase()).optional(),
  password: z.string().min(6).optional(),
  role: z.enum(['USER', 'ATTENDANT', 'ADMIN']).optional(),
  active: z.boolean().optional(),
  mustChangePassword: z.boolean().optional(),
  permissions: z.array(permissionSchema).optional(),
});

export const importUsersSchema = z.object({
  users: z.array(z.object({
    name: z.string().trim().min(3, 'Nome completo deve ter no mínimo 3 caracteres'),
    username: usernameSchema,
    email: z.string().trim().email('E-mail inválido').transform((value) => value.toLowerCase()),
    password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  })).min(1, 'Informe pelo menos um usuário').max(500, 'Importe no máximo 500 usuários por vez'),
  mustChangePassword: z.boolean().default(true),
});

const userSelect = {
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
  updatedAt: true,
  permissions: {
    select: { permission: true },
  },
} as const;

const normalizeUser = <T extends { permissions?: Array<{ permission: UserPermission }> }>(user: T) => ({
  ...user,
  permissions: user.permissions?.map((item) => item.permission) || [],
});

const generateTemporaryPassword = () => `NEXXATI@${randomBytes(4).toString('hex')}!`;

export class UserService {
  async findAll() {
    const users = await prisma.user.findMany({
      select: userSelect,
      orderBy: { name: 'asc' },
    });
    return users.map(normalizeUser);
  }

  async findById(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: userSelect,
    });

    if (!user) throw new Error('Usuário não encontrado');
    return normalizeUser(user);
  }

  async create(data: z.infer<typeof createUserSchema>) {
    const validated = createUserSchema.parse(data);

    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ email: validated.email }, { username: validated.username }] },
    });

    if (existingUser) {
      throw new Error(existingUser.email === validated.email ? 'Email já está em uso' : 'Nome de usuário já está em uso');
    }

    const hashedPassword = await bcrypt.hash(validated.password, 10);

    const user = await prisma.user.create({
      data: {
        name: validated.name,
        username: validated.username,
        email: validated.email,
        passwordHash: hashedPassword,
        role: validated.role,
        active: validated.active ?? true,
        mustChangePassword: validated.mustChangePassword,
        permissions: {
          create: validated.permissions.map((permission) => ({ permission })),
        },
      },
      select: userSelect,
    });
    return normalizeUser(user);
  }

  async importUsers(data: z.infer<typeof importUsersSchema>) {
    const validated = importUsersSchema.parse(data);
    const created: Array<{ id: string; name: string; username: string | null; email: string }> = [];
    const skipped: Array<{ row: number; identifier: string; reason: string }> = [];

    for (const [index, item] of validated.users.entries()) {
      const row = index + 2;
      const identifier = `${item.name} / ${item.username} / ${item.email}`;

      try {
        const existingUser = await prisma.user.findFirst({
          where: { OR: [{ email: item.email }, { username: item.username }] },
          select: { email: true, username: true },
        });

        if (existingUser) {
          skipped.push({
            row,
            identifier,
            reason: existingUser.email === item.email ? 'E-mail já cadastrado' : 'Nome de usuário já cadastrado',
          });
          continue;
        }

        const passwordHash = await bcrypt.hash(item.password, 10);
        const user = await prisma.user.create({
          data: {
            name: item.name,
            username: item.username,
            email: item.email,
            passwordHash,
            role: 'USER',
            active: true,
            mustChangePassword: validated.mustChangePassword,
            permissions: {
              create: defaultUserPermissions.map((permission) => ({ permission })),
            },
          },
          select: { id: true, name: true, username: true, email: true },
        });

        created.push(user);
      } catch (error: any) {
        skipped.push({ row, identifier, reason: error.message || 'Erro ao importar usuário' });
      }
    }

    return {
      created,
      skipped,
      total: validated.users.length,
      createdCount: created.length,
      skippedCount: skipped.length,
    };
  }

  async update(id: string, data: z.infer<typeof updateUserSchema>) {
    const validated = updateUserSchema.parse(data);

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new Error('Usuário não encontrado');

    if (
      (validated.email && validated.email !== user.email) ||
      (validated.username && validated.username !== user.username)
    ) {
      const existingUser = await prisma.user.findFirst({
        where: {
          id: { not: id },
          OR: [
            ...(validated.email ? [{ email: validated.email }] : []),
            ...(validated.username ? [{ username: validated.username }] : []),
          ],
        },
      });

      if (existingUser) {
        throw new Error(existingUser.email === validated.email ? 'Email já está em uso' : 'Nome de usuário já está em uso');
      }
    }

    const updateData: any = {};
    if (validated.name) updateData.name = validated.name;
    if (validated.username) updateData.username = validated.username;
    if (validated.email) updateData.email = validated.email;
    if (validated.role) updateData.role = validated.role;
    if (validated.active !== undefined) updateData.active = validated.active;
    if (validated.mustChangePassword !== undefined) updateData.mustChangePassword = validated.mustChangePassword;
    if (validated.password) updateData.passwordHash = await bcrypt.hash(validated.password, 10);
    if (validated.permissions) {
      updateData.permissions = {
        deleteMany: {},
        create: validated.permissions.map((permission) => ({ permission })),
      };
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
      select: userSelect,
    });
    return normalizeUser(updated);
  }

  async resetPassword(id: string, performedById?: string | null) {
    const current = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, active: true },
    });
    if (!current) throw new Error('Usuário não encontrado');
    if (!current.active) throw new Error('Usuário inativo');

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);

    const user = await prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: true,
        passwordResetHandledAt: new Date(),
      },
      select: userSelect,
    });

    await auditService.record({
      action: 'PASSWORD_RESET',
      resourceType: 'user',
      resourceId: id,
      resourceName: current.name || current.email,
      changedFields: ['passwordHash', 'mustChangePassword', 'passwordResetHandledAt'],
      details: { resetByAdmin: true },
      performedById: performedById || null,
    });

    return {
      user: normalizeUser(user),
      temporaryPassword,
    };
  }

  async updateAvatar(id: string, file: Express.Multer.File) {
    const current = await prisma.user.findUnique({ where: { id }, select: { id: true, avatarUrl: true } });
    if (!current) {
      deleteFile(file.filename);
      throw new Error('Usuário não encontrado');
    }
    if (file.size > 5 * 1024 * 1024) {
      deleteFile(file.filename);
      throw new Error('A foto deve ter no máximo 5 MB');
    }
    const extension = path.extname(file.originalname).toLowerCase();
    const header = fs.readFileSync(file.path).subarray(0, 12);
    const isJpeg = ['.jpg', '.jpeg'].includes(extension) && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    const isPng = extension === '.png' && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const isGif = extension === '.gif' && ['GIF87a', 'GIF89a'].includes(header.subarray(0, 6).toString('ascii'));
    if (!isJpeg && !isPng && !isGif) {
      deleteFile(file.filename);
      throw new Error('O arquivo não é uma imagem JPG, PNG ou GIF válida');
    }

    const avatarUrls = await prisma.user.findMany({ where: { avatarUrl: { not: null } }, select: { avatarUrl: true } });
    const filename = reuseIdenticalUpload(file, undefined, avatarUrls.map((item) => item.avatarUrl ? path.basename(item.avatarUrl) : '').filter(Boolean));
    const avatarUrl = `/uploads/${filename}`;
    const updated = await prisma.user.update({ where: { id }, data: { avatarUrl }, select: userSelect });

    if (current.avatarUrl?.startsWith('/uploads/') && current.avatarUrl !== avatarUrl) {
      const shared = await prisma.user.count({ where: { id: { not: id }, avatarUrl: current.avatarUrl } });
      if (!shared) deleteFile(path.basename(current.avatarUrl));
    }
    return normalizeUser(updated);
  }

  async selectAvatar(id: string, input: unknown) {
    const { preset } = z.object({ preset: z.enum(['ROBOT', 'EMO', 'NEXO', 'PULSE', 'BYTE']) }).parse(input);
    const current = await prisma.user.findUnique({ where: { id }, select: { id: true, avatarUrl: true } });
    if (!current) throw new Error('Usuário não encontrado');

    const presetUrls = {
      ROBOT: null,
      EMO: '/avatar-robo-emo.png',
      NEXO: '/avatar-robo-nexo.png',
      PULSE: '/avatar-robo-pulse.png',
      BYTE: '/avatar-robo-byte.png',
    } as const;
    const avatarUrl = presetUrls[preset];
    const updated = await prisma.user.update({ where: { id }, data: { avatarUrl }, select: userSelect });

    if (current.avatarUrl?.startsWith('/uploads/') && current.avatarUrl !== avatarUrl) {
      const shared = await prisma.user.count({ where: { id: { not: id }, avatarUrl: current.avatarUrl } });
      if (!shared) deleteFile(path.basename(current.avatarUrl));
    }
    return normalizeUser(updated);
  }

  async updatePreferences(id: string, input: unknown) {
    const data = z.object({ themePreference: themePreferenceSchema.optional(), appearanceMode: appearanceModeSchema.optional() })
      .refine((value) => value.themePreference !== undefined || value.appearanceMode !== undefined, 'Informe ao menos uma preferência')
      .parse(input);
    const current = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!current) throw new Error('Usuário não encontrado');
    const updated = await prisma.user.update({ where: { id }, data, select: userSelect });
    return normalizeUser(updated);
  }

  async delete(id: string) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new Error('Usuário não encontrado');
    await prisma.user.update({ where: { id }, data: { active: false } });
  }
}
