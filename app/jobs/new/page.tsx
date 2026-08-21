import Link from "next/link";
import { getAppContext } from "../../../src/web/runtime.js";
import { createJobAction } from "../../../src/web/actions.js";

export const dynamic = "force-dynamic";

export default async function NewJobPage() {
  await getAppContext("MANAGE_JOBS");

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Puestos</span>
          <h1>Nuevo puesto</h1>
          <p className="muted">Registra los datos base y luego incorpora su descriptivo versionado.</p>
        </div>
      </div>

      <section className="card card-pad form-card">
        <form action={createJobAction}>
          <div className="form-grid">
            <div className="field field-full">
              <label htmlFor="name">Nombre del puesto *</label>
              <input id="name" name="name" type="text" required autoFocus placeholder="Ej. Jefe de Planeamiento" />
            </div>
            <div className="field">
              <label htmlFor="code">Código</label>
              <input id="code" name="code" type="text" placeholder="Ej. FIN-001" />
            </div>
            <div className="field">
              <label htmlFor="department">Departamento</label>
              <input id="department" name="department" type="text" placeholder="Ej. Finanzas" />
            </div>
            <div className="field">
              <label htmlFor="area">Área</label>
              <input id="area" name="area" type="text" placeholder="Ej. Planeamiento" />
            </div>
            <div className="field">
              <label htmlFor="jobFamily">Familia</label>
              <input id="jobFamily" name="jobFamily" type="text" placeholder="Ej. Finanzas" />
            </div>
          </div>
          <div className="form-actions">
            <button className="button" type="submit">Guardar puesto</button>
            <Link href="/" className="button button-secondary">Cancelar</Link>
          </div>
        </form>
      </section>
    </>
  );
}
