"use client";

import { useState, type FormEvent } from "react";
import { authClient } from "../../src/auth/client.js";

export function SignInForm({ callbackURL }: { callbackURL: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    const result = await authClient.signIn.email({ email, password });
    if (result.error !== null) {
      setError("No se pudo iniciar sesión. Verifica tus credenciales.");
      setPending(false);
      return;
    }

    window.location.assign(callbackURL);
  }

  return (
    <form onSubmit={submit} className="stack compact-stack">
      <div className="field">
        <label htmlFor="email">Correo</label>
        <input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </div>
      <div className="field">
        <label htmlFor="password">Contraseña</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          minLength={12}
          required
        />
      </div>
      {error !== null && <div className="notice notice-warning">{error}</div>}
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}
