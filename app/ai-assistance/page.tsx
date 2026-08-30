import { updateAIGovernanceAction } from "../../src/web/ai-governance-actions.js";
import { getAIGovernancePageData } from "../../src/web/ai-governance-runtime.js";

export const dynamic = "force-dynamic";

export default async function AIAssistanceGovernancePage() {
  const data = await getAIGovernancePageData();
  const { settings } = data;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <span className="eyebrow">Administración</span>
          <h1>Asistencia IA</h1>
          <p className="muted">
            Controla si {data.organization.name} permite usar funciones asistivas de IA y si,
            en una etapa posterior, podrá enviar contenido a un proveedor externo.
          </p>
        </div>
      </div>

      <div className="notice">
        <strong>No hay un proveedor externo conectado.</strong>
        <span>
          Activar estas opciones no envía descriptivos, valoraciones ni evidencia fuera de
          Compensa. La autorización de procesamiento externo es solo un requisito de gobernanza
          para un incremento futuro y no habilita tráfico por sí misma.
        </span>
      </div>

      <section className="card card-pad stack">
        <div>
          <span className="eyebrow">Tenant</span>
          <h2 style={{ marginTop: 6 }}>Controles de asistencia</h2>
        </div>

        <form action={updateAIGovernanceAction} className="stack compact-stack">
          <label className="checkbox-row">
            <input
              type="checkbox"
              name="assistanceEnabled"
              value="yes"
              defaultChecked={settings.assistanceEnabled}
            />
            <span>
              <strong>Habilitar asistencia IA</strong>
              <small>
                Autoriza a Compensa a ofrecer funciones asistivas cuando exista una superficie
                operativa habilitada. El scoring determinístico y el workflow siguen siendo la
                fuente autoritativa.
              </small>
            </span>
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              name="externalProcessingAllowed"
              value="yes"
              defaultChecked={settings.externalProcessingAllowed}
            />
            <span>
              <strong>Permitir procesamiento externo</strong>
              <small>
                Registra consentimiento para que, una vez configurado y revisado un proveedor,
                contenido del puesto pueda salir de la infraestructura de Compensa. Si se
                deshabilita la asistencia, este permiso se revoca automáticamente.
              </small>
            </span>
          </label>

          <div className="form-actions">
            <button type="submit" className="button">Guardar configuración</button>
          </div>
        </form>

        <div className="muted">
          {settings.updatedAt === null ? (
            <span>No existe configuración previa: por defecto la asistencia está deshabilitada.</span>
          ) : (
            <span>
              Última actualización registrada: {settings.updatedAt.toISOString()} UTC.
            </span>
          )}
        </div>
      </section>

      <section className="card card-pad">
        <span className="eyebrow">Límites vigentes</span>
        <h2 style={{ marginTop: 6 }}>Lo que esta configuración no hace</h2>
        <ul>
          <li>No conecta un modelo ni almacena API keys.</li>
          <li>No cambia puntos, grado, metodología ni estado de una valoración.</li>
          <li>No da acceso al Gold Standard, HOLDOUT o calibración a la IA.</li>
          <li>No sustituye la aceptación, modificación o rechazo explícito por una persona.</li>
        </ul>
      </section>
    </div>
  );
}
