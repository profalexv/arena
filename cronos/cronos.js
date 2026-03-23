'use strict';
/**
 * render/cronos/cronos.js
 *
 * CRUD de programações salvas do Cronos (cronômetro escolar).
 * Requer autenticação via JWT do motor + plano Syllabus (lessonPlans).
 *
 * Rotas (montadas pelo server.js em /cronos):
 *   GET    /schedules        — lista programações da escola
 *   POST   /schedules        — salva nova programação
 *   GET    /schedules/:id    — carrega uma programação
 *   PUT    /schedules/:id    — atualiza nome/data
 *   DELETE /schedules/:id    — exclui
 */

const { Router } = require('express');
const cronosAuth = require('../shared/cronosAuth');
const supabase = require('../shared/supabaseMain');

const router = Router();
const MAX_SCHEDULES = 50;

// Todos os endpoints exigem autenticação + plano Syllabus
router.use(cronosAuth);

// Verifica se o Supabase está configurado
router.use((_req, res, next) => {
    if (!supabase) {
        return res.status(503).json({ error: 'Serviço de nuvem indisponível (banco não configurado).' });
    }
    next();
});

/* GET /schedules
 * Lista programações da escola autenticada. */
router.get('/schedules', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('cronos_schedules')
            .select('id, name, created_at, updated_at')
            .eq('school_id', req.cronosUser.schoolId)
            .order('updated_at', { ascending: false })
            .limit(MAX_SCHEDULES);

        if (error) throw error;
        res.json({ success: true, data });
    } catch (err) {
        console.error('[cronos] list:', err.message);
        res.status(500).json({ error: 'Erro ao buscar programações.' });
    }
});

/* POST /schedules
 * Salva nova programação. Body: { name, data } */
router.post('/schedules', async (req, res) => {
    const { name, data } = req.body || {};

    if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 200) {
        return res.status(400).json({ error: 'Nome inválido (1–200 caracteres).' });
    }
    if (!data || typeof data !== 'object') {
        return res.status(400).json({ error: 'Dados da programação inválidos.' });
    }

    const schoolId = req.cronosUser.schoolId;

    try {
        // Verifica limite
        const { count } = await supabase
            .from('cronos_schedules')
            .select('id', { count: 'exact', head: true })
            .eq('school_id', schoolId);

        if (count >= MAX_SCHEDULES) {
            return res.status(422).json({
                error: `Limite de ${MAX_SCHEDULES} programações atingido. Exclua algumas para continuar.`,
            });
        }

        const { data: row, error } = await supabase
            .from('cronos_schedules')
            .insert({
                school_id:  schoolId,
                created_by: req.cronosUser.userId || null,
                name:       name.trim(),
                data,
            })
            .select('id, name, created_at, updated_at')
            .single();

        if (error) throw error;
        res.status(201).json({ success: true, data: row });
    } catch (err) {
        console.error('[cronos] create:', err.message);
        res.status(500).json({ error: 'Erro ao salvar programação.' });
    }
});

/* GET /schedules/:id
 * Carrega uma programação completa. */
router.get('/schedules/:id', async (req, res) => {
    const { id } = req.params;
    if (!/^[0-9a-f-]{36}$/.test(id)) return res.status(400).json({ error: 'ID inválido.' });

    try {
        const { data, error } = await supabase
            .from('cronos_schedules')
            .select('*')
            .eq('id', id)
            .eq('school_id', req.cronosUser.schoolId)
            .single();

        if (error || !data) return res.status(404).json({ error: 'Programação não encontrada.' });
        res.json({ success: true, data });
    } catch (err) {
        console.error('[cronos] get:', err.message);
        res.status(500).json({ error: 'Erro ao carregar programação.' });
    }
});

/* PUT /schedules/:id
 * Atualiza nome e/ou dados. Body: { name?, data? } */
router.put('/schedules/:id', async (req, res) => {
    const { id } = req.params;
    if (!/^[0-9a-f-]{36}$/.test(id)) return res.status(400).json({ error: 'ID inválido.' });

    const updates = {};
    if (req.body?.name !== undefined) {
        const name = String(req.body.name).trim();
        if (!name || name.length > 200) return res.status(400).json({ error: 'Nome inválido.' });
        updates.name = name;
    }
    if (req.body?.data !== undefined) {
        if (typeof req.body.data !== 'object') return res.status(400).json({ error: 'Dados inválidos.' });
        updates.data = req.body.data;
    }

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'Nenhum campo para atualizar.' });
    }

    try {
        const { data, error } = await supabase
            .from('cronos_schedules')
            .update(updates)
            .eq('id', id)
            .eq('school_id', req.cronosUser.schoolId)
            .select('id, name, updated_at')
            .single();

        if (error || !data) return res.status(404).json({ error: 'Programação não encontrada.' });
        res.json({ success: true, data });
    } catch (err) {
        console.error('[cronos] update:', err.message);
        res.status(500).json({ error: 'Erro ao atualizar programação.' });
    }
});

/* DELETE /schedules/:id */
router.delete('/schedules/:id', async (req, res) => {
    const { id } = req.params;
    if (!/^[0-9a-f-]{36}$/.test(id)) return res.status(400).json({ error: 'ID inválido.' });

    try {
        const { error, count } = await supabase
            .from('cronos_schedules')
            .delete({ count: 'exact' })
            .eq('id', id)
            .eq('school_id', req.cronosUser.schoolId);

        if (error) throw error;
        if (count === 0) return res.status(404).json({ error: 'Programação não encontrada.' });
        res.status(204).send();
    } catch (err) {
        console.error('[cronos] delete:', err.message);
        res.status(500).json({ error: 'Erro ao excluir programação.' });
    }
});

module.exports = { router };
