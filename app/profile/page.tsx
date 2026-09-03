import { requireRequestAccess } from "../../src/auth/access.js";
import { ProfileForms } from "./profile-forms.js";

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
            Administra tus datos básicos y la contraseña usada para ingresar a Compensa.
          </p>
        </div>
      </div>

      <ProfileForms
        initialName={access.user.name}
        email={access.user.email}
        organizationName={access.organization.name}
        role={access.role}
      />
    </div>
  );
}
