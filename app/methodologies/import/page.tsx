import Link from "next/link";
import { MethodologyImportForm } from "../../../src/web/methodology-import-form.js";
import { MethodologySpreadsheetForm } from "../../../src/web/methodology-spreadsheet-form.js";
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

      <section className="card card-pad" style={{ marginBottom: 24 }}>
        <span className="eyebrow">Recomendado</span>
        <h2 style={{ marginTop: 6 }}>Trabaja con Excel o CSV</h2>
        <p className="muted" style={{ marginBottom: 0 }}>
          Descarga la plantilla, completa filas tabulares y vuelve a subirla. Compensa la convierte al mismo contrato determinístico del motor; JSON queda disponible como vía avanzada.
        </p>
      </section>

      <MethodologySpreadsheetForm />

      <details className="details-block card" style={{ marginTop: 24 }}>
        <summary>Vía avanzada: importar JSON directamente</summary>
        <div style={{ paddingTop: 18 }}>
          <MethodologyImportForm />
        </div>
      </details>

      <section className="card card-pad" style={{ marginTop: 24 }}>
        <span className="eyebrow">Formato permitido</span>
        <h2 style={{ marginTop: 6 }}>DSL determinístico, no código ejecutable</h2>
        <p className="muted">
          Tanto Excel/CSV como JSON terminan en la misma definición: factores, dimensiones, niveles, grados y pasos de scoring. Los únicos pasos admitidos son <code>lookup</code>, <code>sum</code>, <code>multiply</code>, <code>divide</code> y <code>round</code>. Las referencias numéricas solo pueden apuntar a pasos anteriores o constantes finitas.
        </p>
        <p className="muted" style={{ marginBottom: 0 }}>
          No cargues manuales completos de terceros ni contenido para el cual no tengas licencia o autorización. Compensa almacena la fuente declarada para trazabilidad, pero no verifica ni concede derechos de propiedad intelectual.
        </p>
      </section>
    </>
  );
}
