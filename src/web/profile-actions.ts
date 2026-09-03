"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { canChangeEmailWithoutTransactionalDelivery } from "../auth/profile-policy.js";
import { auth } from "../auth/server.js";
import type { ProfileActionState } from "./profile-state.js";

function textValue(formData: FormData, field: string): string {
  const raw = formData.get(field);
  return typeof raw === "string" ? raw.trim() : "";
}

function passwordValue(formData: FormData, field: string): string {
  const raw = formData.get(field);
  return typeof raw === "string" ? raw : "";
}

export async function updateProfileNameAction(
  _previous: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const name = textValue(formData, "name");
  if (name.length < 2 || name.length > 100) {
    return { status: "ERROR", message: "El nombre debe tener entre 2 y 100 caracteres." };
  }

  try {
    await auth.api.updateUser({
      body: { name },
      headers: await headers(),
    });
    revalidatePath("/profile");
    return { status: "SUCCESS", message: "Nombre actualizado." };
  } catch {
    return { status: "ERROR", message: "No se pudo actualizar el nombre." };
  }
}

export async function changeProfilePasswordAction(
  _previous: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const currentPassword = passwordValue(formData, "currentPassword");
  const newPassword = passwordValue(formData, "newPassword");
  const confirmPassword = passwordValue(formData, "confirmPassword");

  if (currentPassword === "") {
    return { status: "ERROR", message: "Ingresa tu contraseña actual." };
  }
  if (newPassword.length < 12 || newPassword.length > 128) {
    return { status: "ERROR", message: "La nueva contraseña debe tener entre 12 y 128 caracteres." };
  }
  if (newPassword !== confirmPassword) {
    return { status: "ERROR", message: "La confirmación no coincide con la nueva contraseña." };
  }
  if (newPassword === currentPassword) {
    return { status: "ERROR", message: "La nueva contraseña debe ser distinta de la actual." };
  }

  try {
    await auth.api.changePassword({
      body: {
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      },
      headers: await headers(),
    });
    return {
      status: "SUCCESS",
      message: "Contraseña actualizada. Las demás sesiones activas fueron cerradas.",
    };
  } catch {
    return {
      status: "ERROR",
      message: "No se pudo cambiar la contraseña. Verifica la contraseña actual.",
    };
  }
}

export async function changeProfileEmailAction(
  _previous: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const newEmail = textValue(formData, "newEmail").toLocaleLowerCase("en-US");
  const currentPassword = passwordValue(formData, "currentPassword");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail) || newEmail.length > 254) {
    return { status: "ERROR", message: "Ingresa un correo electrónico válido." };
  }
  if (currentPassword === "") {
    return { status: "ERROR", message: "Confirma tu contraseña actual para cambiar el correo." };
  }

  try {
    const requestHeaders = await headers();
    const session = await auth.api.getSession({ headers: requestHeaders });
    if (session === null) {
      return { status: "ERROR", message: "Tu sesión ya no está activa. Vuelve a iniciar sesión." };
    }
    if (session.user.email.toLocaleLowerCase("en-US") === newEmail) {
      return { status: "ERROR", message: "El nuevo correo es igual al correo actual." };
    }
    if (!canChangeEmailWithoutTransactionalDelivery(session.user.emailVerified)) {
      return {
        status: "ERROR",
        message:
          "Esta cuenta tiene el correo verificado. El cambio requiere verificación por email, función que aún no está configurada en Compensa.",
      };
    }

    await auth.api.verifyPassword({
      body: { password: currentPassword },
      headers: requestHeaders,
    });
    await auth.api.changeEmail({
      body: { newEmail, callbackURL: "/profile" },
      headers: requestHeaders,
    });
    revalidatePath("/profile");
    return {
      status: "SUCCESS",
      message: "Correo actualizado. Úsalo en tu próximo inicio de sesión.",
    };
  } catch {
    return {
      status: "ERROR",
      message: "No se pudo cambiar el correo. Verifica la contraseña y que el correo esté disponible.",
    };
  }
}
