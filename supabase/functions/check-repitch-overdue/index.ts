// check-repitch-overdue - Check clients in repitch column for too long
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

    // Define thresholds for "overdue" in repitch
    const thresholds = {
      repitch: 7, // 7 days in repitch column = overdue
      pos_call_3_7: 7, // 7 days after 3-7 window = should move
      pos_call_8_15: 8, // 8 days in this column
      pos_call_16_21: 6, // 6 days in this column
    };

    const today = new Date();

    // Find clients in repitch that haven't been updated
    const { data: repitchClients, error: repitchError } = await adminClient
      .from("clients")
      .select(`
        id, name, crm_status, status_changed_at,
        closer_id, repitch_notification_sent,
        profiles!closer_id(user_id, name)
      `)
      .eq("crm_status", "repitch")
      .eq("repitch_notification_sent", false);

    if (repitchError) {
      throw new Error(`Failed to query repitch clients: ${repitchError.message}`);
    }

    const overdueClients: Array<{
      clientId: string;
      clientName: string;
      status: string;
      daysInStatus: number;
    }> = [];

    const notifications: Array<{
      user_id: string;
      title: string;
      message: string;
      type: string;
      metadata: Record<string, unknown>;
    }> = [];

    // Check repitch clients
    for (const client of repitchClients || []) {
      const statusChangedAt = new Date(client.status_changed_at || client.created_at);
      const daysInStatus = Math.floor(
        (today.getTime() - statusChangedAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysInStatus >= thresholds.repitch) {
        const profile = (client as any).profiles;

        overdueClients.push({
          clientId: client.id,
          clientName: client.name || "Sem nome",
          status: "repitch",
          daysInStatus,
        });

        if (profile?.user_id) {
          notifications.push({
            user_id: profile.user_id,
            title: "Cliente aguardando repitch",
            message: `O cliente "${client.name}" esta na coluna Repitch ha ${daysInStatus} dias. Acao necessaria!`,
            type: "warning",
            metadata: {
              client_id: client.id,
              client_name: client.name,
              crm_status: "repitch",
              days_in_status: daysInStatus,
              type: "repitch_overdue",
            },
          });

          // Mark notification as sent
          await adminClient
            .from("clients")
            .update({ repitch_notification_sent: true })
            .eq("id", client.id);
        }
      }
    }

    // Check other CRM statuses
    const statusesToCheck = ["pos_call_3_7", "pos_call_8_15", "pos_call_16_21"];

    for (const status of statusesToCheck) {
      const threshold = thresholds[status as keyof typeof thresholds];

      const { data: clients } = await adminClient
        .from("clients")
        .select(`
          id, name, crm_status, status_changed_at,
          closer_id, profiles!closer_id(user_id)
        `)
        .eq("crm_status", status);

      for (const client of clients || []) {
        const statusChangedAt = new Date(client.status_changed_at || client.created_at);
        const daysInStatus = Math.floor(
          (today.getTime() - statusChangedAt.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysInStatus >= threshold) {
          const profile = (client as any).profiles;

          // Check if we already notified this week
          const weekAgo = new Date();
          weekAgo.setDate(weekAgo.getDate() - 7);

          const { data: existingNotif } = await adminClient
            .from("notifications")
            .select("id")
            .eq("user_id", profile?.user_id)
            .eq("metadata->client_id", client.id)
            .eq("metadata->type", "status_overdue")
            .gte("created_at", weekAgo.toISOString())
            .single();

          if (existingNotif) continue;

          overdueClients.push({
            clientId: client.id,
            clientName: client.name || "Sem nome",
            status,
            daysInStatus,
          });

          if (profile?.user_id) {
            const statusNames: Record<string, string> = {
              pos_call_3_7: "Pos-Call 3-7 dias",
              pos_call_8_15: "Pos-Call 8-15 dias",
              pos_call_16_21: "Pos-Call 16-21 dias",
            };

            notifications.push({
              user_id: profile.user_id,
              title: "Cliente precisa de atencao",
              message: `O cliente "${client.name}" esta em "${statusNames[status]}" ha ${daysInStatus} dias. Considere mover para a proxima etapa.`,
              type: "info",
              metadata: {
                client_id: client.id,
                client_name: client.name,
                crm_status: status,
                days_in_status: daysInStatus,
                type: "status_overdue",
              },
            });
          }
        }
      }
    }

    // Insert notifications
    if (notifications.length > 0) {
      await adminClient.from("notifications").insert(notifications);
    }

    // Log check
    await logEvent(
      adminClient,
      "info",
      "check-repitch-overdue",
      "complete",
      undefined,
      undefined,
      undefined,
      {
        overdue_found: overdueClients.length,
        notifications_created: notifications.length,
      }
    );

    return successResponse({
      overdueClients: overdueClients.length,
      notificationsCreated: notifications.length,
      clients: overdueClients.slice(0, 20),
    });
  } catch (error) {
    return handleError(error);
  }
});
