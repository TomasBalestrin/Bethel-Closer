// check-followups - Check pending followups and create notifications (for pg_cron)
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

    // Verify cron secret
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedSecret = getEnvVar("CRON_SECRET", false);

    if (expectedSecret && cronSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const today = new Date().toISOString().split("T")[0];

    // Find clients with followup_date = today
    const { data: clientsToday, error: todayError } = await adminClient
      .from("clients")
      .select("id, name, closer_id, followup_date, profiles!closer_id(user_id, name)")
      .eq("followup_date", today);

    if (todayError) {
      throw new Error(`Failed to query today's followups: ${todayError.message}`);
    }

    // Find clients with followup_date = tomorrow (advance notice)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    const { data: clientsTomorrow, error: tomorrowError } = await adminClient
      .from("clients")
      .select("id, name, closer_id, followup_date, profiles!closer_id(user_id, name)")
      .eq("followup_date", tomorrowStr);

    if (tomorrowError) {
      throw new Error(`Failed to query tomorrow's followups: ${tomorrowError.message}`);
    }

    const notifications: Array<{
      user_id: string;
      title: string;
      message: string;
      type: string;
      metadata: Record<string, unknown>;
    }> = [];

    // Create notifications for today's followups
    for (const client of clientsToday || []) {
      const profile = (client as any).profiles;
      if (!profile?.user_id) continue;

      // Check if notification already exists for today
      const { data: existingNotif } = await adminClient
        .from("notifications")
        .select("id")
        .eq("user_id", profile.user_id)
        .eq("metadata->client_id", client.id)
        .eq("metadata->type", "followup_today")
        .gte("created_at", `${today}T00:00:00`)
        .single();

      if (existingNotif) continue;

      notifications.push({
        user_id: profile.user_id,
        title: "Follow-up para hoje",
        message: `Lembrete: Fazer follow-up com ${client.name} hoje!`,
        type: "followup",
        metadata: {
          client_id: client.id,
          client_name: client.name,
          followup_date: client.followup_date,
          type: "followup_today",
        },
      });
    }

    // Create notifications for tomorrow's followups
    for (const client of clientsTomorrow || []) {
      const profile = (client as any).profiles;
      if (!profile?.user_id) continue;

      // Check if notification already exists
      const { data: existingNotif } = await adminClient
        .from("notifications")
        .select("id")
        .eq("user_id", profile.user_id)
        .eq("metadata->client_id", client.id)
        .eq("metadata->type", "followup_tomorrow")
        .gte("created_at", `${today}T00:00:00`)
        .single();

      if (existingNotif) continue;

      notifications.push({
        user_id: profile.user_id,
        title: "Follow-up agendado para amanha",
        message: `Preparar follow-up com ${client.name} para amanha (${tomorrowStr}).`,
        type: "info",
        metadata: {
          client_id: client.id,
          client_name: client.name,
          followup_date: client.followup_date,
          type: "followup_tomorrow",
        },
      });
    }

    // Insert all notifications
    if (notifications.length > 0) {
      await adminClient.from("notifications").insert(notifications);
    }

    // Also check for overdue followups (past date)
    const { data: overdueClients, error: overdueError } = await adminClient
      .from("clients")
      .select("id, name, closer_id, followup_date, profiles!closer_id(user_id)")
      .lt("followup_date", today)
      .not("followup_date", "is", null)
      .in("status", ["lead", "contacted", "negotiating"]);

    if (overdueError) {
      console.error("Failed to query overdue followups:", overdueError);
    }

    const overdueNotifications: typeof notifications = [];

    for (const client of overdueClients || []) {
      const profile = (client as any).profiles;
      if (!profile?.user_id) continue;

      // Check if we already sent overdue notification this week
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const { data: existingNotif } = await adminClient
        .from("notifications")
        .select("id")
        .eq("user_id", profile.user_id)
        .eq("metadata->client_id", client.id)
        .eq("metadata->type", "followup_overdue")
        .gte("created_at", weekAgo.toISOString())
        .single();

      if (existingNotif) continue;

      overdueNotifications.push({
        user_id: profile.user_id,
        title: "Follow-up atrasado",
        message: `Follow-up com ${client.name} estava agendado para ${client.followup_date} e ainda nao foi realizado.`,
        type: "warning",
        metadata: {
          client_id: client.id,
          client_name: client.name,
          followup_date: client.followup_date,
          type: "followup_overdue",
        },
      });
    }

    if (overdueNotifications.length > 0) {
      await adminClient.from("notifications").insert(overdueNotifications);
    }

    // Log check
    await logEvent(
      adminClient,
      "info",
      "check-followups",
      "complete",
      undefined,
      undefined,
      undefined,
      {
        followups_today: clientsToday?.length || 0,
        followups_tomorrow: clientsTomorrow?.length || 0,
        overdue: overdueClients?.length || 0,
        notifications_created: notifications.length + overdueNotifications.length,
      }
    );

    return successResponse({
      followupsToday: clientsToday?.length || 0,
      followupsTomorrow: clientsTomorrow?.length || 0,
      overdue: overdueClients?.length || 0,
      notificationsCreated: notifications.length + overdueNotifications.length,
    });
  } catch (error) {
    return handleError(error);
  }
});
