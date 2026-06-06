// D_mind · Anthropic proxy (Vercel Serverless Function)
// The browser calls /api/claude. This function attaches the secret API key
// (from the ANTHROPIC_API_KEY environment variable) and forwards the request
// to Anthropic. The key is NEVER sent to the client.
//
// Set in Vercel:  Project → Settings → Environment Variables
//   ANTHROPIC_API_KEY = sk-ant-...   (and optional CLAUDE_MODEL = claude-haiku-4-5-20251001)

const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001'; // cheap + vision-capable
const MAX_TOKENS_CAP = 1024;

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;          // Vercel auto-parsed
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  // raw stream fallback
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(500).json({ error: 'missing_api_key' }); return; }

  try {
    const body = await readBody(req);
    const messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'messages_required' });
      return;
    }

    const payload = {
      model: MODEL,                                                // forced server-side (cost control)
      max_tokens: Math.min(Number(body.max_tokens) || 1000, MAX_TOKENS_CAP),
      messages,
    };
    if (body.system) payload.system = String(body.system);

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
    });

    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (e) {
    res.status(500).json({ error: 'proxy_failed' });
  }
}
