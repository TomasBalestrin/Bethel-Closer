// manual-analyze - Manual analysis from pasted transcription
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
      transcription,
      clientName,
      callDate,
      product,
      forceFramework,
      notes,
    }: {
      transcription: string;
      clientName?: string;
      callDate?: string;
      product?: string;
      forceFramework?: Framework;
      notes?: string;
    } = body;

    if (!transcription) {
      throw new ApiError(400, "transcription is required");
    }

    if (transcription.length < 100) {
      throw new ApiError(400, "Transcription is too short. Minimum 100 characters required.");
    }

    // Validate forceFramework if provided
    if (forceFramework && !FRAMEWORKS.includes(forceFramework)) {
      throw new ApiError(
        400,
        `Invalid framework. Must be one of: ${FRAMEWORKS.join(", ")}`
      );
    }

    // Get user's profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile) {
      throw new ApiError(500, "Failed to get user profile");
    }

    // Calculate content hash for deduplication
    const contentHash = await calculateSHA256(transcription);

    // Check for duplicate transcription
    const { data: existingCall } = await supabase
      .from("calls")
      .select("id, client_name, call_date")
      .eq("closer_id", profile.id)
      .eq("content_hash", contentHash)
      .single();

    if (existingCall) {
      throw new ApiError(
        409,
        `Duplicate transcription. Already exists as call for ${existingCall.client_name || "unknown client"} on ${existingCall.call_date || "unknown date"}`
      );
    }

    // Create a new call record
    const callData = {
      closer_id: profile.id,
      client_name: clientName || null,
      call_date: callDate || new Date().toISOString().split("T")[0],
      product: product || null,
      transcription: transcription,
      content_hash: contentHash,
      status: "completed",
      prd_status: "pendente",
      notes: notes || "Imported via manual paste",
      source_file_id: null,
      scheduled_at: new Date().toISOString(),
    };

    const { data: newCall, error: insertError } = await adminClient
      .from("calls")
      .insert(callData)
      .select("id")
      .single();

    if (insertError || !newCall) {
      throw new ApiError(500, `Failed to create call: ${insertError?.message}`);
    }

    // Trigger analysis
    const analyzeUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/analyze-call`;
    const authHeader = req.headers.get("Authorization");

    const analyzeResponse = await fetch(analyzeUrl, {
      method: "POST",
      headers: {
        Authorization: authHeader || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        callId: newCall.id,
        transcription: transcription,
        forceFramework,
      }),
    });

    let analysisResult = null;
    let analysisError = null;

    if (analyzeResponse.ok) {
      analysisResult = await analyzeResponse.json();
    } else {
      analysisError = await analyzeResponse.text();
      console.error("Analysis failed:", analysisError);
    }

    // Log the manual import
    await logEvent(
      adminClient,
      "info",
      "manual-analyze",
      "complete",
      user.id,
      undefined,
      undefined,
      {
        call_id: newCall.id,
        client_name: clientName,
        transcription_length: transcription.length,
        analysis_success: analyzeResponse.ok,
      }
    );

    return successResponse({
      callId: newCall.id,
      clientName,
      callDate: callData.call_date,
      transcriptionLength: transcription.length,
      analysisResult: analysisResult?.data || null,
      analysisError: analysisError,
      analysisSuccessful: analyzeResponse.ok,
    });
  } catch (error) {
    return handleError(error);
  }
});
