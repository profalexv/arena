'use strict';
/**
 * render/cronos/cronos.js (PROXY)
 *
 * Repassa comandos de CRUD para a nuvem principal do Motor via Fetch HTTP.
 * Arena perde acesso total ao BD e vira apenas Proxy Bouncer.
 */

const { Router } = require('express');
const router = Router();
const MOTOR_URL = process.env.LOGIN_URL || process.env.MOTOR_URL || 'https://axom.fly.dev';

router.all('/schedules*', async (req, res) => {
    try {
        // Envia req.url ex: /schedules ou /schedules/1234
        const proxyUrl = `${MOTOR_URL}/api/cronos${req.url}`;
        
        const response = await fetch(proxyUrl, {
            method: req.method,
            headers: {
                'Content-Type': 'application/json',
                // Repassa o token para o Motor validar
                'Authorization': req.headers.authorization || ''
            },
            body: ['GET', 'HEAD', 'DELETE'].includes(req.method) ? undefined : JSON.stringify(req.body)
        });
        
        const data = await response.json().catch(() => ({}));
        return res.status(response.status).json(data);
        
    } catch (err) {
        console.error('[cronos-proxy] Erro ao contatar MOTOR:', err.message);
        return res.status(503).json({ error: 'Serviço de nuvem (MOTOR) indisponível.' });
    }
});

module.exports = { router };
