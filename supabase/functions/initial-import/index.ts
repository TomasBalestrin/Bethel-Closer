// initial-import - Initial Drive scan, populate imported_files queue
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
  listDriveFiles,
  refreshGoogleToken,
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
      maxFiles = 100,
      fileTypes = ["txt", "docx"],
      namePatterns = [],
    }: {
      maxFiles?: number;
      fileTypes?: string[];
      namePatterns?: string[];
    } = body;

    // Get user's profile with Google credentials
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(
        "id, drive_folder_id, google_connected, google_access_token, google_refresh_token, google_token_expires_at"
      )
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile) {
      throw new ApiError(500, "Failed to get user profile");
    }

    if (!profile.google_connected || !profile.google_access_token) {
      throw new ApiError(400, "Google Drive not connected. Please connect your Google account first.");
    }

    if (!profile.drive_folder_id) {
      throw new ApiError(400, "No Drive folder configured. Please select a folder in settings.");
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

    // Create import session
    const { data: session, error: sessionError } = await adminClient
      .from("user_import_sessions")
      .insert({
        user_id: user.id,
        session_type: "initial",
        metadata: { fileTypes, namePatterns, maxFiles },
      })
      .select("id")
      .single();

    if (sessionError || !session) {
      throw new ApiError(500, "Failed to create import session");
    }

    // Get already imported file IDs
    const { data: existingImports } = await adminClient
      .from("imported_files")
      .select("drive_file_id")
      .eq("user_id", user.id);

    const importedFileIds = new Set(
      (existingImports || []).map((i) => i.drive_file_id)
    );

    // List files from Drive folder
    let allFiles: Array<{
      id: string;
      name: string;
      mimeType: string;
      createdTime: string;
      modifiedTime: string;
      size?: string;
    }> = [];
    let pageToken: string | undefined;

    do {
      const result = await listDriveFiles(
        accessToken,
        profile.drive_folder_id,
        pageToken,
        100
      );

      allFiles = allFiles.concat(result.files);
      pageToken = result.nextPageToken;
    } while (pageToken && allFiles.length < maxFiles * 2); // Fetch extra in case of filtering

    // Filter files
    const supportedMimeTypes = [
      "application/vnd.google-apps.document",
      "text/plain",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    let filteredFiles = allFiles.filter((file) => {
      // Check mime type
      const mimeTypeOk = supportedMimeTypes.includes(file.mimeType);

      // Check file extension
      const ext = file.name.split(".").pop()?.toLowerCase();
      const extOk =
        fileTypes.length === 0 ||
        fileTypes.includes(ext || "") ||
        file.mimeType === "application/vnd.google-apps.document";

      // Check name patterns
      const nameOk =
        namePatterns.length === 0 ||
        namePatterns.some((pattern) => {
          try {
            return new RegExp(pattern, "i").test(file.name);
          } catch {
            return file.name.toLowerCase().includes(pattern.toLowerCase());
          }
        });

      // Not already imported
      const notImported = !importedFileIds.has(file.id);

      return mimeTypeOk && extOk && nameOk && notImported;
    });

    // Limit files
    filteredFiles = filteredFiles.slice(0, maxFiles);

    // Insert files into queue
    const filesToInsert = filteredFiles.map((file) => ({
      user_id: user.id,
      drive_file_id: file.id,
      file_name: file.name,
      file_type: file.mimeType,
      file_size: file.size ? parseInt(file.size, 10) : null,
      status: "pending" as const,
    }));

    if (filesToInsert.length > 0) {
      const { error: insertError } = await adminClient
        .from("imported_files")
        .insert(filesToInsert);

      if (insertError) {
        throw new ApiError(500, `Failed to queue files: ${insertError.message}`);
      }
    }

    // Update session
    await adminClient
      .from("user_import_sessions")
      .update({
        files_found: filteredFiles.length,
        metadata: {
          fileTypes,
          namePatterns,
          maxFiles,
          totalScanned: allFiles.length,
          alreadyImported: importedFileIds.size,
        },
      })
      .eq("id", session.id);

    // Log the initial import
    await logEvent(
      adminClient,
      "info",
      "initial-import",
      "complete",
      user.id,
      undefined,
      undefined,
      {
        session_id: session.id,
        files_queued: filteredFiles.length,
        total_scanned: allFiles.length,
        already_imported: importedFileIds.size,
      }
    );

    return successResponse({
      sessionId: session.id,
      filesQueued: filteredFiles.length,
      totalScanned: allFiles.length,
      alreadyImported: importedFileIds.size,
      files: filteredFiles.map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        createdTime: f.createdTime,
      })),
    });
  } catch (error) {
    return handleError(error);
  }
});
