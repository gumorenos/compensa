import { requireRequestAccess } from "../../src/auth/access.js";
import { ProfileForms } from "./profile-forms.js";
import { ProfileSessions } from "./profile-sessions.js";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const access = await requireRequestAccess("VIEW");

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <span className="eyebrow">Cuenta</span>
          <h1>Mi perfil</h1>
          <p className="muted">
            Administra tus datos básicos, contraseña y sesiones activas de Compensa.
          </p>
        </div>
      </div>

      <ProfileForms
        initialName={access.user.name}
        email={access.user.email}
        organizationName={access.organization.name}
        role={access.role}
      />
      <ProfileSessions />
    </div>
  );
}
