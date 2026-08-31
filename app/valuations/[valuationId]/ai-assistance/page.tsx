import Link from "next/link";
import { notFound } from "next/navigation";
import {
  generateAIAssistanceAction,
  resolveAIAssistanceSuggestionAction,
} from "../../../../src/web/ai-assistance-actions.js";
import { getAIAssistancePageData } from "../../../../src/web/ai-assistance-runtime.js";

export const dynamic = "force-dynamic";

export default async function ValuationAIAssistancePage({
  params,
}: {
  params: Promise<{ valuationId: string }>;
}) {
  const { valuationId } = await params;
  const data = await getAIAssistancePageData(valuationId);
  if (data === null) notFound();

  const editableStatus = data.valuationStatus === "DRAFT" || data.valuationStatus === "RETURNED";
  const canGenerate =
    editableStatus &&
    data.hasPinnedDescription &&
    data.canEvaluate &&
    data.workflow.settings.assistanceEnabled &&
    data.workflow.provider.available;
  const canResolve =
    editableStatus && data.canEvaluate && data.workflow.settings.assistanceEnabled;
  const dimensions = new Map(
    data.methodology.factors.flatMap((factor) =>
      factor.dimensions.map((dimension) => [dimension.code, dimension] as const),
    ),
  );
  const latest = data.workflow.latest;
  const localFixtureRun = latest?.run.providerId === "LOCAL_FIXTURE";

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <span className="eyebrow">Valoración · asistencia opcional</span>
          <h1>Asistencia IA · {data.jobName}</h1>
          <p className="muted">
            Las sugerencias son apoyo para el evaluador. No cambian puntos, grado ni decisiones
            hasta que una persona las acepte o modifique explícitamente.
          </p>
        </div>
        <Link href={`/valuations/${data.valuationId}`} className="button button-secondary">
          Volver a valoración
        </Link>
      </div>

      {!data.workflow.settings.assistanceEnabled && (
        <div className="notice">
          <strong>Asistencia deshabilitada para {data.organizationName}.</strong>
          <span>
            La valoración manual sigue disponible sin cambios. Un ADMIN puede habilitar la
            asistencia desde la configuración de IA del tenant.
          </span>
        </div>
      )}

      {data.workflow.settings.assistanceEnabled && !data.workflow.provider.available && (
        <div className="notice">
          <strong>No hay un proveedor de asistencia configurado en este entorno.</strong>
          <span>
            Las corridas históricas siguen siendo consultables, pero no se puede generar una nueva.
          </span>
        </div>
      )}

      {!data.hasPinnedDescription && (
        <div className="notice">
          <strong>Esta valoración no tiene un descriptivo anclado.</strong>
          <span>
            El flujo manual sigue disponible, pero la asistencia requiere una versión de
            descriptivo fijada a la valoración. Las corridas históricas, si existieran, permanecen
            en solo lectura.
          </span>
        </div>
      )}

      {data.workflow.provider.testFixture && (
        <div className="notice notice-warning">
          <strong>Modo de prueba local.</strong>
          <span>
            {data.workflow.provider.displayName} funciona dentro del proceso, no llama servicios
            externos y produce una salida determinística para probar el workflow. Sus niveles no
            son recomendaciones reales de IA.
          </span>
        </div>
      )}

      {!editableStatus && (
        <div className="notice">
          <strong>Solo lectura.</strong>
          <span>
            La valoración está en estado {data.valuationStatus}; no se pueden generar ni resolver
            sugerencias mientras no sea DRAFT o RETURNED.
          </span>
        </div>
      )}

      {editableStatus && !data.canEvaluate && (
        <div className="notice">
          <strong>Solo lectura para tu rol.</strong>
          <span>Se requiere permiso EVALUATE para generar o resolver asistencia.</span>
        </div>
      )}

      <section className="card card-pad stack">
        <div>
          <span className="eyebrow">Generación</span>
          <h2 style={{ marginTop: 6 }}>Nueva corrida de asistencia</h2>
          <p className="muted">
            La corrida usa únicamente el descriptivo fijado y los factores/niveles de la
            metodología de esta valoración. El motor de scoring no forma parte de la entrada.
          </p>
        </div>
        {canGenerate ? (
          <form action={generateAIAssistanceAction}>
            <input type="hidden" name="valuationId" value={data.valuationId} />
            <button type="submit" className="button">
              Generar asistencia de prueba
            </button>
          </form>
        ) : (
          <p className="muted">La generación no está disponible con la configuración o estado actual.</p>
        )}
      </section>

      {latest === null ? (
        <section className="card card-pad">
          <span className="eyebrow">Sugerencias</span>
          <h2 style={{ marginTop: 6 }}>Sin corridas registradas</h2>
          <p className="muted">Todavía no existe asistencia persistida para esta valoración.</p>
        </section>
      ) : (
        <>
          <section className="card card-pad stack">
            <div>
              <span className="eyebrow">Última corrida</span>
              <h2 style={{ marginTop: 6 }}>
                {localFixtureRun ? "Fixture local · no es recomendación real" : "Asistencia registrada"}
              </h2>
              <p className="muted">
                {latest.run.providerId}
                {latest.run.modelId === null ? "" : ` · ${latest.run.modelId}`} · prompt {latest.run.promptVersion}
                {" · "}{latest.run.completedAt.toISOString()} UTC
              </p>
            </div>

            {latest.run.suggestions.map((suggestion) => {
              const dimension = dimensions.get(suggestion.dimensionCode);
              const resolution = latest.resolutions[suggestion.id];
              const alternativeLevels =
                dimension?.levels.filter((level) => level.code !== suggestion.suggestedLevelCode) ?? [];

              return (
                <article className="support-block" key={suggestion.id}>
                  <div className="support-head">
                    <div>
                      <span className="eyebrow">{suggestion.dimensionCode}</span>
                      <h3>{dimension?.name ?? suggestion.dimensionCode}</h3>
                    </div>
                    <div className="badge-row">
                      <span className="badge">
                        {suggestion.suggestedLevelCode === null
                          ? "Abstención"
                          : `Sugiere ${suggestion.suggestedLevelCode}`}
                      </span>
                      {suggestion.confidence !== null && (
                        <span className="badge">Confianza {Math.round(suggestion.confidence * 100)}%</span>
                      )}
                    </div>
                  </div>

                  <p>{suggestion.rationale}</p>
                  {suggestion.evidence.length > 0 && (
                    <div className="evidence-list">
                      {suggestion.evidence.map((evidence) => (
                        <div className="evidence-item" key={evidence.id}>
                          <strong>Evidencia anclada al descriptivo</strong>
                          {evidence.sourceSection !== null && <span> · {evidence.sourceSection}</span>}
                          <blockquote>{evidence.excerpt}</blockquote>
                        </div>
                      ))}
                    </div>
                  )}

                  {resolution !== undefined ? (
                    <div className="notice notice-success">
                      <strong>Resolución humana: {resolution.resolution}</strong>
                      <span>
                        {resolution.resolvedLevelCode === null
                          ? "Sin nivel aplicado"
                          : `Nivel aplicado: ${resolution.resolvedLevelCode}`}
                        {" · "}{resolution.createdAt.toISOString()} UTC
                      </span>
                      {resolution.note !== null && <span>Nota: {resolution.note}</span>}
                    </div>
                  ) : canResolve ? (
                    <div className="stack compact-stack">
                      {suggestion.suggestedLevelCode !== null && (
                        <details className="details-block">
                          <summary>Aceptar sugerencia</summary>
                          <form action={resolveAIAssistanceSuggestionAction} className="stack compact-stack">
                            <input type="hidden" name="valuationId" value={data.valuationId} />
                            <input type="hidden" name="suggestionId" value={suggestion.id} />
                            <input type="hidden" name="resolution" value="ACCEPTED" />
                            <div className="field">
                              <label htmlFor={`accept-justification-${suggestion.id}`}>
                                Justificación humana
                              </label>
                              <textarea
                                id={`accept-justification-${suggestion.id}`}
                                name="justification"
                                rows={3}
                                maxLength={5000}
                                placeholder="Opcional. No se copia automáticamente el rationale del fixture."
                              />
                            </div>
                            <div className="field">
                              <label htmlFor={`accept-note-${suggestion.id}`}>Nota de resolución</label>
                              <textarea id={`accept-note-${suggestion.id}`} name="note" rows={2} maxLength={2000} />
                            </div>
                            <button type="submit" className="button button-small">Aceptar nivel</button>
                          </form>
                        </details>
                      )}

                      {alternativeLevels.length > 0 && (
                        <details className="details-block">
                          <summary>
                            {suggestion.suggestedLevelCode === null
                              ? "Elegir nivel humano"
                              : "Modificar sugerencia"}
                          </summary>
                          <form action={resolveAIAssistanceSuggestionAction} className="stack compact-stack">
                            <input type="hidden" name="valuationId" value={data.valuationId} />
                            <input type="hidden" name="suggestionId" value={suggestion.id} />
                            <input type="hidden" name="resolution" value="MODIFIED" />
                            <div className="field">
                              <label htmlFor={`modify-level-${suggestion.id}`}>Nivel decidido por la persona *</label>
                              <select id={`modify-level-${suggestion.id}`} name="resolvedLevelCode" required>
                                <option value="">Seleccionar…</option>
                                {alternativeLevels.map((level) => (
                                  <option key={level.code} value={level.code}>
                                    {level.code} · {level.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="field">
                              <label htmlFor={`modify-justification-${suggestion.id}`}>Justificación humana</label>
                              <textarea
                                id={`modify-justification-${suggestion.id}`}
                                name="justification"
                                rows={3}
                                maxLength={5000}
                              />
                            </div>
                            <div className="field">
                              <label htmlFor={`modify-note-${suggestion.id}`}>Nota de resolución</label>
                              <textarea id={`modify-note-${suggestion.id}`} name="note" rows={2} maxLength={2000} />
                            </div>
                            <button type="submit" className="button button-small">Guardar nivel humano</button>
                          </form>
                        </details>
                      )}

                      <details className="details-block">
                        <summary>Rechazar sugerencia</summary>
                        <form action={resolveAIAssistanceSuggestionAction} className="stack compact-stack">
                          <input type="hidden" name="valuationId" value={data.valuationId} />
                          <input type="hidden" name="suggestionId" value={suggestion.id} />
                          <input type="hidden" name="resolution" value="REJECTED" />
                          <div className="field">
                            <label htmlFor={`reject-note-${suggestion.id}`}>Motivo / nota</label>
                            <textarea id={`reject-note-${suggestion.id}`} name="note" rows={2} maxLength={2000} />
                          </div>
                          <button type="submit" className="button button-secondary button-small">Rechazar</button>
                        </form>
                      </details>
                    </div>
                  ) : (
                    <p className="muted">Sugerencia sin resolver; los controles están deshabilitados.</p>
                  )}
                </article>
              );
            })}
          </section>

          {latest.run.clarifications.length > 0 && (
            <section className="card card-pad stack">
              <div>
                <span className="eyebrow">Preguntas de aclaración</span>
                <h2 style={{ marginTop: 6 }}>Información que convendría confirmar</h2>
              </div>
              {latest.run.clarifications.map((clarification) => (
                <div className="support-block" key={clarification.id}>
                  <strong>{clarification.question}</strong>
                  <p className="muted">
                    {clarification.dimensionCode === null ? "General" : clarification.dimensionCode}
                    {" · "}{clarification.reason}
                  </p>
                </div>
              ))}
            </section>
          )}
        </>
      )}

      <section className="card card-pad">
        <span className="eyebrow">Límite de autoridad</span>
        <h2 style={{ marginTop: 6 }}>La persona sigue decidiendo</h2>
        <ul>
          <li>Generar una corrida no escribe decisiones, puntos ni grado.</li>
          <li>Aceptar o modificar reutiliza el mismo motor determinístico de valoración.</li>
          <li>Rechazar no altera la valoración.</li>
          <li>El rationale del proveedor nunca se convierte automáticamente en justificación humana.</li>
          <li>Gold Standard, HOLDOUT y calibración no forman parte de este flujo.</li>
        </ul>
      </section>
    </div>
  );
}
