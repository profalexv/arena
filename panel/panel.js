'use strict';
/**
 * render/panel/panel.js
 *
 * Monitor interno do ecossistema AXOM.
 * Expõe métricas de saúde dos servidores, clientes cadastrados,
 * assinaturas ativas e sessões Socket.IO por serviço.
 *
 * Variáveis de ambiente necessárias:
 *   PANEL_SECRET   — segredo compartilhado para autenticar o painel
 *   MOTOR_URL      — URL base do motor (default: https://aula-motor.fly.dev)
 */
const express      = require('express');
const path         = require('path');
const sessionStats = require('../shared/sessionStats');

const router = express.Router();

const MOTOR_URL    = process.env.MOTOR_URL    || 'https://aula-motor.fly.dev';
const PANEL_SECRET = process.env.PANEL_SECRET || '';

// ── Auth ──────────────────────────────────────────────────────
function panelAuth(req, res, next) {
    if (!PANEL_SECRET) return res.status(503).json({ error: 'PANEL_SECRET não configurado' });
    const secret = req.headers['x-panel-secret'] || req.query.secret;
    if (secret !== PANEL_SECRET) return res.status(401).json({ error: 'Não autorizado' });
    next();
}

// ── Fetch motor stats ─────────────────────────────────────────
async function fetchMotorStats() {
    try {
        const [healthRes, statsRes] = await Promise.all([
            fetch(`${MOTOR_URL}/health`,           { signal: AbortSignal.timeout(6000) }),
            fetch(`${MOTOR_URL}/api/panel/stats`,  {
                headers: { 'x-panel-secret': PANEL_SECRET },
                signal: AbortSignal.timeout(6000),
            }),
        ]);

        const health = healthRes.ok ? await healthRes.json() : { error: `HTTP ${healthRes.status}` };
        const stats  = statsRes.ok  ? await statsRes.json()  : { error: `HTTP ${statsRes.status}` };

        return { online: healthRes.ok, health, stats };
    } catch (err) {
        return { online: false, error: err.message, health: null, stats: null };
    }
}

// ── Serve UI ─────────────────────────────────────────────────
router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ── REST endpoint ─────────────────────────────────────────────
router.get('/stats', panelAuth, async (_req, res) => {
    try {
        const [motor, sessions] = await Promise.all([
            fetchMotorStats(),
            Promise.resolve(sessionStats.getAllStats()),
        ]);

        res.json({
            timestamp: new Date().toISOString(),
            render: { online: true },
            motor,
            sessions,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Socket.IO — push a cada 10 s ─────────────────────────────
function initializeSocket(nsp) {
    let pushInterval = null;

    async function buildPayload() {
        const [motor, sessions] = await Promise.all([
            fetchMotorStats(),
            Promise.resolve(sessionStats.getAllStats()),
        ]);
        return {
            timestamp: new Date().toISOString(),
            render: { online: true },
            motor,
            sessions,
        };
    }

    nsp.on('connection', async (socket) => {
        // Envia imediatamente ao conectar
        try { socket.emit('stats', await buildPayload()); } catch (_) { /* ignore */ }

        // Inicia intervalo de push se ainda não existe
        if (!pushInterval) {
            pushInterval = setInterval(async () => {
                if (nsp.sockets.size === 0) return;
                try { nsp.emit('stats', await buildPayload()); } catch (_) { /* ignore */ }
            }, 10_000);
        }

        socket.on('disconnect', () => {
            if (nsp.sockets.size === 0 && pushInterval) {
                clearInterval(pushInterval);
                pushInterval = null;
            }
        });
    });
}

module.exports = { router, initializeSocket };

