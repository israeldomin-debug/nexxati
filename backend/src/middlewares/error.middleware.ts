import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { maxUploadFileSize } from './upload';

/**
 * Middleware global de tratamento de erros
 * Deve ser o último middleware registrado
 */
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('Erro capturado:', error);

  // Erro de validação Zod
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: 'Erro de validação',
      code: 'VALIDATION_ERROR',
      details: error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      })),
    });
  }

  // Erro genérico
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: `Arquivo muito grande. Envie arquivos de até ${Math.round(maxUploadFileSize / 1024 / 1024)} MB.`,
        code: 'FILE_TOO_LARGE',
      });
    }

    return res.status(400).json({
      error: 'Não foi possível processar o arquivo enviado.',
      code: error.code,
    });
  }

  return res.status(500).json({
    error: 'Erro interno do servidor',
    code: 'INTERNAL_SERVER_ERROR',
    message: process.env.NODE_ENV === 'development' ? error.message : undefined,
  });
};

/**
 * Middleware para rotas não encontradas
 */
export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    error: 'Rota não encontrada',
    code: 'ROUTE_NOT_FOUND',
    path: req.path,
    method: req.method,
  });
};
