import Link from "next/link";
import { MethodologyImportForm } from "../../../src/web/methodology-import-form.js";
import { getAppContext } from "../../../src/web/runtime.js";

export const dynamic = "force-dynamic";

export default async function MethodologyImportPage() {
  await getAppContext("MANAGE_METHODOLOGIES");

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Metodologías · Administración</span>
          <h1>Importar una versión</h1>
          <p className="muted">
            Carga una metodología de valoración que tu organización esté autorizada a utilizar. El dry-run valida estructura, referencias, rangos y el DSL de cálculo antes de crear una versión activa.
          </p>
        </div>
        <Link className="button button-secondary" href="/methodologies">Volver a metodologías</Link>
      </div>

      <MethodologyImportForm />

      <section className="card card-pad" style={{ marginTop: 24 }}>
        <span className="eyebrow">Formato permitido</span>
        <h2 style={{ marginTop: 6 }}>DSL determinístico, no código ejecutable</h2>
        <p className="muted">
          La definición contiene factores, dimensiones, niveles, grados y pasos de scoring. Los únicos pasos admitidos son <code>lookup</code>, <code>sum</code>, <code>multiply</code>, <code>divide</code> y <code>round</code>. Las referencias numéricas solo pueden apuntar a pasos anteriores o constantes finitas.
        </p>
        <p className="muted" style={{ marginBottom: 0 }}>
          No pegues manuales completos de terceros ni contenido para el cual no tengas licencia o autorización. Compensa almacena la fuente declarada para trazabilidad, pero no verifica ni concede derechos de propiedad intelectual.
        </p>
      </section>
    </>
  );
}
