import { Request, Response, NextFunction } from 'express';
import xss from 'xss';

/**
 * Middleware de sanitização para prevenir XSS (Cross-Site Scripting)
 * Limpa recursivamente todos os inputs do usuário
 */

const xssOptions = {
  whiteList: {}, // Remove todas as tags HTML
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'style'],
};

/**
 * Sanitiza um valor recursivamente
 */
function sanitizeValue(value: any): any {
  if (typeof value === 'string') {
    // Remove tags HTML e scripts maliciosos
    return xss(value, xssOptions).trim();
  }
  
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  
  if (value !== null && typeof value === 'object') {
    const sanitized: any = {};
    for (const key in value) {
      if (value.hasOwnProperty(key)) {
        sanitized[key] = sanitizeValue(value[key]);
      }
    }
    return sanitized;
  }
  
  return value;
}

/**
 * Middleware para sanitizar body, query e params
 */
export const sanitizeInput = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    // Sanitiza body
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeValue(req.body);
    }
    
    // Sanitiza query params
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeValue(req.query);
    }
    
    // Sanitiza route params
    if (req.params && typeof req.params === 'object') {
      req.params = sanitizeValue(req.params);
    }
    
    next();
  } catch (error) {
    console.error('Erro na sanitização:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao processar dados da requisição',
    });
  }
};

/**
 * Valida e sanitiza email
 */
export function sanitizeEmail(email: string): string {
  return email.toLowerCase().trim().replace(/[^\w@.-]/g, '');
}

/**
 * Valida e sanitiza nome
 */
export function sanitizeName(name: string): string {
  return xss(name, xssOptions)
    .trim()
    .replace(/\s+/g, ' ') // Remove espaços extras
    .substring(0, 100); // Limita tamanho
}

/**
 * Sanitiza texto longo (descrições, comentários)
 */
export function sanitizeText(text: string): string {
  return xss(text, xssOptions)
    .trim()
    .substring(0, 5000); // Limita tamanho
}
