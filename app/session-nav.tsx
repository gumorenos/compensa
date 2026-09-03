"use client";

import Link from "next/link";
import { authClient } from "../src/auth/client.js";

export function SessionNav() {
  const { data: session } = authClient.useSession();
  if (session === null || session === undefined) return null;

  return (
    <div className="session-nav">
      <Link href="/profile" className="session-user session-profile-link" title="Abrir mi perfil">
        <span className="session-user-name">{session.user.name}</span>
        <span className="session-profile-mobile">Perfil</span>
      </Link>
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
