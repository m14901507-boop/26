export interface Env {
  FRONTEND_ORIGIN?: string;
}

function corsHeaders(env: Env) {
  return {
    'Access-Control-Allow-Origin': env.FRONTEND_ORIGIN || 'https://m14901507-boop.github.io',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    if (url.pathname === '/health') {
      return Response.json(
        {
          ok: true,
          service: 'floosy-api',
          runtime: 'cloudflare-workers',
          time: new Date().toISOString(),
        },
        { headers: corsHeaders(env) }
      );
    }

    return Response.json(
      { ok: false, error: 'Not found' },
      { status: 404, headers: corsHeaders(env) }
    );
  },
};
