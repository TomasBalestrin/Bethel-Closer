// process-user-files - Process pending files with claim_pending_files()
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
  fetchDriveFileContent,
  refreshGoogleToken,
  calculateSHA256,
} from "../_shared/utils.ts";

interface ProcessResult {
  fileId: string;
  fileName: string;
  status: "success" | "error" | "duplicate" | "skipped";
  callId?: string;
  error?: string;
}

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
    const { maxFiles = 5 }: { maxFiles?: number } = body;

    // Validate maxFiles
    if (maxFiles < 1 || maxFiles > 10) {
      throw new ApiError(400, "maxFiles must be between 1 and 10");
    }

    // Get user's profile with Google credentials
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(
        "id, google_connected, google_access_token, google_refresh_token, google_token_expires_at"
      )
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile) {
      throw new ApiError(500, "Failed to get user profile");
    }

    if (!profile.google_connected || !profile.google_access_token) {
      throw new ApiError(400, "Google Drive not connected");
    }

    // Check if token needs refresh
    let accessToken = profile.google_access_token;
    const tokenExpires = new Date(profile.google_token_expires_at || 0);

    if (tokenExpires < new Date()) {
      if (!profile.google_refresh_token) {
        throw new ApiError(400, "Google token expired. Please reconnect your Google account.");
      }

      const { accessToken: newToken, expiresAt } = await refreshGoogleToken(
        profile.google_refresh_token
      );

      accessToken = newToken;

      await adminClient
        .from("profiles")
        .update({
          google_access_token: newToken,
          google_token_expires_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", profile.id);
    }

    // Claim pending files atomically
    const { data: claimedFiles, error: claimError } = await adminClient.rpc(
      "claim_pending_files",
      {
        _user_id: user.id,
        _max_files: maxFiles,
      }
    );

    if (claimError) {
      throw new ApiError(500, `Failed to claim files: ${claimError.message}`);
    }

    if (!claimedFiles || claimedFiles.length === 0) {
      return successResponse({
        processed: 0,
        message: "No pending files to process",
      });
    }

    const results: ProcessResult[] = [];
    const authHeader = req.headers.get("Authorization");
    const analyzeUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/analyze-call`;

    // Process each claimed file
    for (const file of claimedFiles) {
      try {
        // Fetch file content
        const transcription = await fetchDriveFileContent(
          accessToken,
          file.drive_file_id,
          file.file_type
        );

        if (!transcription || transcription.length < 100) {
          results.push({
            fileId: file.drive_file_id,
            fileName: file.file_name,
            status: "skipped",
            error: "File content too short",
          });

          await adminClient
            .from("imported_files")
            .update({
              status: "error",
              error_message: "File content too short or empty",
            })
            .eq("id", file.id);

          continue;
        }

        // Calculate content hash
        const contentHash = await calculateSHA256(transcription);

        // Check for duplicate
        const { data: existingCall } = await adminClient
          .from("calls")
          .select("id")
          .eq("closer_id", profile.id)
          .eq("content_hash", contentHash)
          .single();

        if (existingCall) {
          results.push({
            fileId: file.drive_file_id,
            fileName: file.file_name,
            status: "duplicate",
            callId: existingCall.id,
          });

          await adminClient
            .from("imported_files")
            .update({
              status: "completed",
              call_id: existingCall.id,
              content_hash: contentHash,
              error_message: "Duplicate - linked to existing call",
              completed_at: new Date().toISOString(),
            })
            .eq("id", file.id);

          continue;
        }

        // Extract metadata from filename
        const clientName = extractClientName(file.file_name);
        const callDate = extractDate(file.file_name);

        // Create call record
        const { data: newCall, error: insertError } = await adminClient
          .from("calls")
          .insert({
            closer_id: profile.id,
            client_name: clientName,
            call_date: callDate || new Date().toISOString().split("T")[0],
            transcription: transcription,
            content_hash: contentHash,
            status: "completed",
            prd_status: "pendente",
            source_file_id: file.drive_file_id,
            google_doc_id: file.drive_file_id,
            notes: `Imported from: ${file.file_name}`,
            scheduled_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (insertError || !newCall) {
          throw new Error(`Failed to create call: ${insertError?.message}`);
        }

        // Update import record
        await adminClient
          .from("imported_files")
          .update({
            call_id: newCall.id,
            content_hash: contentHash,
          })
          .eq("id", file.id);

        // Trigger analysis
        const analyzeResponse = await fetch(analyzeUrl, {
          method: "POST",
          headers: {
            Authorization: authHeader || "",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            callId: newCall.id,
            transcription: transcription,
          }),
        });

        if (analyzeResponse.ok) {
          await adminClient
            .from("imported_files")
            .update({
              status: "completed",
              completed_at: new Date().toISOString(),
            })
            .eq("id", file.id);

          results.push({
            fileId: file.drive_file_id,
            fileName: file.file_name,
            status: "success",
            callId: newCall.id,
          });
        } else {
          const errorText = await analyzeResponse.text();

          await adminClient
            .from("imported_files")
            .update({
              status: "error",
              error_message: `Analysis failed: ${errorText}`,
            })
            .eq("id", file.id);

          results.push({
            fileId: file.drive_file_id,
            fileName: file.file_name,
            status: "error",
            callId: newCall.id,
            error: errorText,
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";

        await adminClient
          .from("imported_files")
          .update({
            status: "error",
            error_message: errorMessage,
            retry_count: (file.retry_count || 0) + 1,
          })
          .eq("id", file.id);

        results.push({
          fileId: file.drive_file_id,
          fileName: file.file_name,
          status: "error",
          error: errorMessage,
        });
      }
    }

    // Log processing
    const successful = results.filter((r) => r.status === "success").length;
    const duplicates = results.filter((r) => r.status === "duplicate").length;
    const errors = results.filter((r) => r.status === "error").length;

    await logEvent(
      adminClient,
      "info",
      "process-user-files",
      "complete",
      user.id,
      undefined,
      undefined,
      {
        processed: results.length,
        successful,
        duplicates,
        errors,
      }
    );

    return successResponse({
      processed: results.length,
      successful,
      duplicates,
      errors,
      results,
    });
  } catch (error) {
    return handleError(error);
  }
});

function extractClientName(fileName: string): string | null {
  const nameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
  const parts = nameWithoutExt.split(/[-_]/);

  for (const part of parts) {
    const cleaned = part.trim();
    if (cleaned.length > 2 && /^[A-Za-z\s]+$/.test(cleaned)) {
      return cleaned;
    }
  }

  return null;
}

function extractDate(fileName: string): string | null {
  const datePatterns = [
    /(\d{4}[-/]\d{2}[-/]\d{2})/,
    /(\d{2}[-/]\d{2}[-/]\d{4})/,
    /(\d{8})/,
  ];

  for (const pattern of datePatterns) {
    const match = fileName.match(pattern);
    if (match) {
      const dateStr = match[1];
      if (dateStr.length === 8) {
        return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
      }
      const parts = dateStr.split(/[-/]/);
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
      } else {
        return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
      }
    }
  }

  return null;
}
