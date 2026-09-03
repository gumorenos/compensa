import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../../src/auth/server.js";
import { ProfileForms } from "./profile-forms.js";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session === null) redirect("/sign-in?callbackURL=/profile");

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Cuenta</span>
          <h1>Mi perfil</h1>
          <p className="muted">
            Administra tus datos personales y credenciales de acceso. Estos cambios pertenecen a tu cuenta y no a una organización específica.
          </p>
        </div>
      </div>

      <ProfileForms
        name={session.user.name}
        email={session.user.email}
        emailVerified={session.user.emailVerified}
      />
    </>
  );
}
