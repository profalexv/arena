'use strict';
/**
 * shared/supabaseQuiz.js
 *
 * Cliente Supabase para a instância dedicada de questionários (Rush + Mind).
 * Variáveis de ambiente necessárias no render.com:
 *   SUPABASE_QUIZ_URL      — URL da instância Supabase Quiz
 *   SUPABASE_QUIZ_KEY      — service_role key (acesso total, sem RLS)
 */
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_QUIZ_URL;
const key = process.env.SUPABASE_QUIZ_KEY;

if (!url || !key) {
  console.warn('[supabaseQuiz] SUPABASE_QUIZ_URL ou SUPABASE_QUIZ_KEY não configurado. ' +
    'Recursos premium de salvar questionários estarão indisponíveis.');
}

const supabaseQuiz = url && key
  ? createClient(url, key)
  : null;

module.exports = supabaseQuiz;
