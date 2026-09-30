import rateLimit from 'express-rate-limit';

const toNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: toNumber(process.env.RATE_LIMIT_GLOBAL_MAX, 3000),
  message: {
    error: 'Muitas requisições. Tente novamente mais tarde',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: toNumber(process.env.RATE_LIMIT_LOGIN_MAX, 20),
  message: {
    error: 'Muitas tentativas de login. Tente novamente em 15 minutos',
    code: 'LOGIN_RATE_LIMIT_EXCEEDED',
  },
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
});

export const createResourceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: toNumber(process.env.RATE_LIMIT_CREATE_MAX, 300),
  message: {
    error: 'Muitas criações/alterações em pouco tempo. Aguarde um momento',
    code: 'CREATE_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
