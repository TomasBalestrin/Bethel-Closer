// health-check - System health check for monitoring
// Bethel Closer - Sales Call Analysis Platform

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  corsHeaders,
  createSupabaseAdminClient,
  getEnvVar,
} from "../_shared/utils.ts";

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  checks: {
    database: CheckResult;
    auth: CheckResult;
    storage: CheckResult;
    openai: CheckResult;
    google: CheckResult;
  };
  metrics?: {
    totalUsers?: number;
    totalCalls?: number;
    pendingImports?: number;
    recentErrors?: number;
    apiCostsToday?: number;
  };
}

interface CheckResult {
  status: "ok" | "warning" | "error";
  latency?: number;
  message?: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const adminClient = createSupabaseAdminClient();

    // Parse query params for detail level
    const url = new URL(req.url);
    const detailed = url.searchParams.get("detailed") === "true";
    const includeMetrics = url.searchParams.get("metrics") === "true";

    const checks: HealthStatus["checks"] = {
      database: { status: "error" },
      auth: { status: "error" },
      storage: { status: "error" },
      openai: { status: "error" },
      google: { status: "error" },
    };

    // Check database connection
    const dbStart = Date.now();
    try {
      const { data, error } = await adminClient
        .from("profiles")
        .select("count")
        .limit(1);

      if (error) throw error;

      checks.database = {
        status: "ok",
        latency: Date.now() - dbStart,
      };
    } catch (error) {
      checks.database = {
        status: "error",
        latency: Date.now() - dbStart,
        message: error instanceof Error ? error.message : "Database check failed",
      };
    }

    // Check auth service
    const authStart = Date.now();
    try {
      const { data, error } = await adminClient.auth.admin.listUsers({
        perPage: 1,
      });

      if (error) throw error;

      checks.auth = {
        status: "ok",
        latency: Date.now() - authStart,
      };
    } catch (error) {
      checks.auth = {
        status: "error",
        latency: Date.now() - authStart,
        message: error instanceof Error ? error.message : "Auth check failed",
      };
    }

    // Check storage (optional, just verify bucket exists)
    const storageStart = Date.now();
    try {
      const { data, error } = await adminClient.storage.listBuckets();

      checks.storage = {
        status: error ? "warning" : "ok",
        latency: Date.now() - storageStart,
        message: error?.message,
      };
    } catch (error) {
      checks.storage = {
        status: "warning",
        latency: Date.now() - storageStart,
        message: "Storage not configured",
      };
    }

    // Check OpenAI API key presence
    try {
      const apiKey = getEnvVar("OPENAI_API_KEY", false);
      checks.openai = {
        status: apiKey ? "ok" : "warning",
        message: apiKey ? undefined : "API key not configured",
      };
    } catch {
      checks.openai = {
        status: "warning",
        message: "OpenAI not configured",
      };
    }

    // Check Google OAuth config
    try {
      const clientId = getEnvVar("GOOGLE_CLIENT_ID", false);
      const clientSecret = getEnvVar("GOOGLE_CLIENT_SECRET", false);

      checks.google = {
        status: clientId && clientSecret ? "ok" : "warning",
        message:
          clientId && clientSecret ? undefined : "Google OAuth not fully configured",
      };
    } catch {
      checks.google = {
        status: "warning",
        message: "Google OAuth not configured",
      };
    }

    // Calculate overall status
    const checkStatuses = Object.values(checks).map((c) => c.status);
    let overallStatus: HealthStatus["status"] = "healthy";

    if (checkStatuses.includes("error")) {
      overallStatus = "unhealthy";
    } else if (checkStatuses.includes("warning")) {
      overallStatus = "degraded";
    }

    const healthStatus: HealthStatus = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      checks,
    };

    // Add metrics if requested
    if (includeMetrics) {
      const today = new Date().toISOString().split("T")[0];

      // Get total users
      const { count: userCount } = await adminClient
        .from("profiles")
        .select("*", { count: "exact", head: true });

      // Get total calls
      const { count: callCount } = await adminClient
        .from("calls")
        .select("*", { count: "exact", head: true });

      // Get pending imports
      const { count: pendingCount } = await adminClient
        .from("imported_files")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");

      // Get recent errors (last 24 hours)
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: errorCount } = await adminClient
        .from("system_logs")
        .select("*", { count: "exact", head: true })
        .eq("level", "error")
        .gte("created_at", yesterday);

      // Get today's API costs
      const { data: costData } = await adminClient
        .from("api_costs")
        .select("estimated_cost_usd")
        .gte("created_at", `${today}T00:00:00`);

      const totalCost = (costData || []).reduce(
        (sum, row) => sum + (parseFloat(row.estimated_cost_usd) || 0),
        0
      );

      healthStatus.metrics = {
        totalUsers: userCount || 0,
        totalCalls: callCount || 0,
        pendingImports: pendingCount || 0,
        recentErrors: errorCount || 0,
        apiCostsToday: Math.round(totalCost * 100) / 100,
      };
    }

    // Return appropriate status code based on health
    const statusCode =
      overallStatus === "unhealthy" ? 503 : overallStatus === "degraded" ? 200 : 200;

    return new Response(JSON.stringify(healthStatus), {
      status: statusCode,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const errorResponse: HealthStatus = {
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      checks: {
        database: { status: "error", message: "Check failed" },
        auth: { status: "error", message: "Check failed" },
        storage: { status: "error", message: "Check failed" },
        openai: { status: "error", message: "Check failed" },
        google: { status: "error", message: "Check failed" },
      },
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
