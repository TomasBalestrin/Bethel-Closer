// google-auth-url - Generate OAuth2 URL for Google authentication
// Bethel Closer - Sales Call Analysis Platform

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  corsHeaders,
  createSupabaseClient,
  requireAuth,
  handleError,
  successResponse,
  getGoogleOAuthConfig,
} from "../_shared/utils.ts";

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseClient(req.headers.get("Authorization") || undefined);

    // Authenticate user
    const user = await requireAuth(req, supabase);

    // Get Google OAuth config
    const config = getGoogleOAuthConfig();

    // Generate state parameter for CSRF protection
    const state = crypto.randomUUID();

    // Store state in user's session for verification
    const { error: stateError } = await supabase
      .from("profiles")
      .update({
        google_oauth_state: state,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (stateError) {
      console.error("Failed to store OAuth state:", stateError);
    }

    // Build OAuth URL
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: config.scopes.join(" "),
      access_type: "offline",
      prompt: "consent",
      state: `${user.id}:${state}`,
      include_granted_scopes: "true",
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    return successResponse({
      url: authUrl,
      state,
    });
  } catch (error) {
    return handleError(error);
  }
});
