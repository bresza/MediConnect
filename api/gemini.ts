export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const { model, ...bodyBase } = await req.json()

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Configuração de IA ausente no servidor.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      )
    }

    if (!model || typeof model !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Parâmetro "model" ausente ou inválido.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const googleRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyBase),
      },
    )

    const data = await googleRes.json()
    return new Response(JSON.stringify(data), {
      status: googleRes.status,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Erro na rota proxy do Gemini:', error)
    return new Response(
      JSON.stringify({ error: 'Falha ao processar a requisição de IA.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
