// fetch-drive-document - Fetch Google Docs/Drive content
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
  fetchDriveFileContent,
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
      fileId,
      mimeType,
    }: {
      fileId: string;
      mimeType?: string;
    } = body;

    if (!fileId) {
      throw new ApiError(400, "fileId is required");
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

    // Get file metadata if mimeType not provided
    let fileMimeType = mimeType;
    let fileName = "";

    if (!fileMimeType) {
      const metadataResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType,name`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!metadataResponse.ok) {
        throw new ApiError(404, "File not found or inaccessible");
      }

      const metadata = await metadataResponse.json();
      fileMimeType = metadata.mimeType;
      fileName = metadata.name;
    }

    // Fetch file content
    const content = await fetchDriveFileContent(accessToken, fileId, fileMimeType);

    return successResponse({
      fileId,
      fileName,
      mimeType: fileMimeType,
      contentLength: content.length,
      content,
      preview: content.slice(0, 500),
    });
  } catch (error) {
    return handleError(error);
  }
});
