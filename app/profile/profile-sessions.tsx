"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { authClient } from "../../src/auth/client.js";

type SessionList = NonNullable<Awaited<ReturnType<typeof authClient.listSessions>>["data"]>;
type ActiveSession = SessionList[number];

function formatDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function sessionLabel(userAgent: string | null | undefined): string {
  const normalized = userAgent?.trim();
  if (!normalized) return "Dispositivo no identificado";
  if (/iphone|ipad/i.test(normalized)) return "iPhone / iPad";
  if (/android/i.test(normalized)) return "Android";
  if (/windows/i.test(normalized)) return "Windows";
  if (/macintosh|mac os/i.test(normalized)) return "Mac";
  if (/linux/i.test(normalized)) return "Linux";
  return "Navegador / dispositivo";
}

export function ProfileSessions() {
  const { data: currentSession } = authClient.useSession();
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyToken, setBusyToken] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const currentToken = currentSession?.session.token ?? null;
  const sessionIdentityReady = currentToken !== null;

  const loadSessions = useCallback(async () => {
    setError(null);
    const result = await authClient.listSessions();
    if (result.error !== null || result.data === null) {
      setSessions([]);
      setError("No se pudieron cargar las sesiones activas.");
      setLoading(false);
      return;
    }

    setSessions(
      [...result.data].sort(
        (left, right) =>
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
      ),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const otherSessionCount = useMemo(
    () =>
      sessionIdentityReady
        ? sessions.filter((session) => session.token !== currentToken).length
        : 0,
    [currentToken, sessionIdentityReady, sessions],
  );

  async function revokeOne(token: string) {
    if (!sessionIdentityReady || token === currentToken) return;
    setBusyToken(token);
    setError(null);
    setMessage(null);
    const result = await authClient.revokeSession({ token });
    if (result.error !== null) {
      setError("No se pudo cerrar esa sesión. Inténtalo nuevamente.");
      setBusyToken(null);
      return;
    }
    await loadSessions();
    setBusyToken(null);
    setMessage("Sesión cerrada correctamente.");
  }

  async function revokeOthers() {
    if (!sessionIdentityReady || otherSessionCount === 0) return;
    setRevokingOthers(true);
    setError(null);
    setMessage(null);
    const result = await authClient.revokeOtherSessions();
    if (result.error !== null) {
      setError("No se pudieron cerrar las otras sesiones.");
      setRevokingOthers(false);
      return;
    }
    await loadSessions();
    setRevokingOthers(false);
    setMessage("Las otras sesiones fueron cerradas.");
  }

  return (
    <section className="card card-pad stack profile-sessions-card">
      <div className="profile-section-head">
        <div>
          <span className="eyebrow">Sesiones</span>
          <h2 style={{ marginTop: 6 }}>Dónde has iniciado sesión</h2>
          <p className="muted" style={{ marginBottom: 0 }}>
            Revisa las sesiones activas de tu cuenta y cierra las que ya no reconozcas o necesites.
          </p>
        </div>
        <button
          type="button"
          className="button button-secondary button-small"
          onClick={() => void revokeOthers()}
          disabled={!sessionIdentityReady || loading || revokingOthers || otherSessionCount === 0}
        >
          {revokingOthers ? "Cerrando…" : "Cerrar otras sesiones"}
        </button>
      </div>

      {error !== null && <div className="notice notice-warning">{error}</div>}
      {message !== null && <div className="notice">{message}</div>}

      {loading ? (
        <p className="muted" style={{ margin: 0 }}>Cargando sesiones…</p>
      ) : sessions.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>No hay sesiones activas para mostrar.</p>
      ) : (
        <div className="profile-session-list">
          {sessions.map((session) => {
            const isCurrent = sessionIdentityReady && session.token === currentToken;
            return (
              <article className="profile-session-row" key={session.id}>
                <div className="stack compact-stack">
                  <div className="profile-session-title">
                    <strong>{sessionLabel(session.userAgent)}</strong>
                    {isCurrent && <span className="badge badge-success">Esta sesión</span>}
                  </div>
                  <div className="profile-session-meta">
                    <span>Iniciada: {formatDate(session.createdAt)}</span>
                    <span>Expira: {formatDate(session.expiresAt)}</span>
                    {session.ipAddress ? <span>IP: {session.ipAddress}</span> : null}
                  </div>
                </div>
                {!sessionIdentityReady ? (
                  <span className="muted profile-session-current">Identificando sesión…</span>
                ) : isCurrent ? (
                  <span className="muted profile-session-current">En uso</span>
                ) : (
                  <button
                    type="button"
                    className="text-button profile-session-revoke"
                    disabled={busyToken !== null || revokingOthers}
                    onClick={() => void revokeOne(session.token)}
                  >
                    {busyToken === session.token ? "Cerrando…" : "Cerrar sesión"}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
