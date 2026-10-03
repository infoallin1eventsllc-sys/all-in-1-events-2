// Netlify Function: POST /.netlify/functions/chat  { messages } -> { reply }
'use strict';
const { reply } = require('../../lib/concierge.js');

const HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: { ...HEADERS, Allow: 'POST' }, body: JSON.stringify({ error: 'POST only' }) };
  if ((event.body || '').length > 16000) return { statusCode: 413, headers: HEADERS, body: JSON.stringify({ error: 'Request too large' }) };
  let body;
  try { body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body || '{}'); }
  catch { return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'invalid JSON' }) }; }
  const r = await reply(body);
  return { statusCode: r.status, headers: HEADERS, body: JSON.stringify(r.body) };
};
