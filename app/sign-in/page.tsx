import { SignInForm } from "./sign-in-form.js";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackURL?: string }>;
}) {
  const { callbackURL } = await searchParams;
  const safeCallback =
    callbackURL !== undefined && callbackURL.startsWith("/") && !callbackURL.startsWith("//")
      ? callbackURL
      : "/";

  return (
    <div className="auth-shell">
      <section className="card card-pad auth-card">
        <span className="eyebrow">Compensa</span>
        <h1>Ingresar</h1>
        <p className="muted">
          Accede con la cuenta asignada a tu organización. El registro público está deshabilitado.
        </p>
        <SignInForm callbackURL={safeCallback} />
      </section>
    </div>
  );
}
