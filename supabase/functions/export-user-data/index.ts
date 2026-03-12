// export-user-data - Export all user data as JSON (LGPD compliance)
// Bethel Closer - Sales Call Analysis Platform

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  corsHeaders,
  createSupabaseClient,
  createSupabaseAdminClient,
  requireAuth,
  handleError,
  ApiError,
  logEvent,
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
    const body = await req.json().catch(() => ({}));
    const { targetUserId, format = "json" }: { targetUserId?: string; format?: string } = body;

    // Determine which user's data to export
    let exportUserId = user.id;

    if (targetUserId && targetUserId !== user.id) {
      // Only admins can export other users' data
      if (user.role !== "admin") {
        throw new ApiError(403, "Only admins can export other users' data");
      }
      exportUserId = targetUserId;
    }

    // Get profile
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("*")
      .eq("user_id", exportUserId)
      .single();

    if (profileError || !profile) {
      throw new ApiError(404, "User profile not found");
    }

    // Get all user's calls
    const { data: calls } = await adminClient
      .from("calls")
      .select("*")
      .eq("closer_id", profile.id)
      .order("created_at", { ascending: false });

    // Get all user's clients
    const { data: clients } = await adminClient
      .from("clients")
      .select("*")
      .eq("closer_id", profile.id)
      .order("created_at", { ascending: false });

    // Get notifications
    const { data: notifications } = await adminClient
      .from("notifications")
      .select("*")
      .eq("user_id", exportUserId)
      .order("created_at", { ascending: false });

    // Get imported files
    const { data: importedFiles } = await adminClient
      .from("imported_files")
      .select("*")
      .eq("user_id", exportUserId)
      .order("created_at", { ascending: false });

    // Get monthly goals
    const { data: monthlyGoals } = await adminClient
      .from("monthly_goals")
      .select("*")
      .eq("closer_id", profile.id)
      .order("created_at", { ascending: false });

    // Get portfolio students
    const { data: portfolioStudents } = await adminClient
      .from("portfolio_students")
      .select("*")
      .eq("closer_id", profile.id)
      .order("created_at", { ascending: false });

    // Get intensive leads
    const { data: intensiveLeads } = await adminClient
      .from("intensive_leads")
      .select("*")
      .eq("closer_id", profile.id)
      .order("created_at", { ascending: false });

    // Get squad memberships
    const { data: squadMemberships } = await adminClient
      .from("squad_members")
      .select("*, squads(*)")
      .eq("profile_id", profile.id);

    // Get indications
    const { data: indications } = await adminClient
      .from("indications")
      .select("*")
      .eq("closer_id", profile.id);

    // Compile export data
    const exportData = {
      exportedAt: new Date().toISOString(),
      exportedBy: user.id === exportUserId ? "self" : user.email,
      user: {
        profile: {
          ...profile,
          // Remove sensitive tokens
          google_access_token: profile.google_access_token ? "[REDACTED]" : null,
          google_refresh_token: profile.google_refresh_token ? "[REDACTED]" : null,
        },
      },
      statistics: {
        totalCalls: calls?.length || 0,
        totalClients: clients?.length || 0,
        totalStudents: portfolioStudents?.length || 0,
        totalLeads: intensiveLeads?.length || 0,
      },
      calls: calls || [],
      clients: clients || [],
      notifications: notifications || [],
      importedFiles: importedFiles || [],
      monthlyGoals: monthlyGoals || [],
      portfolioStudents: portfolioStudents || [],
      intensiveLeads: intensiveLeads || [],
      squadMemberships: squadMemberships || [],
      indications: indications || [],
    };

    // Log the export
    await logEvent(
      adminClient,
      "info",
      "export-user-data",
      "complete",
      user.id,
      undefined,
      undefined,
      {
        exported_user_id: exportUserId,
        data_size: JSON.stringify(exportData).length,
        calls_count: calls?.length || 0,
        clients_count: clients?.length || 0,
      }
    );

    // Insert audit log for data export
    await adminClient.rpc("insert_audit_log", {
      _performed_by: user.id,
      _action_type: "EXPORT_USER_DATA",
      _entity_type: "user",
      _entity_id: exportUserId,
      _old_value: null,
      _new_value: {
        exported_records: {
          calls: calls?.length || 0,
          clients: clients?.length || 0,
          notifications: notifications?.length || 0,
        },
      },
      _metadata: { format },
    });

    // Return based on format
    if (format === "download") {
      const jsonString = JSON.stringify(exportData, null, 2);
      const filename = `bethel-closer-export-${profile.email}-${new Date().toISOString().split("T")[0]}.json`;

      return new Response(jsonString, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: exportData,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return handleError(error);
  }
});
