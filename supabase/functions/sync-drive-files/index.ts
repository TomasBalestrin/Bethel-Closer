// sync-drive-files - Sync new files from Google Drive folder
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

    // Get user's profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(
        "id, drive_folder_id, google_connected, google_access_token, google_refresh_token, google_token_expires_at, last_sync_at, import_file_types, import_name_patterns"
      )
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile) {
      throw new ApiError(500, "Failed to get user profile");
    }

    if (!profile.google_connected || !profile.google_access_token) {
      throw new ApiError(400, "Google Drive not connected");
    }

    if (!profile.drive_folder_id) {
      throw new ApiError(400, "No Drive folder configured");
    }

    // Refresh token if needed
    let accessToken = profile.google_access_token;
    const tokenExpires = new Date(profile.google_token_expires_at || 0);

    if (tokenExpires < new Date()) {
      if (!profile.google_refresh_token) {
        throw new ApiError(400, "Token expired. Please reconnect.");
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
        })
        .eq("id", profile.id);
    }

    // Get existing imported file IDs
    const { data: existingImports } = await adminClient
      .from("imported_files")
      .select("drive_file_id")
      .eq("user_id", user.id);

    const importedFileIds = new Set(
      (existingImports || []).map((i) => i.drive_file_id)
    );

    // List files from Drive - only get files modified since last sync
    const { files } = await listDriveFiles(
      accessToken,
      profile.drive_folder_id,
      undefined,
      100
    );

    // Filter to new files only
    const supportedMimeTypes = [
      "application/vnd.google-apps.document",
      "text/plain",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    const fileTypes = profile.import_file_types || ["txt", "docx"];
    const namePatterns = profile.import_name_patterns || [];

    const newFiles = files.filter((file) => {
      // Not already imported
      if (importedFileIds.has(file.id)) return false;

      // Check mime type
      if (!supportedMimeTypes.includes(file.mimeType)) return false;

      // Check file extension
      const ext = file.name.split(".").pop()?.toLowerCase();
      const extOk =
        fileTypes.length === 0 ||
        fileTypes.includes(ext || "") ||
        file.mimeType === "application/vnd.google-apps.document";

      if (!extOk) return false;

      // Check name patterns
      if (namePatterns.length > 0) {
        const nameOk = namePatterns.some((pattern: string) => {
          try {
            return new RegExp(pattern, "i").test(file.name);
          } catch {
            return file.name.toLowerCase().includes(pattern.toLowerCase());
          }
        });
        if (!nameOk) return false;
      }

      // Check if modified after last sync
      if (profile.last_sync_at) {
        const lastSync = new Date(profile.last_sync_at);
        const fileModified = new Date(file.modifiedTime);
        if (fileModified < lastSync) return false;
      }

      return true;
    });

    // Queue new files for import
    if (newFiles.length > 0) {
      const filesToInsert = newFiles.map((file) => ({
        user_id: user.id,
        drive_file_id: file.id,
        file_name: file.name,
        file_type: file.mimeType,
        file_size: file.size ? parseInt(file.size, 10) : null,
        status: "pending" as const,
      }));

      await adminClient.from("imported_files").insert(filesToInsert);
    }

    // Update last sync timestamp
    await adminClient
      .from("profiles")
      .update({
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id);

    // Log sync
    await logEvent(
      adminClient,
      "info",
      "sync-drive-files",
      "complete",
      user.id,
      undefined,
      undefined,
      {
        total_files: files.length,
        new_files: newFiles.length,
        already_imported: importedFileIds.size,
      }
    );

    return successResponse({
      synced: true,
      totalFilesInFolder: files.length,
      newFilesQueued: newFiles.length,
      alreadyImported: importedFileIds.size,
      newFiles: newFiles.map((f) => ({
        id: f.id,
        name: f.name,
        modifiedTime: f.modifiedTime,
      })),
    });
  } catch (error) {
    return handleError(error);
  }
});
