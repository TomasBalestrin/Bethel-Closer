// notify-client-completed - Notify when client data is completed
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
    const body = await req.json();
    const { clientId }: { clientId: string } = body;

    if (!clientId) {
      throw new ApiError(400, "clientId is required");
    }

    // Get client data
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select(`
        id, name, phone, email, company, niche,
        main_pain, main_difficulty, product_offered,
        monthly_revenue, funnel_source, data_completed_at,
        closer_id, profiles!closer_id(user_id, name)
      `)
      .eq("id", clientId)
      .single();

    if (clientError || !client) {
      throw new ApiError(404, "Client not found");
    }

    // Get user's profile
    const { data: userProfile } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("user_id", user.id)
      .single();

    // Check access
    const isOwner = client.closer_id === userProfile?.id;
    const isAdmin = userProfile?.role === "admin" || userProfile?.role === "lider";

    if (!isOwner && !isAdmin) {
      throw new ApiError(403, "Access denied");
    }

    // Define required fields
    const requiredFields = ["name", "phone", "niche", "main_pain", "product_offered"];

    // Check completion
    const missingFields: string[] = [];
    for (const field of requiredFields) {
      if (!client[field as keyof typeof client]) {
        missingFields.push(field);
      }
    }

    if (missingFields.length > 0) {
      return successResponse({
        complete: false,
        missingFields,
        message: "Client data is still incomplete",
      });
    }

    // Mark as complete if not already
    if (!client.data_completed_at) {
      await adminClient
        .from("clients")
        .update({
          data_completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", clientId);
    }

    // Create success notification
    const profile = (client as any).profiles;
    if (profile?.user_id) {
      await adminClient.from("notifications").insert({
        user_id: profile.user_id,
        title: "Dados do cliente completos",
        message: `Os dados do cliente "${client.name}" foram preenchidos completamente. Bom trabalho!`,
        type: "success",
        metadata: {
          client_id: clientId,
          client_name: client.name,
          type: "data_completed",
        },
      });
    }

    // If there's a squad leader, notify them too
    const { data: squadMembership } = await adminClient
      .from("squad_members")
      .select("squad_id, squads!squad_id(leader_id, profiles!leader_id(user_id))")
      .eq("profile_id", client.closer_id)
      .single();

    if (squadMembership) {
      const squad = (squadMembership as any).squads;
      const leader = squad?.profiles;

      if (leader?.user_id && leader.user_id !== profile?.user_id) {
        await adminClient.from("notifications").insert({
          user_id: leader.user_id,
          title: "Membro completou dados de cliente",
          message: `${profile?.name || "Um closer"} completou os dados do cliente "${client.name}".`,
          type: "info",
          metadata: {
            client_id: clientId,
            client_name: client.name,
            closer_name: profile?.name,
            type: "team_data_completed",
          },
        });
      }
    }

    // Log event
    await logEvent(
      adminClient,
      "info",
      "notify-client-completed",
      "complete",
      user.id,
      undefined,
      undefined,
      {
        client_id: clientId,
        client_name: client.name,
      }
    );

    return successResponse({
      complete: true,
      clientId,
      clientName: client.name,
      completedAt: client.data_completed_at || new Date().toISOString(),
      message: "Client data is complete",
    });
  } catch (error) {
    return handleError(error);
  }
});
