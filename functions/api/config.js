// MediAção — configuração pública para o navegador.
// Rota: GET /api/config
// Devolve apenas dados públicos (nunca segredos). A "site key" do Turnstile é pública por natureza.

export async function onRequestGet({ env }) {
  const corpo = { turnstileSiteKey: (env && env.TURNSTILE_SITE_KEY) || null };
  return new Response(JSON.stringify(corpo), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function onRequest() {
  return new Response(JSON.stringify({ ok: false, erro: "metodo" }), {
    status: 405,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
