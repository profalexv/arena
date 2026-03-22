'use strict';
/**
 * shared/quizAuth.js
 *
 * Middleware Express que verifica se o usuário tem acesso ao Quiz Premium.
 * Chama o motor (Fly.io) — endpoint /api/quiz-auth/verify-access.
 *
 * Em caso de sucesso, adiciona req.quizUser = { userId, email, role, hasAccess }.
 * Em caso de falha, responde 401 ou 403.
 *
 * Variável de ambiente necessária:
 *   MOTOR_URL — ex: https://aula-motor.fly.dev
 */

const MOTOR_URL = process.env.MOTOR_URL || 'https://aula-motor.fly.dev';

async function quizAuthMiddleware(req, res, next) {
  const header = req.headers['authorization'] || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido.' });
  }

  try {
    const response = await fetch(`${MOTOR_URL}/api/quiz-auth/verify-access`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': header,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.reason || 'Erro de autenticação.' });
    }

    if (!data.hasAccess) {
      return res.status(403).json({
        error: data.reason || 'Acesso premium necessário.',
        upgradeUrl: 'https://axom.app/#quiz-premium',
      });
    }

    req.quizUser = {
      userId:   data.userId,
      email:    data.email,
      role:     data.role,
      schoolId: data.schoolId || null,
    };

    next();
  } catch (err) {
    console.error('[quizAuth] Erro ao verificar acesso:', err.message);
    return res.status(503).json({ error: 'Serviço de autenticação indisponível. Tente novamente.' });
  }
}

module.exports = quizAuthMiddleware;
