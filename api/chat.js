// Vercel Function: POST /api/chat  { messages } -> { reply }
'use strict';
const { reply } = require('../lib/concierge.js');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'POST only' }); }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'invalid JSON' }); } }
  if (JSON.stringify(body || {}).length > 16000) return res.status(413).json({ error: 'Request too large' });
  const r = await reply(body || {});
  return res.status(r.status).json(r.body);
};
