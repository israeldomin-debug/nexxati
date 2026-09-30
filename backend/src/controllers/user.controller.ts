import { Request, Response } from 'express';
import { UserService } from '../services/user.service';

const userService = new UserService();

export class UserController {
  async selectAvatar(req: Request, res: Response) {
    try {
      const user = await userService.selectAvatar(req.params.id, req.body);
      return res.json({ user });
    } catch (error: any) {
      console.error('Erro ao selecionar avatar do usuário:', error);
      if (error.message === 'Usuário não encontrado') return res.status(404).json({ error: error.message });
      if (error.name === 'ZodError') return res.status(400).json({ error: 'Avatar inválido' });
      return res.status(400).json({ error: error.message || 'Não foi possível alterar o avatar' });
    }
  }

  async uploadAvatar(req: Request, res: Response) {
    try {
      if (!req.file) return res.status(400).json({ error: 'Selecione uma foto JPG, PNG ou GIF' });
      const user = await userService.updateAvatar(req.params.id, req.file);
      return res.json({ user });
    } catch (error: any) {
      console.error('Erro ao atualizar foto do usuário:', error);
      if (error.message === 'Usuário não encontrado') return res.status(404).json({ error: error.message });
      return res.status(400).json({ error: error.message || 'Não foi possível atualizar a foto' });
    }
  }

  async updatePreferences(req: Request, res: Response) {
    try {
      const user = await userService.updatePreferences(req.params.id, req.body);
      return res.json({ user });
    } catch (error: any) {
      console.error('Erro ao atualizar preferências do usuário:', error);
      if (error.message === 'Usuário não encontrado') return res.status(404).json({ error: error.message });
      if (error.name === 'ZodError') return res.status(400).json({ error: 'Tema inválido' });
      return res.status(400).json({ error: error.message || 'Não foi possível atualizar as preferências' });
    }
  }


  async list(_req: Request, res: Response) {
    try {
      const users = await userService.findAll();
      return res.json({ users });
    } catch (error) {
      console.error('Erro ao listar usuários:', error);
      return res.status(500).json({ error: 'Erro ao listar usuários' });
    }
  }

  async findById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const user = await userService.findById(id);
      return res.json({ user });
    } catch (error: any) {
      console.error('Erro ao buscar usuário:', error);
      if (error.message === 'Usuário não encontrado') {
        return res.status(404).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Erro ao buscar usuário' });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const user = await userService.create(req.body);
      return res.status(201).json({ user });
    } catch (error: any) {
      console.error('Erro ao criar usuário:', error);
      if (error.message.includes('já está em uso')) {
        return res.status(400).json({ error: error.message });
      }
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: 'Dados inválidos', details: error.errors });
      }
      return res.status(500).json({ error: 'Erro ao criar usuário' });
    }
  }

  async import(req: Request, res: Response) {
    try {
      const result = await userService.importUsers(req.body);
      return res.status(201).json(result);
    } catch (error: any) {
      console.error('Erro ao importar usuários:', error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: 'Dados inválidos', details: error.errors });
      }
      return res.status(500).json({ error: 'Erro ao importar usuários' });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const user = await userService.update(id, req.body);
      return res.json({ user });
    } catch (error: any) {
      console.error('Erro ao atualizar usuário:', error);
      if (error.message === 'Usuário não encontrado') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('já está em uso')) {
        return res.status(400).json({ error: error.message });
      }
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: 'Dados inválidos', details: error.errors });
      }
      return res.status(500).json({ error: 'Erro ao atualizar usuário' });
    }
  }

  async resetPassword(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const performedById = req.user?.id || req.user?.userId || null;
      const result = await userService.resetPassword(id, performedById);
      return res.json({
        message: 'Senha provisória gerada com sucesso',
        ...result,
      });
    } catch (error: any) {
      console.error('Erro ao redefinir senha do usuário:', error);
      if (error.message === 'Usuário não encontrado') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message === 'Usuário inativo') {
        return res.status(400).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Erro ao redefinir senha do usuário' });
    }
  }

  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { id: currentUserId } = req.user!;

      if (id === currentUserId) {
        return res.status(400).json({ error: 'Você não pode deletar seu próprio usuário' });
      }

      await userService.delete(id);
      return res.json({ message: 'Usuário deletado com sucesso' });
    } catch (error: any) {
      console.error('Erro ao deletar usuário:', error);
      if (error.message === 'Usuário não encontrado') {
        return res.status(404).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Erro ao deletar usuário' });
    }
  }
}
