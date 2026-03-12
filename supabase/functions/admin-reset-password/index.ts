// admin-reset-password - Reset user password (admin only)
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
      newPassword,
      sendEmail = true,
    }: {
      userId: string;
      newPassword?: string;
      sendEmail?: boolean;
    } = body;

    if (!userId) {
      throw new ApiError(400, "userId is required");
    }

    // Get user info for audit log
    const { data: targetProfile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, name, email, role, user_id")
      .eq("user_id", userId)
      .single();

    if (profileError || !targetProfile) {
      throw new ApiError(404, "User not found");
    }

    // Check if target is admin - only master admin can reset admin passwords
    if (targetProfile.role === "admin" && userId !== user.id) {
      const { data: admins } = await adminClient
        .from("profiles")
        .select("user_id")
        .eq("role", "admin")
        .order("created_at", { ascending: true })
        .limit(1);

      const isMasterAdmin = admins && admins.length > 0 && admins[0].user_id === user.id;

      if (!isMasterAdmin) {
        throw new ApiError(403, "Only master admin can reset other admin passwords");
      }
    }

    let responseMessage: string;

    if (newPassword) {
      // Validate password strength
      if (newPassword.length < 8) {
        throw new ApiError(400, "Password must be at least 8 characters long");
      }

      if (!/[A-Z]/.test(newPassword)) {
        throw new ApiError(400, "Password must contain at least one uppercase letter");
      }

      if (!/[a-z]/.test(newPassword)) {
        throw new ApiError(400, "Password must contain at least one lowercase letter");
      }

      if (!/[0-9]/.test(newPassword)) {
        throw new ApiError(400, "Password must contain at least one number");
      }

      // Update password directly
      const { error: updateError } = await adminClient.auth.admin.updateUserById(
        userId,
        { password: newPassword }
      );

      if (updateError) {
        throw new ApiError(500, `Failed to update password: ${updateError.message}`);
      }

      responseMessage = "Password has been reset successfully";

      // Log the action
      await adminClient.rpc("insert_audit_log", {
        _performed_by: user.id,
        _action_type: "RESET_PASSWORD_DIRECT",
        _entity_type: "user",
        _entity_id: userId,
        _old_value: null,
        _new_value: { password_changed: true },
        _metadata: { target_email: targetProfile.email },
      });
    } else if (sendEmail) {
      // Generate password reset link
      const { data: resetData, error: resetError } =
        await adminClient.auth.admin.generateLink({
          type: "recovery",
          email: targetProfile.email,
        });

      if (resetError) {
        throw new ApiError(500, `Failed to generate reset link: ${resetError.message}`);
      }

      // The link is automatically sent by Supabase if email is configured
      responseMessage = `Password reset email sent to ${targetProfile.email}`;

      // Log the action
      await adminClient.rpc("insert_audit_log", {
        _performed_by: user.id,
        _action_type: "RESET_PASSWORD_EMAIL",
        _entity_type: "user",
        _entity_id: userId,
        _old_value: null,
        _new_value: { reset_email_sent: true },
        _metadata: { target_email: targetProfile.email },
      });
    } else {
      throw new ApiError(400, "Either newPassword or sendEmail must be provided");
    }

    // Log event
    await logEvent(
      adminClient,
      "info",
      "admin-reset-password",
      newPassword ? "direct_reset" : "email_reset",
      user.id,
      undefined,
      undefined,
      {
        target_user_id: userId,
        target_user_email: targetProfile.email,
        method: newPassword ? "direct" : "email",
      }
    );

    // Create notification for the user
    await adminClient.from("notifications").insert({
      user_id: userId,
      title: "Senha alterada",
      message: newPassword
        ? "Sua senha foi redefinida por um administrador. Entre em contato se voce nao solicitou esta alteracao."
        : "Um link para redefinir sua senha foi enviado para seu email.",
      type: "warning",
      metadata: {
        action: "password_reset",
        reset_by: user.id,
      },
    });

    return successResponse({
      message: responseMessage,
      userId: userId,
      userEmail: targetProfile.email,
      method: newPassword ? "direct" : "email",
    });
  } catch (error) {
    return handleError(error);
  }
});
