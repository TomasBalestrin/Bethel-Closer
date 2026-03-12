// admin-delete-user - Delete user (admin only)
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
    const { userId, reason }: { userId: string; reason?: string } = body;

    if (!userId) {
      throw new ApiError(400, "userId is required");
    }

    // Prevent self-deletion
    if (userId === user.id) {
      throw new ApiError(400, "Cannot delete your own account");
    }

    // Get user info before deletion for audit log
    const { data: targetProfile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, name, email, role, user_id")
      .eq("user_id", userId)
      .single();

    if (profileError || !targetProfile) {
      throw new ApiError(404, "User not found");
    }

    // Check if target is also admin - prevent admin deletion by non-master admin
    if (targetProfile.role === "admin") {
      // Check if current user is master admin (first admin created)
      const { data: admins } = await adminClient
        .from("profiles")
        .select("user_id")
        .eq("role", "admin")
        .order("created_at", { ascending: true })
        .limit(1);

      const isMasterAdmin = admins && admins.length > 0 && admins[0].user_id === user.id;

      if (!isMasterAdmin) {
        throw new ApiError(403, "Only master admin can delete other admins");
      }
    }

    // Backup user data before deletion
    const { data: userCalls } = await adminClient
      .from("calls")
      .select("*")
      .eq("closer_id", targetProfile.id);

    const { data: userClients } = await adminClient
      .from("clients")
      .select("*")
      .eq("closer_id", targetProfile.id);

    const backupData = {
      profile: targetProfile,
      calls: userCalls || [],
      clients: userClients || [],
      deleted_at: new Date().toISOString(),
      deleted_by: user.id,
      reason: reason || null,
    };

    // Store backup in audit log
    await adminClient.rpc("insert_audit_log", {
      _performed_by: user.id,
      _action_type: "DELETE_USER",
      _entity_type: "user",
      _entity_id: userId,
      _old_value: backupData,
      _new_value: null,
      _metadata: { reason },
    });

    // Soft delete calls (mark as deleted)
    if (userCalls && userCalls.length > 0) {
      await adminClient
        .from("calls")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: user.id,
        })
        .eq("closer_id", targetProfile.id);
    }

    // Transfer or delete clients
    // Option 1: Keep clients but remove closer assignment
    await adminClient
      .from("clients")
      .update({
        closer_id: null,
        notes: `[Auto] Closer anterior (${targetProfile.name}) removido do sistema.`,
        updated_at: new Date().toISOString(),
      })
      .eq("closer_id", targetProfile.id);

    // Remove from squads
    await adminClient
      .from("squad_members")
      .delete()
      .eq("profile_id", targetProfile.id);

    // Remove squad leadership
    await adminClient
      .from("squads")
      .update({ leader_id: null })
      .eq("leader_id", targetProfile.id);

    // Delete profile
    const { error: deleteProfileError } = await adminClient
      .from("profiles")
      .delete()
      .eq("user_id", userId);

    if (deleteProfileError) {
      throw new ApiError(500, `Failed to delete profile: ${deleteProfileError.message}`);
    }

    // Delete auth user
    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(userId);

    if (deleteAuthError) {
      // Profile already deleted, log the auth error but don't fail
      console.error("Failed to delete auth user:", deleteAuthError);
      await logEvent(
        adminClient,
        "warning",
        "admin-delete-user",
        "auth_delete_failed",
        user.id,
        undefined,
        deleteAuthError.message,
        { target_user_id: userId }
      );
    }

    // Log successful deletion
    await logEvent(
      adminClient,
      "info",
      "admin-delete-user",
      "complete",
      user.id,
      undefined,
      undefined,
      {
        deleted_user_id: userId,
        deleted_user_name: targetProfile.name,
        deleted_user_email: targetProfile.email,
        deleted_user_role: targetProfile.role,
        reason,
        calls_affected: userCalls?.length || 0,
        clients_affected: userClients?.length || 0,
      }
    );

    return successResponse({
      message: `User ${targetProfile.name} (${targetProfile.email}) has been deleted`,
      deletedUserId: userId,
      affectedCalls: userCalls?.length || 0,
      affectedClients: userClients?.length || 0,
    });
  } catch (error) {
    return handleError(error);
  }
});
