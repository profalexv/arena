'use strict';
/**
 * shared/questionnairesRouter.js
 *
 * Fábrica de router Express para CRUD de questionários na nuvem.
 * Usado tanto pelo módulo arena quanto pelo mindpool.
 *
 * Parâmetros:
 *   appType: 'arena' | 'mindpool'
 *
 * Rotas geradas (prefixo configurado em server.js):
 *   GET    /questionnaires           — lista questionários do usuário
 *   GET    /questionnaires/:id       — busca um questionário
 *   POST   /questionnaires           — salva novo questionário
 *   PUT    /questionnaires/:id       — atualiza questionário existente
 *   DELETE /questionnaires/:id       — exclui questionário
 */

const { Router } = require('express');
const quizAuth = require('./quizAuth');
const supabaseQuiz = require('./supabaseQuiz');

const MAX_QUESTIONS_PER_QUESTIONNAIRE = 200;
const MAX_QUESTIONNAIRES_PER_USER = 100;

function createQuestionnairesRouter(appType) {
  const router = Router();

  // Todos os endpoints exigem autenticação premium
  router.use(quizAuth);

  // Verifica se o Supabase está configurado
  router.use((_req, res, next) => {
    if (!supabaseQuiz) {
      return res.status(503).json({ error: 'Serviço de questionários indisponível (banco não configurado).' });
    }
    next();
  });

  /* GET /questionnaires
   * Lista todos os questionários do usuário autenticado para este app. */
  router.get('/', async (req, res) => {
    try {
      const { data, error } = await supabaseQuiz
        .from('questionnaires')
        .select('id, title, description, tags, created_at, updated_at')
        .eq('user_id', req.quizUser.userId)
        .eq('app_type', appType)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      res.json(data);
    } catch (err) {
      console.error(`[${appType}] list questionnaires:`, err.message);
      res.status(500).json({ error: 'Erro ao buscar questionários.' });
    }
  });

  /* GET /questionnaires/:id
   * Retorna um questionário completo (inclui questions). */
  router.get('/:id', async (req, res) => {
    try {
      const { data, error } = await supabaseQuiz
        .from('questionnaires')
        .select('*')
        .eq('id', req.params.id)
        .eq('user_id', req.quizUser.userId)
        .eq('app_type', appType)
        .single();

      if (error || !data) return res.status(404).json({ error: 'Questionário não encontrado.' });
      res.json(data);
    } catch (err) {
      console.error(`[${appType}] get questionnaire:`, err.message);
      res.status(500).json({ error: 'Erro ao buscar questionário.' });
    }
  });

  /* POST /questionnaires
   * Cria novo questionário. Body: { title, description?, questions, tags? } */
  router.post('/', async (req, res) => {
    const { title, description, questions, tags } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: 'Título obrigatório.' });
    }
    if (!Array.isArray(questions)) {
      return res.status(400).json({ error: 'questions deve ser um array.' });
    }
    if (questions.length > MAX_QUESTIONS_PER_QUESTIONNAIRE) {
      return res.status(400).json({ error: `Máximo de ${MAX_QUESTIONS_PER_QUESTIONNAIRE} perguntas por questionário.` });
    }

    try {
      // Verifica limite de questionários por usuário
      const { count } = await supabaseQuiz
        .from('questionnaires')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', req.quizUser.userId)
        .eq('app_type', appType);

      if (count >= MAX_QUESTIONNAIRES_PER_USER) {
        return res.status(422).json({
          error: `Limite de ${MAX_QUESTIONNAIRES_PER_USER} questionários atingido. Exclua alguns para continuar.`,
        });
      }

      const { data, error } = await supabaseQuiz
        .from('questionnaires')
        .insert({
          user_id:     req.quizUser.userId,
          user_email:  req.quizUser.email,
          app_type:    appType,
          title:       title.trim(),
          description: description?.trim() || null,
          questions,
          tags:        Array.isArray(tags) ? tags : [],
        })
        .select()
        .single();

      if (error) throw error;
      res.status(201).json(data);
    } catch (err) {
      console.error(`[${appType}] create questionnaire:`, err.message);
      res.status(500).json({ error: 'Erro ao salvar questionário.' });
    }
  });

  /* PUT /questionnaires/:id
   * Atualiza questionário existente. */
  router.put('/:id', async (req, res) => {
    const { title, description, questions, tags } = req.body;

    if (title !== undefined && (!title || title.trim().length === 0)) {
      return res.status(400).json({ error: 'Título não pode ser vazio.' });
    }
    if (questions !== undefined) {
      if (!Array.isArray(questions)) {
        return res.status(400).json({ error: 'questions deve ser um array.' });
      }
      if (questions.length > MAX_QUESTIONS_PER_QUESTIONNAIRE) {
        return res.status(400).json({ error: `Máximo de ${MAX_QUESTIONS_PER_QUESTIONNAIRE} perguntas.` });
      }
    }

    try {
      // Verifica propriedade antes de atualizar
      const { data: existing } = await supabaseQuiz
        .from('questionnaires')
        .select('id')
        .eq('id', req.params.id)
        .eq('user_id', req.quizUser.userId)
        .eq('app_type', appType)
        .single();

      if (!existing) return res.status(404).json({ error: 'Questionário não encontrado.' });

      const updates = {};
      if (title      !== undefined) updates.title       = title.trim();
      if (description !== undefined) updates.description = description?.trim() || null;
      if (questions  !== undefined) updates.questions   = questions;
      if (tags       !== undefined) updates.tags        = Array.isArray(tags) ? tags : [];

      const { data, error } = await supabaseQuiz
        .from('questionnaires')
        .update(updates)
        .eq('id', req.params.id)
        .eq('user_id', req.quizUser.userId)
        .select()
        .single();

      if (error) throw error;
      res.json(data);
    } catch (err) {
      console.error(`[${appType}] update questionnaire:`, err.message);
      res.status(500).json({ error: 'Erro ao atualizar questionário.' });
    }
  });

  /* DELETE /questionnaires/:id
   * Exclui questionário do usuário. */
  router.delete('/:id', async (req, res) => {
    try {
      const { error } = await supabaseQuiz
        .from('questionnaires')
        .delete()
        .eq('id', req.params.id)
        .eq('user_id', req.quizUser.userId)
        .eq('app_type', appType);

      if (error) throw error;
      res.sendStatus(204);
    } catch (err) {
      console.error(`[${appType}] delete questionnaire:`, err.message);
      res.status(500).json({ error: 'Erro ao excluir questionário.' });
    }
  });

  return router;
}

module.exports = createQuestionnairesRouter;
