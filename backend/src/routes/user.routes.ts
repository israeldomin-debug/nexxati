import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { UserController } from '../controllers/user.controller';
import { authenticateToken, createResourceLimiter, requireAdmin, requireDeletePassword } from '../middlewares';
import { upload } from '../middlewares/upload';

const router = Router();
const userController = new UserController();

const requireSelfOrUserAccess = async (req: Request, res: Response, next: NextFunction) => {
  const currentUser = req.user;

  if (!currentUser) {
    return res.status(401).json({
      error: 'Usuário não autenticado',
      code: 'NOT_AUTHENTICATED',
    });
  }

  if (currentUser.userId === req.params.id) return next();

  return requireAdmin(req, res, next);
};

router.use(authenticateToken);

router.get('/', requireAdmin, userController.list.bind(userController));
router.post('/import', requireAdmin, createResourceLimiter, userController.import.bind(userController));
router.post('/:id/avatar', requireSelfOrUserAccess, upload.single('file'), userController.uploadAvatar.bind(userController));
router.patch('/:id/avatar/preset', requireSelfOrUserAccess, userController.selectAvatar.bind(userController));
router.patch('/:id/preferences', requireSelfOrUserAccess, userController.updatePreferences.bind(userController));
router.get('/:id', requireSelfOrUserAccess, userController.findById.bind(userController));
router.post('/', requireAdmin, createResourceLimiter, userController.create.bind(userController));
router.patch('/:id', requireAdmin, userController.update.bind(userController));
router.post('/:id/reset-password', requireAdmin, createResourceLimiter, userController.resetPassword.bind(userController));
router.delete('/:id', requireAdmin, requireDeletePassword, userController.delete.bind(userController));

export default router;
