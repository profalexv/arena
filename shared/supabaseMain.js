'use strict';
/**
 * shared/supabaseMain.js
 *
 * Cliente Supabase para a instância principal do ecossistema Axom.
 * Usada pelo módulo cronos para persistir programações (tabela cronos_schedules).
 *
 * Variáveis de ambiente necessárias no render.com:
 *   SUPABASE_URL          — URL do projeto Supabase principal
 *   SUPABASE_SERVICE_KEY  — service_role key (acesso total, sem RLS)
 */
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
    console.warn('[supabaseMain] SUPABASE_URL ou SUPABASE_SERVICE_KEY não configurado. ' +
        'Recursos de cronos cloud estarão indisponíveis.');
}

const supabaseMain = url && key ? createClient(url, key) : null;

module.exports = supabaseMain;
