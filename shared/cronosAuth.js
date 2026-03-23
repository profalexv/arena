'use strict';
/**
 * shared/cronosAuth.js
 *
 * Middleware Express que verifica se o usuário (school_admin) tem acesso
 * ao Cronos cloud (plano Syllabus: plus_premium ou pro_premium).
 *
 * Chama o motor (Fly.io) — endpoint POST /api/cronos/verify-access.
 * Em caso de sucesso, adiciona req.cronosUser = { userId, schoolId, role }.
 *
 * Variável de ambiente necessária:
 *   MOTOR_URL — ex: https://aula-motor.fly.dev
 */

const MOTOR_URL = process.env.MOTOR_URL || 'https://aula-motor.fly.dev';

async function cronosAuthMiddleware(req, res, next) {
    const header = req.headers['authorization'] || '';
    if (!header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token não fornecido.' });
    }

    try {
        const response = await fetch(`${MOTOR_URL}/api/cronos/verify-access`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': header,
            },
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({ error: data.reason || data.error || 'Erro de autenticação.' });
        }

        if (!data.hasAccess) {
            return res.status(403).json({
                error: data.reason || 'Plano Syllabus necessário para usar o Cronos na nuvem.',
                upgradeUrl: 'https://axom.app/#plans',
            });
        }

        req.cronosUser = {
            userId:   data.userId,
            schoolId: data.schoolId,
            role:     data.role,
        };

        next();
    } catch (err) {
        console.error('[cronosAuth] Erro ao verificar acesso:', err.message);
        return res.status(503).json({ error: 'Serviço de autenticação indisponível. Tente novamente.' });
    }
}

module.exports = cronosAuthMiddleware;
