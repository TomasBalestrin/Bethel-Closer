// analyze-call - Main AI analysis function for sales calls
// Bethel Closer - Sales Call Analysis Platform

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  corsHeaders,
  createSupabaseClient,
  createSupabaseAdminClient,
  callOpenAI,
  calculateSHA256,
  chunkText,
  requireAuth,
  handleError,
  successResponse,
  logApiCost,
  logEvent,
  ApiError,
  Framework,
  FRAMEWORKS,
  SALES_STAGES,
  CallAnalysis,
  AnalysisMetadata,
  OpenAIMessage,
} from "../_shared/utils.ts";

// ============================================================
// MASTER PROMPT FOR CALL ANALYSIS
// ============================================================

const MASTER_PROMPT = `Voce e um DIRETOR COMERCIAL + ANALISTA SENIOR DE CALLS HIGH TICKET.
Seu trabalho e auditar a call com rigor, como se voce fosse o lider do time avaliando performance, aderencia ao processo e capacidade de conversao.

Voce tem acesso a 4 frameworks oficiais e deve escolher AUTOMATICAMENTE o framework correto com base no produto/pitch que aparece na call.
Frameworks disponiveis:
- "Elite Premium" - Mentoria high ticket para empresarios
- "Implementacao de IA (NextTrack)" - Programa de implementacao de IA para negocios
- "Mentoria Julia Ottoni" - Mentoria de desenvolvimento pessoal/profissional
- "Programa de Implementacao Comercial" - Programa de estruturacao comercial

ETAPAS DE ANALISE (12 etapas padrao):
1. conexao_estrategica - Criacao de rapport inicial (3-5 min)
2. abertura - Contextualizacao e agenda da call (5-7 min)
3. rapport_qualificacao - Aprofundamento do perfil do lead
4. diagnostico_dor - Identificacao das dores e desafios
5. projecao_futuro - Visualizacao do cenario ideal
6. ancoragem_prova_social - Cases e resultados de outros clientes
7. apresentacao_solucao - Explicacao do programa/produto
8. oferta_investimento - Apresentacao dos valores
9. contorno_objecoes - Tratamento de objecoes
10. fechamento - Tentativa de fechar a venda
11. pos_fechamento - Confirmacao e proximos passos (se vendeu)
12. follow_up - Agendamento de proximo contato (se nao vendeu)

INSTRUCOES DE ANALISE:

1. IDENTIFICACAO AUTOMATICA
- Identifique o nome do lead e do closer pela transcricao
- Identifique o produto ofertado
- Determine se houve venda ou nao

2. DADOS EXTRAIDOS
Extraia todas as informacoes relevantes mencionadas na call:
- Nicho/profissao do lead
- Modelo de venda atual
- Ticket medio
- Faturamento mensal (bruto e liquido se mencionado)
- Tamanho da equipe
- Canais de aquisicao
- Estrutura comercial atual
- Dor principal declarada (com evidencia da transcricao)
- Dor profunda (se identificada)
- Objetivo para os proximos 12 meses
- Urgencia e importancia declaradas
- Objecoes levantadas (com evidencias)
- Motivos de compra ou nao compra

3. NOTA GERAL (0-10)
Avalie a performance geral do closer considerando:
- Aderencia ao script/framework
- Qualidade das perguntas
- Escuta ativa
- Contorno de objecoes
- Tentativa de fechamento
- Tom e energia

4. MAIORES ACERTOS (max 5)
Para cada acerto:
- Descreva o acerto
- Cite a evidencia da transcricao
- Explique porque importa
- De uma dica de como repetir

5. MAIORES ERROS (max 5)
Para cada erro:
- Descreva o erro
- Cite a evidencia
- Explique o impacto na venda
- De sugestoes de correcao
- Forneca uma frase pronta (antes vs depois)

6. ANALISE SE NAO VENDEU
- Identifique o ponto exato de perda da venda
- Liste os sinais que indicaram a perda

7. ANALISE SE VENDEU
- Identifique os motivos da compra
- Liste os gatilhos que mais pesaram

8. ANALISE POR ETAPA
Para cada uma das 12 etapas, analise:
- Se aconteceu ou nao
- Nota de 0-10
- Se a funcao da etapa foi cumprida
- Evidencias da transcricao
- Pontos fortes
- Pontos fracos
- Erros de execucao
- Impacto no lead
- Sugestoes de correcao
- Frase melhorada (antes vs depois)

9. PLANO DE ACAO
- Ajuste #1: Diagnostico do principal problema e solucao
- Treino recomendado: Habilidades a desenvolver
- Proxima acao com o lead: Status e mensagem sugerida

FORMATO DE RESPOSTA:
Retorne um JSON valido com a estrutura completa conforme especificado.
Seja especifico e use evidencias reais da transcricao.
Nao invente informacoes que nao estao na call.`;

// ============================================================
// CHUNK ANALYSIS PROMPT
// ============================================================

const getChunkPrompt = (
  chunkIndex: number,
  totalChunks: number,
  framework?: Framework
): string => {
  const frameworkInstruction = framework
    ? `Use o framework "${framework}" para esta analise.`
    : "Identifique automaticamente o framework correto baseado no produto/pitch.";

  return `${MASTER_PROMPT}

CONTEXTO: Esta e a parte ${chunkIndex + 1} de ${totalChunks} da transcricao.
${frameworkInstruction}

IMPORTANTE:
- Analise apenas o conteudo desta parte
- Marque claramente quais etapas aparecem neste trecho
- Se uma etapa nao aparece neste trecho, marque como "nao_presente_neste_chunk"
- Os resultados serao consolidados posteriormente`;
};

// ============================================================
// MAIN HANDLER
// ============================================================

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabase = createSupabaseClient(req.headers.get("Authorization") || undefined);
    const adminClient = createSupabaseAdminClient();

    // Authenticate user
    const user = await requireAuth(req, supabase);

    // Parse request body
    const body = await req.json();
    const {
      callId,
      transcription,
      forceFramework,
    }: {
      callId: string;
      transcription: string;
      forceFramework?: Framework;
    } = body;

    if (!callId) {
      throw new ApiError(400, "callId is required");
    }

    if (!transcription) {
      throw new ApiError(400, "transcription is required");
    }

    // Validate forceFramework if provided
    if (forceFramework && !FRAMEWORKS.includes(forceFramework)) {
      throw new ApiError(
        400,
        `Invalid framework. Must be one of: ${FRAMEWORKS.join(", ")}`
      );
    }

    // Check if call exists and user has access
    const { data: call, error: callError } = await supabase
      .from("calls")
      .select("id, closer_id")
      .eq("id", callId)
      .single();

    if (callError || !call) {
      throw new ApiError(404, "Call not found");
    }

    // Calculate content hash
    const contentHash = await calculateSHA256(transcription);

    // Check for duplicate content
    const { data: existingCall } = await supabase
      .from("calls")
      .select("id")
      .eq("content_hash", contentHash)
      .neq("id", callId)
      .single();

    if (existingCall) {
      throw new ApiError(
        409,
        `Duplicate transcription detected. Already analyzed in call ${existingCall.id}`
      );
    }

    // Determine chunking strategy
    const transcriptionSize = new TextEncoder().encode(transcription).length;
    const MAX_CHUNK_SIZE = 25 * 1024; // 25KB
    const CHUNK_THRESHOLD = 50 * 1024; // 50KB
    const MAX_PARALLEL_CHUNKS = 4;

    let analysis: CallAnalysis;
    let metadata: AnalysisMetadata;
    let totalTokensInput = 0;
    let totalTokensOutput = 0;

    if (transcriptionSize > CHUNK_THRESHOLD) {
      // Chunk the transcription
      const chunks = chunkText(transcription, MAX_CHUNK_SIZE);
      const chunksToProcess = chunks.slice(0, MAX_PARALLEL_CHUNKS);
      const isPartial = chunks.length > MAX_PARALLEL_CHUNKS;

      console.log(
        `Processing ${chunksToProcess.length} of ${chunks.length} chunks`
      );

      // Process chunks in parallel
      const chunkPromises = chunksToProcess.map(async (chunk, index) => {
        const messages: OpenAIMessage[] = [
          {
            role: "system",
            content: getChunkPrompt(index, chunksToProcess.length, forceFramework),
          },
          {
            role: "user",
            content: `Transcricao (parte ${index + 1}/${chunksToProcess.length}):\n\n${chunk}`,
          },
        ];

        const response = await callOpenAI(messages, "gpt-4o", 0.3, 4096);
        totalTokensInput += response.usage.prompt_tokens;
        totalTokensOutput += response.usage.completion_tokens;

        return JSON.parse(response.choices[0].message.content);
      });

      const chunkResults = await Promise.all(chunkPromises);

      // Merge chunk results
      analysis = mergeChunkAnalyses(chunkResults, forceFramework);

      metadata = {
        is_partial: isPartial,
        chunks_analyzed: chunksToProcess.length,
        total_chunks: chunks.length,
        model_used: "gpt-4o",
        analysis_version: "2.0",
        processing_time_ms: Date.now() - startTime,
      };
    } else {
      // Single analysis for smaller transcriptions
      const messages: OpenAIMessage[] = [
        {
          role: "system",
          content: forceFramework
            ? `${MASTER_PROMPT}\n\nUse o framework "${forceFramework}" para esta analise.`
            : MASTER_PROMPT,
        },
        {
          role: "user",
          content: `Transcricao completa da call:\n\n${transcription}`,
        },
      ];

      const response = await callOpenAI(messages, "gpt-4o", 0.3, 4096);
      totalTokensInput = response.usage.prompt_tokens;
      totalTokensOutput = response.usage.completion_tokens;

      analysis = JSON.parse(response.choices[0].message.content);

      metadata = {
        is_partial: false,
        chunks_analyzed: 1,
        total_chunks: 1,
        model_used: "gpt-4o",
        analysis_version: "2.0",
        processing_time_ms: Date.now() - startTime,
      };
    }

    // Calculate stage scores for easy querying
    const stageScores: Record<string, number> = {};
    if (analysis.analise_por_etapa) {
      for (const stage of SALES_STAGES) {
        const stageAnalysis = analysis.analise_por_etapa[stage];
        if (stageAnalysis && typeof stageAnalysis.nota === "number") {
          stageScores[stage] = stageAnalysis.nota;
        }
      }
    }

    // Update call with analysis results
    const { error: updateError } = await adminClient
      .from("calls")
      .update({
        ai_analysis: analysis,
        ai_summary: generateSummary(analysis),
        quality_score: analysis.nota_geral || null,
        score: analysis.nota_geral || null,
        transcription: transcription,
        content_hash: contentHash,
        analysis_metadata: metadata,
        technical_analysis: { stage_scores: stageScores },
        analyzed_at: new Date().toISOString(),
        // Extract key data if available
        client_name: analysis.identificacao?.nome_lead || null,
        product: analysis.identificacao?.produto_ofertado || null,
        niche: analysis.dados_extraidos?.nicho_profissao || null,
        main_pain: analysis.dados_extraidos?.dor_principal_declarada?.texto || null,
        main_errors: analysis.maiores_erros?.map((e) => e.erro || "").filter(Boolean) || null,
        main_wins: analysis.maiores_acertos?.map((a) => a.acerto || "").filter(Boolean) || null,
        loss_point: analysis.ponto_de_perda_da_venda || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", callId);

    if (updateError) {
      throw new ApiError(500, `Failed to save analysis: ${updateError.message}`);
    }

    // Log API cost
    await logApiCost(
      adminClient,
      "openai",
      "gpt-4o",
      "analyze-call",
      totalTokensInput,
      totalTokensOutput,
      user.id,
      callId,
      { chunks: metadata.chunks_analyzed, total_chunks: metadata.total_chunks }
    );

    // Log event
    await logEvent(
      adminClient,
      "info",
      "analyze-call",
      "complete",
      user.id,
      metadata.processing_time_ms,
      undefined,
      {
        call_id: callId,
        score: analysis.nota_geral,
        framework: analysis.framework_selecionado,
        is_partial: metadata.is_partial,
      }
    );

    return successResponse({
      callId,
      analysis,
      metadata,
      score: analysis.nota_geral,
      framework: analysis.framework_selecionado,
    });
  } catch (error) {
    return handleError(error);
  }
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function mergeChunkAnalyses(
  chunks: CallAnalysis[],
  forceFramework?: Framework
): CallAnalysis {
  const merged: CallAnalysis = {
    framework_selecionado: forceFramework || chunks[0]?.framework_selecionado,
    confianca_framework: chunks[0]?.confianca_framework,
    motivo_escolha_framework: chunks[0]?.motivo_escolha_framework,
    identificacao: {},
    dados_extraidos: {},
    maiores_acertos: [],
    maiores_erros: [],
    analise_por_etapa: {},
    plano_de_acao_direto: {},
    sinais_da_perda: [],
  };

  // Merge identification - take first non-null values
  for (const chunk of chunks) {
    if (chunk.identificacao) {
      merged.identificacao = {
        nome_lead:
          merged.identificacao?.nome_lead || chunk.identificacao.nome_lead,
        nome_closer:
          merged.identificacao?.nome_closer || chunk.identificacao.nome_closer,
        produto_ofertado:
          merged.identificacao?.produto_ofertado ||
          chunk.identificacao.produto_ofertado,
        houve_venda:
          merged.identificacao?.houve_venda || chunk.identificacao.houve_venda,
      };
    }
  }

  // Merge extracted data - take first non-null values
  for (const chunk of chunks) {
    if (chunk.dados_extraidos) {
      const existing = merged.dados_extraidos || {};
      merged.dados_extraidos = {
        nicho_profissao:
          existing.nicho_profissao || chunk.dados_extraidos.nicho_profissao,
        modelo_de_venda:
          existing.modelo_de_venda || chunk.dados_extraidos.modelo_de_venda,
        ticket_medio:
          existing.ticket_medio || chunk.dados_extraidos.ticket_medio,
        faturamento_mensal_bruto:
          existing.faturamento_mensal_bruto ||
          chunk.dados_extraidos.faturamento_mensal_bruto,
        faturamento_mensal_liquido:
          existing.faturamento_mensal_liquido ||
          chunk.dados_extraidos.faturamento_mensal_liquido,
        equipe: existing.equipe || chunk.dados_extraidos.equipe,
        canais_aquisicao: [
          ...(existing.canais_aquisicao || []),
          ...(chunk.dados_extraidos.canais_aquisicao || []),
        ].filter((v, i, a) => a.indexOf(v) === i),
        estrutura_comercial:
          existing.estrutura_comercial ||
          chunk.dados_extraidos.estrutura_comercial,
        dor_principal_declarada:
          existing.dor_principal_declarada ||
          chunk.dados_extraidos.dor_principal_declarada,
        dor_profunda:
          existing.dor_profunda || chunk.dados_extraidos.dor_profunda,
        objetivo_12_meses:
          existing.objetivo_12_meses || chunk.dados_extraidos.objetivo_12_meses,
        urgencia_declarada:
          existing.urgencia_declarada ||
          chunk.dados_extraidos.urgencia_declarada,
        importancia_declarada:
          existing.importancia_declarada ||
          chunk.dados_extraidos.importancia_declarada,
        objecoes_levantadas: [
          ...(existing.objecoes_levantadas || []),
          ...(chunk.dados_extraidos.objecoes_levantadas || []),
        ],
        motivo_compra_ou_nao_compra: [
          ...(existing.motivo_compra_ou_nao_compra || []),
          ...(chunk.dados_extraidos.motivo_compra_ou_nao_compra || []),
        ],
      };
    }
  }

  // Collect all acertos and erros
  for (const chunk of chunks) {
    if (chunk.maiores_acertos) {
      merged.maiores_acertos = [
        ...(merged.maiores_acertos || []),
        ...chunk.maiores_acertos,
      ];
    }
    if (chunk.maiores_erros) {
      merged.maiores_erros = [
        ...(merged.maiores_erros || []),
        ...chunk.maiores_erros,
      ];
    }
    if (chunk.sinais_da_perda) {
      merged.sinais_da_perda = [
        ...(merged.sinais_da_perda || []),
        ...chunk.sinais_da_perda,
      ];
    }
  }

  // Limit to max 5 each
  merged.maiores_acertos = merged.maiores_acertos?.slice(0, 5);
  merged.maiores_erros = merged.maiores_erros?.slice(0, 5);

  // Merge stage analyses - take the analysis with actual content
  for (const stage of SALES_STAGES) {
    for (const chunk of chunks) {
      const stageAnalysis = chunk.analise_por_etapa?.[stage];
      if (
        stageAnalysis &&
        stageAnalysis.aconteceu !== "nao_presente_neste_chunk"
      ) {
        merged.analise_por_etapa = merged.analise_por_etapa || {};
        merged.analise_por_etapa[stage] = stageAnalysis;
        break;
      }
    }
  }

  // Calculate overall score as average of stage scores
  const stageScores = Object.values(merged.analise_por_etapa || {})
    .map((s) => s.nota)
    .filter((n): n is number => typeof n === "number");

  if (stageScores.length > 0) {
    merged.nota_geral = Math.round(
      stageScores.reduce((a, b) => a + b, 0) / stageScores.length
    );
  }

  // Take loss point from any chunk
  for (const chunk of chunks) {
    if (chunk.ponto_de_perda_da_venda) {
      merged.ponto_de_perda_da_venda = chunk.ponto_de_perda_da_venda;
      break;
    }
  }

  // Take se_vendeu from any chunk
  for (const chunk of chunks) {
    if (chunk.se_vendeu) {
      merged.se_vendeu = chunk.se_vendeu;
      break;
    }
  }

  // Take plano_de_acao from last chunk (most likely to have final action plan)
  for (let i = chunks.length - 1; i >= 0; i--) {
    if (chunks[i].plano_de_acao_direto) {
      merged.plano_de_acao_direto = chunks[i].plano_de_acao_direto;
      break;
    }
  }

  return merged;
}

function generateSummary(analysis: CallAnalysis): string {
  const parts: string[] = [];

  if (analysis.identificacao?.nome_lead) {
    parts.push(`Lead: ${analysis.identificacao.nome_lead}`);
  }

  if (analysis.identificacao?.produto_ofertado) {
    parts.push(`Produto: ${analysis.identificacao.produto_ofertado}`);
  }

  if (analysis.nota_geral !== undefined) {
    parts.push(`Nota: ${analysis.nota_geral}/10`);
  }

  if (analysis.identificacao?.houve_venda) {
    parts.push(`Resultado: ${analysis.identificacao.houve_venda}`);
  }

  if (analysis.dados_extraidos?.nicho_profissao) {
    parts.push(`Nicho: ${analysis.dados_extraidos.nicho_profissao}`);
  }

  if (analysis.dados_extraidos?.dor_principal_declarada?.texto) {
    parts.push(
      `Dor principal: ${analysis.dados_extraidos.dor_principal_declarada.texto}`
    );
  }

  if (analysis.maiores_acertos && analysis.maiores_acertos.length > 0) {
    parts.push(
      `Acertos: ${analysis.maiores_acertos
        .slice(0, 3)
        .map((a) => a.acerto)
        .join(", ")}`
    );
  }

  if (analysis.maiores_erros && analysis.maiores_erros.length > 0) {
    parts.push(
      `Erros: ${analysis.maiores_erros
        .slice(0, 3)
        .map((e) => e.erro)
        .join(", ")}`
    );
  }

  return parts.join(" | ");
}
