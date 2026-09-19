import { updateAIGovernanceAction } from "../../src/web/ai-governance-actions.js";
import { getAIGovernancePageData } from "../../src/web/ai-governance-runtime.js";

export const dynamic = "force-dynamic";

export default async function AIAssistanceGovernancePage() {
  const data = await getAIGovernancePageData();
  const { settings, externalProvider } = data;

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
          <span className="eyebrow">Organización</span>
          <h2 style={{ marginTop: 6 }}>Controles de asistencia</h2>
          <p className="muted" style={{ marginBottom: 0 }}>
            Estos permisos aplican únicamente a {data.organization.name}. No modifican la
            configuración de otras organizaciones ni habilitan proveedores por sí solos.
          </p>
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

      <section className="card card-pad stack">
        <div>
          <span className="eyebrow">Proveedor externo</span>
          <h2 style={{ marginTop: 6 }}>Preparación de configuración</h2>
          <p className="muted" style={{ marginBottom: 0 }}>
            Estado del metadato de despliegue para un futuro adapter externo. Esta superficie no
            resuelve credenciales, no prueba conexiones y no habilita tráfico.
          </p>
        </div>

        <div className="stack compact-stack">
          <p style={{ margin: 0 }}>
            <strong>Estado:</strong> {configurationStateLabel(externalProvider.state)}
          </p>
          <p style={{ margin: 0 }}>
            <strong>Proveedor:</strong> <code>{externalProvider.providerId ?? "—"}</code>
          </p>
          <p style={{ margin: 0 }}>
            <strong>Servicio:</strong> <code>{externalProvider.serviceId ?? "—"}</code>
          </p>
          <p style={{ margin: 0 }}>
            <strong>Modelo:</strong> <code>{externalProvider.modelId ?? "—"}</code>
          </p>
          <p style={{ margin: 0 }}>
            <strong>Referencia de secreto:</strong>{" "}
            {externalProvider.secretReferenceConfigured
              ? "Configurada y oculta."
              : "No configurada."}
          </p>
          <p style={{ margin: 0 }}>
            <strong>Allowlist:</strong>{" "}
            {externalProvider.allowlisted ? "Proveedor permitido." : "Sin autorización efectiva."}
          </p>
          <p style={{ margin: 0 }}>
            <strong>Adapter de red:</strong> No implementado.
          </p>
        </div>

        {externalProvider.issues.length > 0 ? (
          <div className="notice">
            <strong>La configuración externa no es utilizable.</strong>
            <ul style={{ margin: 0 }}>
              {externalProvider.issues.map((issue) => (
                <li key={issue}>{configurationIssueLabel(issue)}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <details className="card ai-limits">
        <summary>
          <span className="ai-limits-title">
            <span className="eyebrow">Límites vigentes</span>
            <strong>Seguridad y límites de esta configuración</strong>
          </span>
        </summary>
        <div className="ai-limits-content">
          <ul>
            <li>No conecta un modelo ni almacena API keys.</li>
            <li>No cambia puntos, grado, metodología ni estado de una valoración.</li>
            <li>No da acceso al Gold Standard, HOLDOUT o calibración a la IA.</li>
            <li>No sustituye la aceptación, modificación o rechazo explícito por una persona.</li>
          </ul>
        </div>
      </details>
    </div>
  );
}

function configurationStateLabel(state: string): string {
  if (state === "CONFIGURED") return "Metadatos completos; adapter todavía no disponible.";
  if (state === "INVALID") return "Configuración incompleta o inválida.";
  return "No configurado.";
}

function configurationIssueLabel(issue: string): string {
  switch (issue) {
    case "PARTIAL_CONFIGURATION":
      return "Faltan uno o más campos de provider, service, model o referencia de secreto.";
    case "INVALID_PROVIDER_ID":
      return "El identificador del proveedor no tiene un formato permitido.";
    case "INVALID_SERVICE_ID":
      return "El identificador del servicio no tiene un formato permitido.";
    case "INVALID_MODEL_ID":
      return "El identificador del modelo contiene caracteres no permitidos.";
    case "INVALID_SECRET_REFERENCE":
      return "La referencia de secreto debe usar el formato env:VARIABLE_NAME; no una API key.";
    case "PROVIDER_NOT_ALLOWLISTED":
      return "El proveedor no está incluido en la allowlist del despliegue.";
    default:
      return "La configuración externa contiene un valor no válido.";
  }
}
