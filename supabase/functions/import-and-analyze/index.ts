// import-and-analyze - Import file from Google Drive + create call + analyze
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
  fetchDriveFileContent,
  refreshGoogleToken,
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
      driveFileId,
      fileName,
      mimeType,
      forceFramework,
    }: {
      driveFileId: string;
      fileName?: string;
      mimeType?: string;
      forceFramework?: Framework;
    } = body;

    if (!driveFileId) {
      throw new ApiError(400, "driveFileId is required");
    }

    // Validate forceFramework if provided
    if (forceFramework && !FRAMEWORKS.includes(forceFramework)) {
      throw new ApiError(
        400,
        `Invalid framework. Must be one of: ${FRAMEWORKS.join(", ")}`
      );
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
      throw new ApiError(400, "Google Drive not connected. Please connect your Google account first.");
    }

    // Check if token needs refresh
    let accessToken = profile.google_access_token;
    const tokenExpires = new Date(profile.google_token_expires_at || 0);

    if (tokenExpires < new Date()) {
      if (!profile.google_refresh_token) {
        throw new ApiError(400, "Google token expired. Please reconnect your Google account.");
      }

      // Refresh the token
      const { accessToken: newToken, expiresAt } = await refreshGoogleToken(
        profile.google_refresh_token
      );

      accessToken = newToken;

      // Update the stored token
      await adminClient
        .from("profiles")
        .update({
          google_access_token: newToken,
          google_token_expires_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", profile.id);
    }

    // Check if file was already imported
    const { data: existingImport } = await adminClient
      .from("imported_files")
      .select("id, call_id, status")
      .eq("drive_file_id", driveFileId)
      .single();

    if (existingImport && existingImport.status === "completed") {
      return successResponse({
        alreadyImported: true,
        callId: existingImport.call_id,
        message: "This file has already been imported",
      });
    }

    // Determine mime type
    const fileMimeType =
      mimeType ||
      (fileName?.endsWith(".docx")
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : fileName?.endsWith(".txt")
          ? "text/plain"
          : "application/vnd.google-apps.document");

    // Fetch file content from Google Drive
    const transcription = await fetchDriveFileContent(
      accessToken,
      driveFileId,
      fileMimeType
    );

    if (!transcription || transcription.length < 100) {
      throw new ApiError(400, "File content is too short or empty");
    }

    // Calculate content hash
    const contentHash = await calculateSHA256(transcription);

    // Check for duplicate content
    const { data: existingCall } = await supabase
      .from("calls")
      .select("id, client_name")
      .eq("closer_id", profile.id)
      .eq("content_hash", contentHash)
      .single();

    if (existingCall) {
      // Update import record as duplicate
      if (existingImport) {
        await adminClient
          .from("imported_files")
          .update({
            status: "completed",
            call_id: existingCall.id,
            content_hash: contentHash,
            error_message: "Duplicate content - linked to existing call",
            completed_at: new Date().toISOString(),
          })
          .eq("id", existingImport.id);
      }

      return successResponse({
        duplicate: true,
        existingCallId: existingCall.id,
        message: `Duplicate content found. Already exists as call for ${existingCall.client_name || "unknown client"}`,
      });
    }

    // Extract client name from filename
    const extractedClientName = extractClientNameFromFileName(fileName || "");
    const extractedCallDate = extractDateFromFileName(fileName || "");

    // Create call record
    const callData = {
      closer_id: profile.id,
      client_name: extractedClientName || null,
      call_date: extractedCallDate || new Date().toISOString().split("T")[0],
      transcription: transcription,
      content_hash: contentHash,
      status: "completed",
      prd_status: "pendente",
      source_file_id: driveFileId,
      google_doc_id: driveFileId,
      notes: `Imported from Google Drive: ${fileName || driveFileId}`,
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

    // Create or update import record
    const importData = {
      user_id: user.id,
      drive_file_id: driveFileId,
      file_name: fileName || driveFileId,
      file_type: fileMimeType,
      status: "processing" as const,
      call_id: newCall.id,
      content_hash: contentHash,
      started_processing_at: new Date().toISOString(),
    };

    if (existingImport) {
      await adminClient
        .from("imported_files")
        .update(importData)
        .eq("id", existingImport.id);
    } else {
      await adminClient.from("imported_files").insert(importData);
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

      // Update import record as completed
      await adminClient
        .from("imported_files")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("drive_file_id", driveFileId);
    } else {
      analysisError = await analyzeResponse.text();

      // Update import record with error
      await adminClient
        .from("imported_files")
        .update({
          status: "error",
          error_message: analysisError,
        })
        .eq("drive_file_id", driveFileId);
    }

    // Log the import
    await logEvent(
      adminClient,
      "info",
      "import-and-analyze",
      "complete",
      user.id,
      undefined,
      undefined,
      {
        call_id: newCall.id,
        drive_file_id: driveFileId,
        file_name: fileName,
        transcription_length: transcription.length,
        analysis_success: analyzeResponse.ok,
      }
    );

    return successResponse({
      callId: newCall.id,
      driveFileId,
      fileName,
      clientName: extractedClientName,
      callDate: callData.call_date,
      transcriptionLength: transcription.length,
      analysisResult: analysisResult?.data || null,
      analysisError,
      analysisSuccessful: analyzeResponse.ok,
    });
  } catch (error) {
    return handleError(error);
  }
});

// Helper function to extract client name from filename
function extractClientNameFromFileName(fileName: string): string | null {
  // Remove extension
  const nameWithoutExt = fileName.replace(/\.[^/.]+$/, "");

  // Common patterns:
  // "Call - John Smith - 2024-01-15"
  // "John Smith 15-01-2024"
  // "20240115_John_Smith"

  // Try pattern: "Call - Name - Date" or "Name - Date"
  const dashPattern = nameWithoutExt.match(/(?:Call\s*-\s*)?([^-]+?)(?:\s*-\s*\d{2,4}[-/]\d{2}[-/]\d{2,4})?$/i);
  if (dashPattern && dashPattern[1]) {
    const name = dashPattern[1].trim();
    if (name.length > 2 && !/^\d+$/.test(name)) {
      return name;
    }
  }

  // Try pattern: "Date_Name" or "Name_Date"
  const underscorePattern = nameWithoutExt.match(/(?:\d{8}_)?([A-Za-z][A-Za-z_\s]+?)(?:_\d{8})?$/);
  if (underscorePattern && underscorePattern[1]) {
    const name = underscorePattern[1].replace(/_/g, " ").trim();
    if (name.length > 2) {
      return name;
    }
  }

  return null;
}

// Helper function to extract date from filename
function extractDateFromFileName(fileName: string): string | null {
  // Try different date patterns
  const patterns = [
    /(\d{4}[-/]\d{2}[-/]\d{2})/, // YYYY-MM-DD or YYYY/MM/DD
    /(\d{2}[-/]\d{2}[-/]\d{4})/, // DD-MM-YYYY or DD/MM/YYYY
    /(\d{8})/, // YYYYMMDD
  ];

  for (const pattern of patterns) {
    const match = fileName.match(pattern);
    if (match) {
      const dateStr = match[1];

      // Parse and format as YYYY-MM-DD
      if (dateStr.length === 8) {
        // YYYYMMDD
        return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
      } else if (dateStr.includes("-") || dateStr.includes("/")) {
        const parts = dateStr.split(/[-/]/);
        if (parts[0].length === 4) {
          // YYYY-MM-DD
          return `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
        } else {
          // DD-MM-YYYY
          return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
        }
      }
    }
  }

  return null;
}
