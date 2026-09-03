"use client";

import { useState, type FormEvent } from "react";
import { authClient } from "../../src/auth/client.js";
import type { OrganizationRole } from "../../src/auth/access.js";

interface ProfileFormsProps {
  initialName: string;
  email: string;
  organizationName: string;
  role: OrganizationRole;
}

const roleLabels: Record<OrganizationRole, string> = {
  ADMIN: "Administrador",
  EVALUATOR: "Evaluador",
  REVIEWER: "Revisor",
};

export function ProfileForms({
  initialName,
  email,
  organizationName,
  role,
}: ProfileFormsProps) {
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profilePending, setProfilePending] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordPending, setPasswordPending] = useState(false);

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileError(null);
    setProfileMessage(null);
    setProfilePending(true);

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    if (name.length < 2 || name.length > 120) {
      setProfileError("El nombre debe tener entre 2 y 120 caracteres.");
      setProfilePending(false);
      return;
    }

    const result = await authClient.updateUser({ name });
    if (result.error !== null) {
      setProfileError("No se pudo actualizar el perfil. Inténtalo nuevamente.");
      setProfilePending(false);
      return;
    }

    setProfileMessage("Nombre actualizado correctamente.");
    setProfilePending(false);
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordPending(true);

    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");

    if (newPassword.length < 12 || newPassword.length > 128) {
      setPasswordError("La nueva contraseña debe tener entre 12 y 128 caracteres.");
      setPasswordPending(false);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("La confirmación no coincide con la nueva contraseña.");
      setPasswordPending(false);
      return;
    }
    if (currentPassword === newPassword) {
      setPasswordError("La nueva contraseña debe ser diferente de la actual.");
      setPasswordPending(false);
      return;
    }

    const result = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
    if (result.error !== null) {
      setPasswordError("No se pudo cambiar la contraseña. Verifica la contraseña actual.");
      setPasswordPending(false);
      return;
    }

    window.location.assign("/sign-in?passwordChanged=1");
  }

  return (
    <div className="grid grid-2 profile-grid">
      <section className="card card-pad stack">
        <div>
          <span className="eyebrow">Datos personales</span>
          <h2 style={{ marginTop: 6 }}>Identidad de la cuenta</h2>
          <p className="muted" style={{ marginBottom: 0 }}>
            El nombre aparece en la sesión y en las superficies donde Compensa identifica al usuario.
          </p>
        </div>

        <form onSubmit={updateProfile} className="stack compact-stack">
          <div className="field">
            <label htmlFor="profile-name">Nombre</label>
            <input
              id="profile-name"
              name="name"
              type="text"
              minLength={2}
              maxLength={120}
              defaultValue={initialName}
              autoComplete="name"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="profile-email">Correo</label>
            <input id="profile-email" type="email" value={email} readOnly aria-readonly="true" />
            <small className="muted">
              El cambio de correo se habilitará con un flujo de verificación separado; no se modifica
              silenciosamente desde este formulario.
            </small>
          </div>

          <div className="profile-account-context">
            <span><strong>Organización activa:</strong> {organizationName}</span>
            <span><strong>Rol:</strong> {roleLabels[role]}</span>
          </div>

          {profileError !== null && <div className="notice notice-warning">{profileError}</div>}
          {profileMessage !== null && <div className="notice">{profileMessage}</div>}

          <div className="form-actions">
            <button type="submit" className="button" disabled={profilePending}>
              {profilePending ? "Guardando…" : "Guardar perfil"}
            </button>
          </div>
        </form>
      </section>

      <section className="card card-pad stack">
        <div>
          <span className="eyebrow">Seguridad</span>
          <h2 style={{ marginTop: 6 }}>Cambiar contraseña</h2>
          <p className="muted" style={{ marginBottom: 0 }}>
            Debes ingresar tu contraseña actual. Por seguridad, al guardar se cerrarán las sesiones
            activas de tu cuenta y tendrás que ingresar nuevamente.
          </p>
        </div>

        <form onSubmit={changePassword} className="stack compact-stack">
          <div className="field">
            <label htmlFor="current-password">Contraseña actual</label>
            <input
              id="current-password"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              minLength={12}
              maxLength={128}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="new-password">Nueva contraseña</label>
            <input
              id="new-password"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="confirm-password">Confirmar nueva contraseña</label>
            <input
              id="confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
          </div>

          {passwordError !== null && <div className="notice notice-warning">{passwordError}</div>}

          <div className="form-actions">
            <button type="submit" className="button" disabled={passwordPending}>
              {passwordPending ? "Actualizando…" : "Cambiar contraseña"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
