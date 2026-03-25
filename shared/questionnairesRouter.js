'use strict';
/**
 * shared/questionnairesRouter.js (PROXY)
 *
 * Fábrica de router Express para enviar questionários para a nuvem.
 * O Arena não possui mais acesso local ao banco, operando apenas como Bouncer.
 */

const { Router } = require('express');
const MOTOR_URL = process.env.LOGIN_URL || process.env.MOTOR_URL || 'https://axom.fly.dev';

function createQuestionnairesRouter(appType) {
  const router = Router();

  // Proxy all requests transparently to Motor API
  router.all('*', async (req, res) => {
    try {
      // Ex: / ou /1234
      const proxyUrl = `${MOTOR_URL}/api/quiz-questionnaires${req.url === '/' ? '' : req.url}`;
      
      const response = await fetch(proxyUrl, {
        method: req.method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': req.headers.authorization || '',
          'X-App-Type': appType
        },
        body: ['GET', 'HEAD', 'DELETE'].includes(req.method) ? undefined : JSON.stringify(req.body)
      });
      
      const data = await response.json().catch(() => ({}));
      return res.status(response.status).json(data);
    } catch (err) {
      console.error(`[quiz-proxy-${appType}] Motor Error:`, err.message);
      return res.status(503).json({ error: 'Nuvem Motor indisponível.' });
    }
  });

  return router;
}

module.exports = createQuestionnairesRouter;
