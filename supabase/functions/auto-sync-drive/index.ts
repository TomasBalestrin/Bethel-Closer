// auto-sync-drive - Orchestrator for automatic Drive import (called by pg_cron)
// Bethel Closer - Sales Call Analysis Platform

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  corsHeaders,
  createSupabaseAdminClient,
  handleError,
  successResponse,
  logEvent,
  getEnvVar,
} from "../_shared/utils.ts";

interface SyncResult {
  userId: string;
  userEmail: string;
  status: "success" | "error" | "skipped";
  newFilesQueued?: number;
  filesProcessed?: number;
  error?: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const adminClient = createSupabaseAdminClient();

    // Verify cron secret for security
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedSecret = getEnvVar("CRON_SECRET", false);

    if (expectedSecret && cronSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all users with auto-import enabled
    const { data: users, error: usersError } = await adminClient
      .from("profiles")
      .select("id, user_id, email, google_connected, auto_import_enabled, import_frequency, last_sync_at")
      .eq("google_connected", true)
      .eq("auto_import_enabled", true)
      .not("drive_folder_id", "is", null);

    if (usersError) {
      throw new Error(`Failed to get users: ${usersError.message}`);
    }

    if (!users || users.length === 0) {
      return successResponse({
        processed: 0,
        message: "No users with auto-import enabled",
      });
    }

    const results: SyncResult[] = [];
    const baseUrl = getEnvVar("SUPABASE_URL");

    for (const user of users) {
      try {
        // Check if sync is due based on frequency
        const shouldSync = checkSyncDue(user.last_sync_at, user.import_frequency);

        if (!shouldSync) {
          results.push({
            userId: user.user_id,
            userEmail: user.email,
            status: "skipped",
          });
          continue;
        }

        // Generate service role token for the user
        // Note: In production, you might want to use a different auth mechanism
        const serviceRoleKey = getEnvVar("SUPABASE_SERVICE_ROLE_KEY");

        // Step 1: Sync new files from Drive
        const syncResponse = await fetch(`${baseUrl}/functions/v1/sync-drive-files`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
            "x-user-id": user.user_id,
          },
          body: JSON.stringify({}),
        });

        let newFilesQueued = 0;
        if (syncResponse.ok) {
          const syncResult = await syncResponse.json();
          newFilesQueued = syncResult.data?.newFilesQueued || 0;
        }

        // Step 2: Process pending files
        const processResponse = await fetch(`${baseUrl}/functions/v1/process-user-files`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
            "x-user-id": user.user_id,
          },
          body: JSON.stringify({ maxFiles: 5 }),
        });

        let filesProcessed = 0;
        if (processResponse.ok) {
          const processResult = await processResponse.json();
          filesProcessed = processResult.data?.processed || 0;
        }

        results.push({
          userId: user.user_id,
          userEmail: user.email,
          status: "success",
          newFilesQueued,
          filesProcessed,
        });
      } catch (error) {
        results.push({
          userId: user.user_id,
          userEmail: user.email,
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Log auto-sync completion
    const successful = results.filter((r) => r.status === "success").length;
    const errors = results.filter((r) => r.status === "error").length;
    const skipped = results.filter((r) => r.status === "skipped").length;

    await logEvent(
      adminClient,
      "info",
      "auto-sync-drive",
      "complete",
      undefined,
      undefined,
      undefined,
      {
        total_users: users.length,
        successful,
        errors,
        skipped,
        total_files_queued: results.reduce((sum, r) => sum + (r.newFilesQueued || 0), 0),
        total_files_processed: results.reduce((sum, r) => sum + (r.filesProcessed || 0), 0),
      }
    );

    return successResponse({
      processed: results.length,
      successful,
      errors,
      skipped,
      results,
    });
  } catch (error) {
    return handleError(error);
  }
});

function checkSyncDue(lastSyncAt: string | null, frequency: string): boolean {
  if (!lastSyncAt) return true;

  const lastSync = new Date(lastSyncAt);
  const now = new Date();
  const diffMs = now.getTime() - lastSync.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  switch (frequency) {
    case "15m":
      return diffMs >= 15 * 60 * 1000;
    case "30m":
      return diffMs >= 30 * 60 * 1000;
    case "1h":
      return diffHours >= 1;
    case "2h":
      return diffHours >= 2;
    case "6h":
      return diffHours >= 6;
    case "12h":
      return diffHours >= 12;
    case "24h":
      return diffHours >= 24;
    default:
      return diffHours >= 1;
  }
}
