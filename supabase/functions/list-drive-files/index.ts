// list-drive-files - List files in Google Drive folder
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
      folderId,
      pageToken,
      pageSize = 50,
    }: {
      folderId?: string;
      pageToken?: string;
      pageSize?: number;
    } = body;

    // Get user's profile
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
      throw new ApiError(400, "Google Drive not connected");
    }

    const targetFolderId = folderId || profile.drive_folder_id;

    if (!targetFolderId) {
      throw new ApiError(400, "No folder specified and no default folder configured");
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

    // List files
    const result = await listDriveFiles(
      accessToken,
      targetFolderId,
      pageToken,
      Math.min(pageSize, 100)
    );

    // Get import status for files
    const fileIds = result.files.map((f) => f.id);
    const { data: importedFiles } = await adminClient
      .from("imported_files")
      .select("drive_file_id, status, call_id")
      .eq("user_id", user.id)
      .in("drive_file_id", fileIds);

    const importStatusMap = new Map(
      (importedFiles || []).map((f) => [f.drive_file_id, f])
    );

    // Add import status to files
    const filesWithStatus = result.files.map((file) => ({
      ...file,
      importStatus: importStatusMap.get(file.id)?.status || null,
      callId: importStatusMap.get(file.id)?.call_id || null,
    }));

    return successResponse({
      folderId: targetFolderId,
      files: filesWithStatus,
      nextPageToken: result.nextPageToken,
      totalFiles: result.files.length,
    });
  } catch (error) {
    return handleError(error);
  }
});
