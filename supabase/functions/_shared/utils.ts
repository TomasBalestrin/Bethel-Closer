// Shared utilities for Supabase Edge Functions
// Bethel Closer - Sales Call Analysis Platform

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { crypto } from "https://deno.land/std@0.208.0/crypto/mod.ts";

// ============================================================
// CORS HEADERS
// ============================================================

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
};

// ============================================================
// ENVIRONMENT VARIABLES
// ============================================================

export const getEnvVar = (key: string, required = true): string => {
  const value = Deno.env.get(key);
  if (required && !value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || "";
};

// ============================================================
// SUPABASE CLIENT INITIALIZATION
// ============================================================

export const createSupabaseClient = (authHeader?: string): SupabaseClient => {
  const supabaseUrl = getEnvVar("SUPABASE_URL");
  const supabaseAnonKey = getEnvVar("SUPABASE_ANON_KEY");

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: authHeader ? { Authorization: authHeader } : {},
    },
  });
};

export const createSupabaseAdminClient = (): SupabaseClient => {
  const supabaseUrl = getEnvVar("SUPABASE_URL");
  const supabaseServiceKey = getEnvVar("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

// ============================================================
// OPENAI CLIENT INITIALIZATION
// ============================================================

export interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenAIResponse {
  id: string;
  choices: {
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export const callOpenAI = async (
  messages: OpenAIMessage[],
  model = "gpt-4o",
  temperature = 0.3,
  maxTokens = 4096
): Promise<OpenAIResponse> => {
  const apiKey = getEnvVar("OPENAI_API_KEY");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  return response.json();
};

// ============================================================
// TYPES
// ============================================================

export type UserRole = "admin" | "closer" | "lider" | "financeiro";

export type Framework =
  | "Elite Premium"
  | "Implementação de IA (NextTrack)"
  | "Mentoria Julia Ottoni"
  | "Programa de Implementação Comercial";

export const FRAMEWORKS: Framework[] = [
  "Elite Premium",
  "Implementação de IA (NextTrack)",
  "Mentoria Julia Ottoni",
  "Programa de Implementação Comercial",
];

export const SALES_STAGES = [
  "conexao_estrategica",
  "abertura",
  "rapport_qualificacao",
  "diagnostico_dor",
  "projecao_futuro",
  "ancoragem_prova_social",
  "apresentacao_solucao",
  "oferta_investimento",
  "contorno_objecoes",
  "fechamento",
  "pos_fechamento",
  "follow_up",
] as const;

export type SalesStage = (typeof SALES_STAGES)[number];

export interface CallAnalysis {
  framework_selecionado?: string;
  confianca_framework?: number;
  motivo_escolha_framework?: string[];
  identificacao?: {
    nome_lead?: string;
    nome_closer?: string;
    produto_ofertado?: string;
    houve_venda?: string;
  };
  dados_extraidos?: {
    nicho_profissao?: string;
    modelo_de_venda?: string;
    ticket_medio?: string;
    faturamento_mensal_bruto?: string;
    faturamento_mensal_liquido?: string;
    equipe?: string;
    canais_aquisicao?: string[];
    estrutura_comercial?: string;
    dor_principal_declarada?: { texto?: string; evidencia?: string };
    dor_profunda?: { texto?: string; evidencia?: string };
    objetivo_12_meses?: string;
    urgencia_declarada?: string;
    importancia_declarada?: string;
    objecoes_levantadas?: Array<{ objecao?: string; evidencia?: string }>;
    motivo_compra_ou_nao_compra?: Array<{
      motivo?: string;
      evidencia?: string;
    }>;
  };
  nota_geral?: number;
  justificativa_nota_geral?: string[];
  maiores_acertos?: Array<{
    acerto?: string;
    evidencia?: string;
    porque_importa?: string;
    como_repetir?: string;
  }>;
  maiores_erros?: Array<{
    erro?: string;
    evidencia?: string;
    impacto?: string;
    como_corrigir?: string[];
    frase_pronta?: { antes?: string; depois?: string };
  }>;
  ponto_de_perda_da_venda?: string | null;
  sinais_da_perda?: string[];
  se_vendeu?: {
    porque_comprou?: Array<{ motivo?: string; evidencia?: string }>;
    gatilhos_que_mais_pesaram?: string[];
  };
  analise_por_etapa?: Record<
    string,
    {
      aconteceu?: string;
      nota?: number;
      funcao_cumprida?: string;
      evidencias?: string[];
      ponto_forte?: string[];
      ponto_fraco?: string[];
      erro_de_execucao?: string;
      impacto_no_lead?: string;
      como_corrigir?: string[];
      frase_melhor?: { antes?: string; depois?: string };
    }
  >;
  plano_de_acao_direto?: {
    ajuste_numero_1?: {
      diagnostico?: string;
      o_que_fazer_na_proxima_call?: string[];
      script_30_segundos?: string;
    };
    treino_recomendado?: Array<{
      habilidade?: string;
      como_treinar?: string;
      meta_objetiva?: string;
    }>;
    proxima_acao_com_lead?: {
      status?: string;
      passo?: string;
      mensagem_sugerida_whats?: string;
    };
  };
}

export interface AnalysisMetadata {
  is_partial: boolean;
  chunks_analyzed: number;
  total_chunks: number;
  model_used: string;
  analysis_version: string;
  processing_time_ms: number;
}

// ============================================================
// ERROR HANDLING
// ============================================================

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const handleError = (error: unknown): Response => {
  console.error("Error:", error);

  if (error instanceof ApiError) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        details: error.details,
      }),
      {
        status: error.statusCode,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  if (error instanceof Error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  return new Response(
    JSON.stringify({
      success: false,
      error: "An unexpected error occurred",
    }),
    {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
};

export const successResponse = (data: unknown, status = 200): Response => {
  return new Response(
    JSON.stringify({
      success: true,
      data,
    }),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

export const calculateSHA256 = async (text: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

export const chunkText = (
  text: string,
  maxChunkSize: number
): string[] => {
  const chunks: string[] = [];
  let currentChunk = "";

  const paragraphs = text.split(/\n\n+/);

  for (const paragraph of paragraphs) {
    if ((currentChunk + paragraph).length > maxChunkSize) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }

      if (paragraph.length > maxChunkSize) {
        // Split large paragraphs by sentences
        const sentences = paragraph.split(/(?<=[.!?])\s+/);
        for (const sentence of sentences) {
          if ((currentChunk + sentence).length > maxChunkSize) {
            if (currentChunk) {
              chunks.push(currentChunk.trim());
              currentChunk = "";
            }
            // If single sentence is too long, force split
            if (sentence.length > maxChunkSize) {
              for (let i = 0; i < sentence.length; i += maxChunkSize) {
                chunks.push(sentence.slice(i, i + maxChunkSize));
              }
            } else {
              currentChunk = sentence + " ";
            }
          } else {
            currentChunk += sentence + " ";
          }
        }
      } else {
        currentChunk = paragraph + "\n\n";
      }
    } else {
      currentChunk += paragraph + "\n\n";
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
};

export const getUserFromRequest = async (
  req: Request,
  supabase: SupabaseClient
): Promise<{ id: string; email: string; role: UserRole } | null> => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return null;
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));

  if (error || !user) {
    return null;
  }

  // Get user role from profiles
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  return {
    id: user.id,
    email: user.email || "",
    role: (profile?.role as UserRole) || "closer",
  };
};

export const requireAuth = async (
  req: Request,
  supabase: SupabaseClient,
  allowedRoles?: UserRole[]
): Promise<{ id: string; email: string; role: UserRole }> => {
  const user = await getUserFromRequest(req, supabase);

  if (!user) {
    throw new ApiError(401, "Unauthorized: Please log in");
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    throw new ApiError(403, "Forbidden: Insufficient permissions");
  }

  return user;
};

export const logApiCost = async (
  supabase: SupabaseClient,
  service: string,
  model: string,
  operation: string,
  tokensInput: number,
  tokensOutput: number,
  userId?: string,
  callId?: string,
  metadata?: Record<string, unknown>
): Promise<void> => {
  await supabase.rpc("log_api_cost", {
    _service: service,
    _model: model,
    _operation: operation,
    _tokens_input: tokensInput,
    _tokens_output: tokensOutput,
    _user_id: userId || null,
    _call_id: callId || null,
    _metadata: metadata || null,
  });
};

export const logEvent = async (
  supabase: SupabaseClient,
  level: "info" | "warning" | "error" | "debug",
  service: string,
  operation?: string,
  userId?: string,
  durationMs?: number,
  errorMessage?: string,
  metadata?: Record<string, unknown>
): Promise<void> => {
  await supabase.rpc("log_event", {
    _level: level,
    _service: service,
    _operation: operation || null,
    _user_id: userId || null,
    _duration_ms: durationMs || null,
    _error_message: errorMessage || null,
    _metadata: metadata || null,
  });
};

// ============================================================
// GOOGLE OAUTH HELPERS
// ============================================================

export const getGoogleOAuthConfig = () => {
  return {
    clientId: getEnvVar("GOOGLE_CLIENT_ID"),
    clientSecret: getEnvVar("GOOGLE_CLIENT_SECRET"),
    redirectUri: getEnvVar("GOOGLE_REDIRECT_URI"),
    scopes: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/documents.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ],
  };
};

export const refreshGoogleToken = async (
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: Date }> => {
  const config = getGoogleOAuthConfig();

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new ApiError(400, `Failed to refresh Google token: ${error}`);
  }

  const data = await response.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  return {
    accessToken: data.access_token,
    expiresAt,
  };
};

// ============================================================
// GOOGLE DRIVE HELPERS
// ============================================================

export const fetchDriveFileContent = async (
  accessToken: string,
  fileId: string,
  mimeType: string
): Promise<string> => {
  let exportUrl: string;

  if (mimeType === "application/vnd.google-apps.document") {
    // Google Docs - export as plain text
    exportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
  } else if (
    mimeType === "text/plain" ||
    mimeType.includes("text/") ||
    mimeType.includes("application/vnd.openxmlformats")
  ) {
    // Plain text or docx - download directly
    exportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  } else {
    throw new ApiError(400, `Unsupported file type: ${mimeType}`);
  }

  const response = await fetch(exportUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new ApiError(400, `Failed to fetch Drive file: ${error}`);
  }

  return response.text();
};

export const listDriveFiles = async (
  accessToken: string,
  folderId: string,
  pageToken?: string,
  pageSize = 100
): Promise<{
  files: Array<{
    id: string;
    name: string;
    mimeType: string;
    createdTime: string;
    modifiedTime: string;
    size?: string;
  }>;
  nextPageToken?: string;
}> => {
  const query = `'${folderId}' in parents and trashed = false`;
  const fields =
    "nextPageToken, files(id, name, mimeType, createdTime, modifiedTime, size)";

  let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&pageSize=${pageSize}&orderBy=createdTime desc`;

  if (pageToken) {
    url += `&pageToken=${pageToken}`;
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new ApiError(400, `Failed to list Drive files: ${error}`);
  }

  return response.json();
};
