// check-incomplete-clients - Check clients with incomplete data
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

    // Required fields for a complete client profile
    const requiredFields = [
      "name",
      "phone",
      "niche",
      "main_pain",
      "product_offered",
    ];

    const optionalButDesired = [
      "email",
      "company",
      "monthly_revenue",
      "main_difficulty",
      "funnel_source",
    ];

    // Get clients created in the last 7 days that might need completion
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: recentClients, error: queryError } = await adminClient
      .from("clients")
      .select(`
        id, name, phone, email, company, niche,
        main_pain, main_difficulty, product_offered,
        monthly_revenue, funnel_source, data_completed_at,
        closer_id, created_at,
        profiles!closer_id(user_id, name)
      `)
      .gte("created_at", sevenDaysAgo.toISOString())
      .is("data_completed_at", null);

    if (queryError) {
      throw new Error(`Failed to query clients: ${queryError.message}`);
    }

    if (!recentClients || recentClients.length === 0) {
      return successResponse({
        checked: 0,
        incomplete: 0,
        message: "No recent clients to check",
      });
    }

    const incompleteClients: Array<{
      clientId: string;
      clientName: string;
      closerId: string;
      missingRequired: string[];
      missingOptional: string[];
      completionPercentage: number;
    }> = [];

    const notifications: Array<{
      user_id: string;
      title: string;
      message: string;
      type: string;
      metadata: Record<string, unknown>;
    }> = [];

    for (const client of recentClients) {
      const missingRequired: string[] = [];
      const missingOptional: string[] = [];

      // Check required fields
      for (const field of requiredFields) {
        if (!client[field as keyof typeof client]) {
          missingRequired.push(field);
        }
      }

      // Check optional fields
      for (const field of optionalButDesired) {
        if (!client[field as keyof typeof client]) {
          missingOptional.push(field);
        }
      }

      // Calculate completion percentage
      const totalFields = requiredFields.length + optionalButDesired.length;
      const filledFields = totalFields - missingRequired.length - missingOptional.length;
      const completionPercentage = Math.round((filledFields / totalFields) * 100);

      // If missing any required fields, consider incomplete
      if (missingRequired.length > 0) {
        const profile = (client as any).profiles;

        incompleteClients.push({
          clientId: client.id,
          clientName: client.name || "Sem nome",
          closerId: client.closer_id,
          missingRequired,
          missingOptional,
          completionPercentage,
        });

        // Create notification if profile exists
        if (profile?.user_id) {
          // Check if we already notified about this client recently
          const { data: existingNotif } = await adminClient
            .from("notifications")
            .select("id")
            .eq("user_id", profile.user_id)
            .eq("metadata->client_id", client.id)
            .eq("metadata->type", "incomplete_data")
            .gte("created_at", sevenDaysAgo.toISOString())
            .single();

          if (!existingNotif) {
            const fieldNames: Record<string, string> = {
              name: "Nome",
              phone: "Telefone",
              email: "Email",
              niche: "Nicho",
              main_pain: "Dor principal",
              product_offered: "Produto oferecido",
              company: "Empresa",
              monthly_revenue: "Faturamento",
              main_difficulty: "Dificuldade principal",
              funnel_source: "Origem do funil",
            };

            const missingFieldsText = missingRequired
              .map((f) => fieldNames[f] || f)
              .join(", ");

            notifications.push({
              user_id: profile.user_id,
              title: "Dados incompletos de cliente",
              message: `O cliente "${client.name || "Sem nome"}" tem dados faltando: ${missingFieldsText}. Complete as informacoes para melhor acompanhamento.`,
              type: "warning",
              metadata: {
                client_id: client.id,
                client_name: client.name,
                missing_fields: missingRequired,
                completion_percentage: completionPercentage,
                type: "incomplete_data",
              },
            });
          }
        }
      } else if (missingRequired.length === 0 && !client.data_completed_at) {
        // Mark client as complete if all required fields are filled
        await adminClient
          .from("clients")
          .update({ data_completed_at: new Date().toISOString() })
          .eq("id", client.id);
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
      "check-incomplete-clients",
      "complete",
      undefined,
      undefined,
      undefined,
      {
        clients_checked: recentClients.length,
        incomplete_found: incompleteClients.length,
        notifications_created: notifications.length,
      }
    );

    return successResponse({
      checked: recentClients.length,
      incomplete: incompleteClients.length,
      notificationsCreated: notifications.length,
      incompleteClients: incompleteClients.slice(0, 20), // Limit response
    });
  } catch (error) {
    return handleError(error);
  }
});
