const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface CallAnalysisResult {
  sentiment: 'positive' | 'neutral' | 'negative'
  key_points: string[]
  objections: string[]
  next_steps: string[]
  buying_signals: string[]
  risk_factors: string[]
  recommended_actions: string[]
  score: number
  summary: string
}

export async function analyzeCallTranscript(transcript: string): Promise<CallAnalysisResult> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured')
  }

  const systemPrompt = `Você é um especialista em análise de ligações de vendas. Analise a transcrição da ligação e forneça uma análise detalhada em formato JSON.

A análise deve incluir:
- sentiment: 'positive', 'neutral' ou 'negative'
- key_points: principais pontos discutidos (array de strings)
- objections: objeções levantadas pelo cliente (array de strings)
- next_steps: próximos passos acordados (array de strings)
- buying_signals: sinais de compra identificados (array de strings)
- risk_factors: fatores de risco para o fechamento (array de strings)
- recommended_actions: ações recomendadas para o closer (array de strings)
- score: pontuação de 0 a 100 indicando probabilidade de fechamento
- summary: resumo executivo da ligação (máximo 3 frases)

Responda APENAS com o JSON, sem markdown ou texto adicional.`

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Analise esta transcrição de ligação:\n\n${transcript}` }
  ]

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages,
      temperature: 0.3,
      max_tokens: 2000
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Failed to analyze call')
  }

  const data = await response.json()
  const content = data.choices[0]?.message?.content

  if (!content) {
    throw new Error('No response from OpenAI')
  }

  try {
    return JSON.parse(content)
  } catch {
    throw new Error('Failed to parse OpenAI response')
  }
}

export async function generateCallSummary(notes: string, clientName: string): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured')
  }

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: 'Você é um assistente que cria resumos concisos de ligações de vendas. Crie um resumo profissional e objetivo em português brasileiro.'
    },
    {
      role: 'user',
      content: `Crie um resumo da ligação com ${clientName} baseado nestas anotações:\n\n${notes}`
    }
  ]

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.5,
      max_tokens: 500
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Failed to generate summary')
  }

  const data = await response.json()
  return data.choices[0]?.message?.content || ''
}

export async function suggestNextActions(
  clientHistory: string,
  lastCallSummary: string
): Promise<string[]> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured')
  }

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: 'Você é um consultor de vendas experiente. Sugira 3-5 ações concretas e práticas para o closer realizar com base no histórico do cliente. Responda com uma lista numerada em português brasileiro.'
    },
    {
      role: 'user',
      content: `Histórico do cliente:\n${clientHistory}\n\nÚltima ligação:\n${lastCallSummary}\n\nSugira as próximas ações.`
    }
  ]

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.7,
      max_tokens: 500
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Failed to suggest actions')
  }

  const data = await response.json()
  const content = data.choices[0]?.message?.content || ''

  // Parse numbered list into array
  return content
    .split('\n')
    .filter((line: string) => line.match(/^\d+\./))
    .map((line: string) => line.replace(/^\d+\.\s*/, '').trim())
}
