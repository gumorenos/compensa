"use client";

import Link from "next/link";
import { authClient } from "../src/auth/client.js";

export function SessionNav() {
  const { data: session } = authClient.useSession();
  if (session === null || session === undefined) return null;

  return (
    <div className="session-nav">
      <Link href="/profile" className="session-user session-profile-link" aria-label="Abrir mi perfil">
        {session.user.name}
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
