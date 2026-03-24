'use strict';
/**
 * shared/sessionStats.js
 *
 * Rastreia sessões Socket.IO por namespace em memória.
 * Os contadores resetam a cada deploy (comportamento esperado — monitor ao vivo).
 *
 * Uso:
 *   sessionStats.hookNamespace(nsp, 'rush');   → chamado em server.js
 *   sessionStats.getAllStats();                  → lido por panel/panel.js
 */

const stats = {};   // { [namespace]: { active: number, sessions: [{start, end}] } }

function getOrCreate(name) {
    if (!stats[name]) {
        stats[name] = { active: 0, sessions: [] };
    }
    return stats[name];
}

/** Conecta ao namespace e rastreia connect/disconnect */
function hookNamespace(nsp, name) {
    nsp.on('connection', (socket) => {
        const ns = getOrCreate(name);
        ns.active++;
        const session = { start: new Date(), end: null };
        ns.sessions.push(session);

        socket.on('disconnect', () => {
            ns.active = Math.max(0, ns.active - 1);
            session.end = new Date();
        });
    });
}

/** Retorna métricas de um namespace */
function getStats(name) {
    const ns = stats[name];
    if (!ns) return { active: 0, today: 0, week: 0, total: 0 };

    const now       = new Date();
    const dayStart  = new Date(now); dayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay()); weekStart.setHours(0, 0, 0, 0);
    const weekAgo   = new Date(now - 7 * 24 * 60 * 60 * 1000);

    // Descarta sessões com mais de 7 dias para não acumular memória
    ns.sessions = ns.sessions.filter(s => s.start >= weekAgo);

    return {
        active: ns.active,
        today:  ns.sessions.filter(s => s.start >= dayStart).length,
        week:   ns.sessions.filter(s => s.start >= weekStart).length,
        total:  ns.sessions.length,
    };
}

/** Retorna métricas de todos os namespaces rastreados */
function getAllStats() {
    return Object.keys(stats).reduce((acc, name) => {
        acc[name] = getStats(name);
        return acc;
    }, {});
}

module.exports = { hookNamespace, getStats, getAllStats };
