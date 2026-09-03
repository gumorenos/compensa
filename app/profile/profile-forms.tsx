"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  changeProfileEmailAction,
  changeProfilePasswordAction,
  initialProfileActionState,
  updateProfileNameAction,
  type ProfileActionState,
} from "../../src/web/profile-actions.js";

function SubmitButton({ children }: Readonly<{ children: React.ReactNode }>) {
  const { pending } = useFormStatus();
  return (
    <button className="button" type="submit" disabled={pending}>
      {pending ? "Guardando…" : children}
    </button>
  );
}

function Feedback({ state }: Readonly<{ state: ProfileActionState }>) {
  if (state.status === "IDLE") return null;
  return (
    <p
      className={`profile-feedback ${state.status === "SUCCESS" ? "profile-feedback-success" : "profile-feedback-error"}`}
      role={state.status === "ERROR" ? "alert" : "status"}
      aria-live="polite"
    >
      {state.message}
    </p>
  );
}

export function ProfileForms({
  name,
  email,
  emailVerified,
}: Readonly<{
  name: string;
  email: string;
  emailVerified: boolean;
}>) {
  const [nameState, nameAction] = useActionState(updateProfileNameAction, initialProfileActionState);
  const [emailState, emailAction] = useActionState(changeProfileEmailAction, initialProfileActionState);
  const [passwordState, passwordAction] = useActionState(
    changeProfilePasswordAction,
    initialProfileActionState,
  );

  return (
    <div className="profile-grid">
      <section className="card card-pad profile-card">
        <div className="profile-section-head">
          <div>
            <span className="eyebrow">Datos personales</span>
            <h2>Nombre</h2>
          </div>
        </div>
        <form action={nameAction} className="profile-form">
          <div className="field">
            <label htmlFor="profile-name">Nombre visible</label>
            <input
              id="profile-name"
              name="name"
              type="text"
              defaultValue={name}
              minLength={2}
              maxLength={100}
              autoComplete="name"
              required
            />
            <small className="muted">Se muestra en tu sesión y en futuras acciones atribuibles a tu cuenta.</small>
          </div>
          <Feedback state={nameState} />
          <div className="form-actions">
            <SubmitButton>Actualizar nombre</SubmitButton>
          </div>
        </form>
      </section>

      <section className="card card-pad profile-card">
        <div className="profile-section-head">
          <div>
            <span className="eyebrow">Acceso</span>
            <h2>Correo electrónico</h2>
          </div>
          <span className={`badge ${emailVerified ? "badge-success" : "badge-warning"}`}>
            {emailVerified ? "Verificado" : "No verificado"}
          </span>
        </div>
        <dl className="profile-current-value">
          <dt>Correo actual</dt>
          <dd>{email}</dd>
        </dl>

        {emailVerified ? (
          <div className="profile-notice">
            <strong>Cambio temporalmente no disponible</strong>
            <p>
              Una cuenta con correo verificado requiere confirmar el nuevo correo. Compensa aún no tiene configurado el envío transaccional necesario y no omitirá esa verificación.
            </p>
          </div>
        ) : (
          <form action={emailAction} className="profile-form">
            <div className="field">
              <label htmlFor="profile-email">Nuevo correo</label>
              <input
                id="profile-email"
                name="newEmail"
                type="email"
                maxLength={254}
                autoComplete="email"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="profile-email-password">Contraseña actual</label>
              <input
                id="profile-email-password"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
              />
              <small className="muted">La contraseña se verifica antes de solicitar el cambio de correo.</small>
            </div>
            <Feedback state={emailState} />
            <div className="form-actions">
              <SubmitButton>Cambiar correo</SubmitButton>
            </div>
          </form>
        )}
      </section>

      <section className="card card-pad profile-card profile-card-wide">
        <div className="profile-section-head">
          <div>
            <span className="eyebrow">Seguridad</span>
            <h2>Contraseña</h2>
          </div>
        </div>
        <form action={passwordAction} className="profile-form profile-password-grid">
          <div className="field">
            <label htmlFor="profile-current-password">Contraseña actual</label>
            <input
              id="profile-current-password"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="profile-new-password">Nueva contraseña</label>
            <input
              id="profile-new-password"
              name="newPassword"
              type="password"
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              required
            />
            <small className="muted">Entre 12 y 128 caracteres.</small>
          </div>
          <div className="field">
            <label htmlFor="profile-confirm-password">Confirmar nueva contraseña</label>
            <input
              id="profile-confirm-password"
              name="confirmPassword"
              type="password"
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              required
            />
          </div>
          <div className="profile-form-footer">
            <Feedback state={passwordState} />
            <p className="muted profile-security-note">
              Al cambiarla se cerrarán las demás sesiones activas de tu cuenta; esta sesión permanece abierta.
            </p>
            <div className="form-actions">
              <SubmitButton>Cambiar contraseña</SubmitButton>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
