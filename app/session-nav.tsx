"use client";

import { authClient } from "../src/auth/client.js";

export function SessionNav() {
  const { data: session } = authClient.useSession();
  if (session === null || session === undefined) return null;

  return (
    <div className="session-nav">
      <span className="session-user">{session.user.name}</span>
      <button
        type="button"
        className="text-button"
        onClick={async () => {
          await authClient.signOut();
          window.location.assign("/sign-in");
        }}
      >
        Salir
      </button>
    </div>
  );
}
