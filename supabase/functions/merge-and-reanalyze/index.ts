// merge-and-reanalyze - Merge 2 calls and reanalyze as one
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
  calculateSHA256,
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
      primaryCallId,
      secondaryCallId,
      mergeStrategy = "append",
    }: {
      primaryCallId: string;
      secondaryCallId: string;
      mergeStrategy?: "append" | "prepend";
    } = body;

    if (!primaryCallId || !secondaryCallId) {
      throw new ApiError(400, "Both primaryCallId and secondaryCallId are required");
    }

    if (primaryCallId === secondaryCallId) {
      throw new ApiError(400, "Cannot merge a call with itself");
    }

    // Get both calls
    const { data: primaryCall, error: primaryError } = await supabase
      .from("calls")
      .select("*")
      .eq("id", primaryCallId)
      .single();

    if (primaryError || !primaryCall) {
      throw new ApiError(404, "Primary call not found");
    }

    const { data: secondaryCall, error: secondaryError } = await supabase
      .from("calls")
      .select("*")
      .eq("id", secondaryCallId)
      .single();

    if (secondaryError || !secondaryCall) {
      throw new ApiError(404, "Secondary call not found");
    }

    // Check if user has access to both calls
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("user_id", user.id)
      .single();

    const isAdmin = profile?.role === "admin" || profile?.role === "lider";
    const ownsCallPrimary = primaryCall.closer_id === profile?.id;
    const ownsSecondary = secondaryCall.closer_id === profile?.id;

    if (!isAdmin && (!ownsCallPrimary || !ownsSecondary)) {
      throw new ApiError(403, "You don't have access to both calls");
    }

    // Check if calls have transcriptions
    if (!primaryCall.transcription && !secondaryCall.transcription) {
      throw new ApiError(400, "At least one call must have a transcription");
    }

    // Merge transcriptions
    let mergedTranscription: string;
    const separator = "\n\n---[PARTE 2 DA CALL]---\n\n";

    if (mergeStrategy === "prepend") {
      mergedTranscription = [
        secondaryCall.transcription || "",
        separator,
        primaryCall.transcription || "",
      ]
        .filter(Boolean)
        .join("");
    } else {
      mergedTranscription = [
        primaryCall.transcription || "",
        separator,
        secondaryCall.transcription || "",
      ]
        .filter(Boolean)
        .join("");
    }

    // Backup both calls before merge
    await adminClient.from("calls_backup").insert([
      {
        call_id: primaryCallId,
        data: primaryCall,
        operation: "UPDATE",
        backed_up_by: user.id,
      },
      {
        call_id: secondaryCallId,
        data: secondaryCall,
        operation: "UPDATE",
        backed_up_by: user.id,
      },
    ]);

    // Calculate new content hash
    const contentHash = await calculateSHA256(mergedTranscription);

    // Update primary call with merged transcription
    const { error: updateError } = await adminClient
      .from("calls")
      .update({
        transcription: mergedTranscription,
        content_hash: contentHash,
        merged_with_call_id: secondaryCallId,
        duration_minutes:
          (primaryCall.duration_minutes || 0) + (secondaryCall.duration_minutes || 0),
        notes: `${primaryCall.notes || ""}\n[Merged with call ${secondaryCallId}]\n${secondaryCall.notes || ""}`.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", primaryCallId);

    if (updateError) {
      throw new ApiError(500, `Failed to update primary call: ${updateError.message}`);
    }

    // Mark secondary call as merged (soft delete)
    await adminClient
      .from("calls")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: user.id,
        notes: `[Merged into call ${primaryCallId}] ${secondaryCall.notes || ""}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", secondaryCallId);

    // Trigger reanalysis
    const analyzeUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/analyze-call`;
    const authHeader = req.headers.get("Authorization");

    const analyzeResponse = await fetch(analyzeUrl, {
      method: "POST",
      headers: {
        Authorization: authHeader || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        callId: primaryCallId,
        transcription: mergedTranscription,
      }),
    });

    let analysisResult = null;
    if (analyzeResponse.ok) {
      analysisResult = await analyzeResponse.json();
    }

    // Log the merge
    await logEvent(
      adminClient,
      "info",
      "merge-and-reanalyze",
      "complete",
      user.id,
      undefined,
      undefined,
      {
        primary_call_id: primaryCallId,
        secondary_call_id: secondaryCallId,
        merge_strategy: mergeStrategy,
        new_score: analysisResult?.data?.score,
      }
    );

    return successResponse({
      mergedCallId: primaryCallId,
      mergedFromCallId: secondaryCallId,
      mergeStrategy,
      totalCharacters: mergedTranscription.length,
      analysisResult: analysisResult?.data || null,
      reanalysisSuccessful: analyzeResponse.ok,
    });
  } catch (error) {
    return handleError(error);
  }
});
