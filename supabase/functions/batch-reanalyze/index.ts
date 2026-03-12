// batch-reanalyze - Batch reanalysis for calls with score > 0 but zero stage scores
// Bethel Closer - Sales Call Analysis Platform

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  corsHeaders,
  createSupabaseClient,
  createSupabaseAdminClient,
  requireAuth,
  handleError,
  successResponse,
  ApiError,
  logEvent,
} from "../_shared/utils.ts";

interface BatchResult {
  callId: string;
  status: "success" | "error" | "skipped";
  message?: string;
  newScore?: number;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseClient(req.headers.get("Authorization") || undefined);
    const adminClient = createSupabaseAdminClient();

    // Authenticate and require admin role
    const user = await requireAuth(req, supabase, ["admin", "lider"]);

    // Parse request body
    const body = await req.json();
    const {
      limit = 10,
      closerId,
      dryRun = false,
    }: {
      limit?: number;
      closerId?: string;
      dryRun?: boolean;
    } = body;

    // Validate limit
    if (limit < 1 || limit > 50) {
      throw new ApiError(400, "Limit must be between 1 and 50");
    }

    // Build query to find calls that need reanalysis
    // Criteria: has score > 0 but technical_analysis.stage_scores is empty or missing
    let query = adminClient
      .from("calls")
      .select("id, closer_id, transcription, score, technical_analysis")
      .not("transcription", "is", null)
      .gt("score", 0)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (closerId) {
      query = query.eq("closer_id", closerId);
    }

    const { data: calls, error: queryError } = await query;

    if (queryError) {
      throw new ApiError(500, `Failed to query calls: ${queryError.message}`);
    }

    // Filter calls that have empty or zero stage scores
    const callsToReanalyze = (calls || []).filter((call) => {
      const stageScores = call.technical_analysis?.stage_scores;
      if (!stageScores || typeof stageScores !== "object") {
        return true; // No stage scores at all
      }
      const scores = Object.values(stageScores) as number[];
      const hasAllZeros = scores.every((s) => s === 0 || s === null || s === undefined);
      return hasAllZeros || scores.length === 0;
    });

    if (dryRun) {
      return successResponse({
        dryRun: true,
        callsFound: callsToReanalyze.length,
        callIds: callsToReanalyze.map((c) => c.id),
      });
    }

    const results: BatchResult[] = [];
    const authHeader = req.headers.get("Authorization");
    const analyzeUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/analyze-call`;

    // Process calls sequentially to avoid rate limits
    for (const call of callsToReanalyze) {
      try {
        if (!call.transcription) {
          results.push({
            callId: call.id,
            status: "skipped",
            message: "No transcription",
          });
          continue;
        }

        const analyzeResponse = await fetch(analyzeUrl, {
          method: "POST",
          headers: {
            Authorization: authHeader || "",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            callId: call.id,
            transcription: call.transcription,
          }),
        });

        if (!analyzeResponse.ok) {
          const errorText = await analyzeResponse.text();
          results.push({
            callId: call.id,
            status: "error",
            message: errorText,
          });
          continue;
        }

        const result = await analyzeResponse.json();
        results.push({
          callId: call.id,
          status: "success",
          newScore: result.data?.score,
        });

        // Small delay to avoid overwhelming the API
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        results.push({
          callId: call.id,
          status: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Log batch operation
    const successful = results.filter((r) => r.status === "success").length;
    const failed = results.filter((r) => r.status === "error").length;
    const skipped = results.filter((r) => r.status === "skipped").length;

    await logEvent(
      adminClient,
      "info",
      "batch-reanalyze",
      "complete",
      user.id,
      undefined,
      undefined,
      {
        total: results.length,
        successful,
        failed,
        skipped,
        closer_id: closerId,
      }
    );

    return successResponse({
      processed: results.length,
      successful,
      failed,
      skipped,
      results,
    });
  } catch (error) {
    return handleError(error);
  }
});
