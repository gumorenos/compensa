import {
  clearAIProviderConfigurationAction,
  updateAIGovernanceAction,
  updateAIProviderConfigurationAction,
} from "../../src/web/ai-governance-actions.js";
import { getAIGovernancePageData } from "../../src/web/ai-governance-runtime.js";

export const dynamic = "force-dynamic";

export default async function AIAssistanceGovernancePage() {
  const data = await getAIGovernancePageData();
  const { settings, providerConfiguration } = data;

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
          Compensa. Puedes registrar metadata del proveedor sin habilitar tráfico; la autorización
          de procesamiento externo sigue siendo un requisito separado de gobernanza y esta metadata no habilita tráfico por sí misma.
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

      <section className="card card-pad stack" aria-labelledby="provider-config-title">
        <div className="section-head">
          <div>
            <span className="eyebrow">Proveedor externo</span>
            <h2 id="provider-config-title" style={{ marginTop: 6 }}>Metadata de conexión</h2>
          </div>
          <span className={providerConfiguration === null ? "badge" : "badge badge-success"}>
            {providerConfiguration === null ? "Sin configurar" : "Metadata registrada"}
          </span>
        </div>

        <p className="muted" style={{ margin: 0 }}>
          Esta sección prepara la configuración administrativa, pero todavía no crea un adapter,
          no resuelve credenciales y no realiza solicitudes de red.
        </p>

        <form action={updateAIProviderConfigurationAction} className="stack compact-stack">
          <div className="form-grid">
            <label className="field">
              <span>Proveedor</span>
              <input
                type="text"
                name="providerId"
                required
                maxLength={80}
                defaultValue={providerConfiguration?.providerId ?? ""}
                placeholder="Ej. openai"
                autoComplete="off"
              />
            </label>

            <label className="field">
              <span>Modelo / servicio</span>
              <input
                type="text"
                name="modelId"
                required
                maxLength={240}
                defaultValue={providerConfiguration?.modelId ?? ""}
                placeholder="Ej. gpt-5"
                autoComplete="off"
              />
            </label>

            <label className="field field-full">
              <span>Referencia de credencial</span>
              <input
                type="text"
                name="credentialReference"
                required
                maxLength={104}
                pattern="COMPENSA_AI_CREDENTIAL_[A-Z0-9_]+"
                defaultValue={providerConfiguration?.credentialReference ?? ""}
                placeholder="COMPENSA_AI_CREDENTIAL_PRIMARY"
                autoComplete="off"
              />
              <small className="muted">
                No pegues una API key aquí. Guarda únicamente el nombre de la referencia que
                deberá resolver el servidor cuando exista el mecanismo de secretos.
              </small>
            </label>
          </div>

          <div className="form-actions">
            <button type="submit" className="button">Guardar metadata</button>
          </div>
        </form>

        {providerConfiguration !== null && (
          <div className="stack compact-stack">
            <div className="muted">
              Última actualización de metadata: {providerConfiguration.updatedAt.toISOString()} UTC.
            </div>
            <form action={clearAIProviderConfigurationAction}>
              <button type="submit" className="button button-small button-secondary">
                Quitar metadata del proveedor
              </button>
            </form>
          </div>
        )}
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
            <li>La referencia de credencial no contiene ni expone la clave real.</li>
            <li>No cambia puntos, grado, metodología ni estado de una valoración.</li>
            <li>No da acceso al Gold Standard, HOLDOUT o calibración a la IA.</li>
            <li>No sustituye la aceptación, modificación o rechazo explícito por una persona.</li>
          </ul>
        </div>
      </details>
    </div>
  );
}
