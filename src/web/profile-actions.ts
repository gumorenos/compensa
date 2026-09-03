"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "../auth/server.js";

export interface ProfileActionState {
  status: "IDLE" | "SUCCESS" | "ERROR";
  message: string;
}

export const initialProfileActionState: ProfileActionState = {
  status: "IDLE",
  message: "",
};

function value(formData: FormData, field: string): string {
  const raw = formData.get(field);
  return typeof raw === "string" ? raw.trim() : "";
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim() !== "") return error.message;
  return fallback;
}

export function canChangeEmailWithoutTransactionalDelivery(emailVerified: boolean): boolean {
  return emailVerified === false;
}

export async function updateProfileNameAction(
  _previous: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const name = value(formData, "name");
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
  } catch (error) {
    return { status: "ERROR", message: errorMessage(error, "No se pudo actualizar el nombre.") };
  }
}

export async function changeProfilePasswordAction(
  _previous: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const currentPassword = value(formData, "currentPassword");
  const newPassword = value(formData, "newPassword");
  const confirmPassword = value(formData, "confirmPassword");

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
  } catch (error) {
    return { status: "ERROR", message: errorMessage(error, "No se pudo cambiar la contraseña.") };
  }
}

export async function changeProfileEmailAction(
  _previous: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const newEmail = value(formData, "newEmail").toLocaleLowerCase("en-US");
  const currentPassword = value(formData, "currentPassword");
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
  } catch (error) {
    return { status: "ERROR", message: errorMessage(error, "No se pudo cambiar el correo.") };
  }
}
