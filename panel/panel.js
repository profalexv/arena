'use strict';
/**
 * render/panel/panel.js
 *
 * Monitor interno do ecossistema AXOM — servido integralmente pelo render.
 * Consulta o Supabase diretamente para métricas de clientes/assinaturas.
 * Monitora a saúde dos servidores motor (Fly.io) e render (self).
 * Publica métricas via Socket.IO a cada 10 s para a UI.
 *
 * Variáveis de ambiente necessárias no render.com:
 *   PANEL_SECRET      — segredo para autenticar o painel
 *   SUPABASE_URL      — já usada por outros módulos
 *   SUPABASE_SERVICE_KEY — já usada por outros módulos
 *   MOTOR_URL         — URL base do motor (default: https://aula-motor.fly.dev)
 */
const express      = require('express');
const path         = require('path');
const sessionStats = require('../shared/sessionStats');
const supabase     = require('../shared/supabaseMain');

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

// ── Supabase stats ────────────────────────────────────────────
async function fetchClientStats() {
    if (!supabase) return { error: 'Supabase não configurado' };

    const now = new Date().toISOString();

    const [schools, allSubs, activeSubs] = await Promise.all([
        supabase.from('schools').select('id', { count: 'exact', head: true }),
        supabase.from('subscriptions').select('plan_id, status'),
        supabase.from('subscriptions')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'active')
            .gt('expires_at', now),
    ]);

    const planBreakdown = {};
    (allSubs.data || []).forEach(s => {
        planBreakdown[s.plan_id] = (planBreakdown[s.plan_id] || 0) + 1;
    });

    return {
        totalSchools:        schools.count    ?? 0,
        activeSubscriptions: activeSubs.count ?? 0,
        planBreakdown,
    };
}

// ── Motor health check ────────────────────────────────────────
async function fetchMotorHealth() {
    try {
        const res = await fetch(`${MOTOR_URL}/health`, { signal: AbortSignal.timeout(6000) });
        const body = res.ok ? await res.json() : { error: `HTTP ${res.status}` };
        return { online: res.ok, health: body };
    } catch (err) {
        return { online: false, error: err.message };
    }
}

// ── Build full payload ────────────────────────────────────────
async function buildPayload() {
    const [clientStats, motorHealth] = await Promise.all([
        fetchClientStats(),
        fetchMotorHealth(),
    ]);

    return {
        timestamp: new Date().toISOString(),
        render:    { online: true, uptime: process.uptime() },
        motor:     motorHealth,
        clients:   clientStats,
        sessions:  sessionStats.getAllStats(),
    };
}

// ── Serve UI ─────────────────────────────────────────────────
router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
router.get('/style.css', (req, res) => {
    res.sendFile(path.join(__dirname, 'style.css'));
});

// ── REST endpoint ─────────────────────────────────────────────
router.get('/stats', panelAuth, async (_req, res) => {
    try {
        res.json(await buildPayload());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Socket.IO — push a cada 10 s ─────────────────────────────
function initializeSocket(nsp) {
    let pushInterval = null;

    nsp.on('connection', async (socket) => {
        try { socket.emit('stats', await buildPayload()); } catch (_) { /* ignore */ }

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


