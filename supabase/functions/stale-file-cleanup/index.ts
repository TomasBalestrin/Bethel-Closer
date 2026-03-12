// stale-file-cleanup - Reset stale processing files (called by pg_cron)
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

    // Parse request body for custom timeout (default 30 minutes)
    let staleTimeout = 30;
    try {
      const body = await req.json();
      staleTimeout = body.staleTimeoutMinutes || 30;
    } catch {
      // Use default if no body
    }

    // Calculate cutoff time
    const cutoffTime = new Date(Date.now() - staleTimeout * 60 * 1000);

    // Find stale files that have been "processing" for too long
    const { data: staleFiles, error: queryError } = await adminClient
      .from("imported_files")
      .select("id, user_id, file_name, started_processing_at, retry_count")
      .eq("status", "processing")
      .lt("started_processing_at", cutoffTime.toISOString());

    if (queryError) {
      throw new Error(`Failed to query stale files: ${queryError.message}`);
    }

    if (!staleFiles || staleFiles.length === 0) {
      return successResponse({
        cleaned: 0,
        message: "No stale files found",
      });
    }

    // Separate files by retry count
    const toRetry: typeof staleFiles = [];
    const toError: typeof staleFiles = [];

    for (const file of staleFiles) {
      if ((file.retry_count || 0) < 3) {
        toRetry.push(file);
      } else {
        toError.push(file);
      }
    }

    // Reset files that can be retried
    if (toRetry.length > 0) {
      const retryIds = toRetry.map((f) => f.id);

      await adminClient
        .from("imported_files")
        .update({
          status: "pending",
          started_processing_at: null,
          retry_count: adminClient.raw("retry_count + 1"),
          error_message: "Reset due to stale processing - will retry",
          updated_at: new Date().toISOString(),
        })
        .in("id", retryIds);
    }

    // Mark files that have exhausted retries as error
    if (toError.length > 0) {
      const errorIds = toError.map((f) => f.id);

      await adminClient
        .from("imported_files")
        .update({
          status: "error",
          error_message: "Max retries exceeded - processing consistently failed",
          updated_at: new Date().toISOString(),
        })
        .in("id", errorIds);
    }

    // Log cleanup
    await logEvent(
      adminClient,
      "info",
      "stale-file-cleanup",
      "complete",
      undefined,
      undefined,
      undefined,
      {
        stale_found: staleFiles.length,
        reset_for_retry: toRetry.length,
        marked_as_error: toError.length,
        stale_timeout_minutes: staleTimeout,
      }
    );

    // Create notifications for affected users
    const affectedUsers = new Map<string, { retried: number; errored: number }>();

    for (const file of toRetry) {
      const current = affectedUsers.get(file.user_id) || { retried: 0, errored: 0 };
      current.retried++;
      affectedUsers.set(file.user_id, current);
    }

    for (const file of toError) {
      const current = affectedUsers.get(file.user_id) || { retried: 0, errored: 0 };
      current.errored++;
      affectedUsers.set(file.user_id, current);
    }

    for (const [userId, counts] of affectedUsers) {
      if (counts.errored > 0) {
        await adminClient.from("notifications").insert({
          user_id: userId,
          title: "Falha na importacao de arquivos",
          message: `${counts.errored} arquivo(s) falharam apos multiplas tentativas. Verifique a pagina de importacao.`,
          type: "warning",
          metadata: {
            action: "stale_file_cleanup",
            errored: counts.errored,
            retried: counts.retried,
          },
        });
      }
    }

    return successResponse({
      staleFound: staleFiles.length,
      resetForRetry: toRetry.length,
      markedAsError: toError.length,
      affectedUsers: affectedUsers.size,
      details: {
        retriedFiles: toRetry.map((f) => ({ id: f.id, name: f.file_name })),
        erroredFiles: toError.map((f) => ({ id: f.id, name: f.file_name })),
      },
    });
  } catch (error) {
    return handleError(error);
  }
});
