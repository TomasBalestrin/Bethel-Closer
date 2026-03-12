// admin-update-email - Update user email (master admin only)
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

    // Authenticate and require admin role
    const user = await requireAuth(req, supabase, ["admin"]);

    // Parse request body
    const body = await req.json();
    const {
      userId,
      newEmail,
    }: {
      userId: string;
      newEmail: string;
    } = body;

    if (!userId) {
      throw new ApiError(400, "userId is required");
    }

    if (!newEmail) {
      throw new ApiError(400, "newEmail is required");
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      throw new ApiError(400, "Invalid email format");
    }

    // Check if current user is master admin (first admin)
    const { data: admins } = await adminClient
      .from("profiles")
      .select("user_id")
      .eq("role", "admin")
      .order("created_at", { ascending: true })
      .limit(1);

    const isMasterAdmin = admins && admins.length > 0 && admins[0].user_id === user.id;

    if (!isMasterAdmin) {
      throw new ApiError(403, "Only master admin can update user emails");
    }

    // Get target user info
    const { data: targetProfile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, name, email, role, user_id")
      .eq("user_id", userId)
      .single();

    if (profileError || !targetProfile) {
      throw new ApiError(404, "User not found");
    }

    const oldEmail = targetProfile.email;

    // Check if new email is already in use
    const { data: existingUser } = await adminClient
      .from("profiles")
      .select("id")
      .eq("email", newEmail)
      .neq("user_id", userId)
      .single();

    if (existingUser) {
      throw new ApiError(409, "Email is already in use by another user");
    }

    // Update email in auth.users
    const { error: authError } = await adminClient.auth.admin.updateUserById(
      userId,
      { email: newEmail, email_confirm: true }
    );

    if (authError) {
      throw new ApiError(500, `Failed to update auth email: ${authError.message}`);
    }

    // Update email in profiles
    const { error: profileUpdateError } = await adminClient
      .from("profiles")
      .update({
        email: newEmail,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (profileUpdateError) {
      // Try to rollback auth change
      await adminClient.auth.admin.updateUserById(userId, { email: oldEmail });
      throw new ApiError(500, `Failed to update profile email: ${profileUpdateError.message}`);
    }

    // Log the action
    await adminClient.rpc("insert_audit_log", {
      _performed_by: user.id,
      _action_type: "UPDATE_EMAIL",
      _entity_type: "user",
      _entity_id: userId,
      _old_value: { email: oldEmail },
      _new_value: { email: newEmail },
      _metadata: { target_name: targetProfile.name },
    });

    // Log event
    await logEvent(
      adminClient,
      "info",
      "admin-update-email",
      "complete",
      user.id,
      undefined,
      undefined,
      {
        target_user_id: userId,
        old_email: oldEmail,
        new_email: newEmail,
      }
    );

    // Create notification for the user
    await adminClient.from("notifications").insert({
      user_id: userId,
      title: "Email atualizado",
      message: `Seu email foi alterado de ${oldEmail} para ${newEmail} por um administrador.`,
      type: "info",
      metadata: {
        action: "email_update",
        updated_by: user.id,
        old_email: oldEmail,
        new_email: newEmail,
      },
    });

    return successResponse({
      message: `Email updated successfully`,
      userId,
      oldEmail,
      newEmail,
      userName: targetProfile.name,
    });
  } catch (error) {
    return handleError(error);
  }
});
