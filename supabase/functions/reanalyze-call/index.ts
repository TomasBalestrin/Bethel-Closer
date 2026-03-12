// reanalyze-call - Reanalyze an existing call with fresh AI analysis
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
  Framework,
  FRAMEWORKS,
} from "../_shared/utils.ts";

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseClient(req.headers.get("Authorization") || undefined);
    const adminClient = createSupabaseAdminClient();

    // Authenticate user
    const user = await requireAuth(req, supabase);

    // Parse request body
    const body = await req.json();
    const {
      callId,
      forceFramework,
    }: {
      callId: string;
      forceFramework?: Framework;
    } = body;

    if (!callId) {
      throw new ApiError(400, "callId is required");
    }

    // Validate forceFramework if provided
    if (forceFramework && !FRAMEWORKS.includes(forceFramework)) {
      throw new ApiError(
        400,
        `Invalid framework. Must be one of: ${FRAMEWORKS.join(", ")}`
      );
    }

    // Get the call with transcription
    const { data: call, error: callError } = await supabase
      .from("calls")
      .select("id, closer_id, transcription, ai_analysis")
      .eq("id", callId)
      .single();

    if (callError || !call) {
      throw new ApiError(404, "Call not found");
    }

    // Check if user has access to this call
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("user_id", user.id)
      .single();

    const isAdmin = profile?.role === "admin" || profile?.role === "lider";
    const isOwner = call.closer_id === profile?.id;

    if (!isAdmin && !isOwner) {
      throw new ApiError(403, "You don't have access to this call");
    }

    // Check if transcription exists
    if (!call.transcription) {
      throw new ApiError(400, "Call has no transcription to analyze");
    }

    // Backup current analysis
    if (call.ai_analysis) {
      await adminClient.from("calls_backup").insert({
        call_id: callId,
        data: {
          ai_analysis: call.ai_analysis,
          backed_up_reason: "reanalysis",
        },
        operation: "UPDATE",
        backed_up_by: user.id,
      });
    }

    // Call the analyze-call function
    const analyzeUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/analyze-call`;
    const authHeader = req.headers.get("Authorization");

    const analyzeResponse = await fetch(analyzeUrl, {
      method: "POST",
      headers: {
        Authorization: authHeader || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        callId,
        transcription: call.transcription,
        forceFramework,
      }),
    });

    if (!analyzeResponse.ok) {
      const errorText = await analyzeResponse.text();
      throw new ApiError(500, `Reanalysis failed: ${errorText}`);
    }

    const result = await analyzeResponse.json();

    // Log the reanalysis
    await logEvent(
      adminClient,
      "info",
      "reanalyze-call",
      "complete",
      user.id,
      undefined,
      undefined,
      {
        call_id: callId,
        forced_framework: forceFramework || null,
        new_score: result.data?.score,
      }
    );

    return successResponse({
      ...result.data,
      reanalyzed: true,
      previousAnalysisBackedUp: !!call.ai_analysis,
    });
  } catch (error) {
    return handleError(error);
  }
});
