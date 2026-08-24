"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import {
  calibrationCandidateSpreadsheetAction,
  type CalibrationCandidateImportActionState,
} from "./calibration-candidate-import-actions.js";

export function CalibrationCandidateImportForm({
  runId,
  partition,
}: {
  runId: string;
  partition: "CALIBRATION" | "HOLDOUT";
}) {
  const initialState: CalibrationCandidateImportActionState = {
    status: "IDLE",
    runId,
    fileName: "",
    canonicalPayload: "",
    preview: null,
    message: null,
    importedCount: 0,
    overwrittenCount: 0,
  };
  const [state, formAction, isPending] = useActionState(calibrationCandidateSpreadsheetAction, initialState);
  const [fileChanged, setFileChanged] = useState(false);

  useEffect(() => {
    if (state.status === "PREVIEW") setFileChanged(false);
  }, [state.status, state.canonicalPayload]);

  const canImport = state.preview?.canImport === true && state.canonicalPayload !== "" && !fileChanged;
  const holdout = partition === "HOLDOUT";

  return (
    <div className="stack">
      <form action={formAction} className="card card-pad">
        <div className="section-head" style={{ marginBottom: 18 }}>
          <div>
            <span className="eyebrow">Excel / CSV</span>
            <h2 style={{ marginTop: 6 }}>Cargar candidatos en lote</h2>
            <p className="muted" style={{ marginBottom: 0 }}>
              Completa <code>codigo_nivel</code> para cada dimensión. Cada caso incluido debe ser evaluable por completo; el lote se guarda de forma atómica.
            </p>
          </div>
          <span className="badge">{partition}</span>
        </div>

        {holdout && (
          <div className="notice" style={{ marginBottom: 18 }}>
            <strong>Holdout ciego.</strong>
            <span>Ni la plantilla ni el preview revelan niveles expertos, puntos, grados o métricas. El feedback aparecerá solo cuando completes toda la corrida.</span>
          </div>
        )}

        <div className="form-actions" style={{ marginBottom: 18 }}>
          <a className="button button-small button-secondary" href={`/api/calibration/${runId}/template/xlsx`}>
            Descargar plantilla Excel
          </a>
          <a className="button button-small button-secondary" href={`/api/calibration/${runId}/template/csv`}>
            Descargar plantilla CSV
          </a>
        </div>

        <div className="field">
          <label htmlFor="calibration-candidate-spreadsheet">Archivo *</label>
          <input
            id="calibration-candidate-spreadsheet"
            name="spreadsheetFile"
            type="file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={() => setFileChanged(true)}
          />
          <small className="muted">Máximo 5 MiB, 5.000 filas y 64 columnas. No se permiten fórmulas.</small>
        </div>

        <input type="hidden" name="runId" value={runId} />
        <input type="hidden" name="canonicalPayload" value={state.canonicalPayload} />
        <input type="hidden" name="fileName" value={state.fileName} />

        <div className="form-actions">
          <button className="button" type="submit" name="intent" value="preview" disabled={isPending}>
            {isPending ? "Procesando…" : "Previsualizar archivo"}
          </button>
          <button
            className="button button-secondary"
            type="submit"
            name="intent"
            value="import"
            disabled={isPending || !canImport}
            title={canImport ? undefined : "Previsualiza el archivo actual y corrige todos los errores antes de guardar."}
          >
            Guardar lote validado
          </button>
        </div>

        {fileChanged && state.preview !== null && (
          <p className="muted" style={{ marginTop: 14, marginBottom: 0 }}>
            Cambiaste el archivo después del último dry-run. Previsualízalo otra vez antes de guardar.
          </p>
        )}

        {state.message !== null && (
          <div
            role="status"
            aria-live="polite"
            style={{
              marginTop: 18,
              padding: "12px 14px",
              borderRadius: 10,
              background: state.status === "ERROR" ? "#f8efdf" : "var(--primary-soft)",
              color: state.status === "ERROR" ? "var(--warning)" : "var(--primary)",
              fontSize: 14,
              fontWeight: 650,
            }}
          >
            {state.message}
          </div>
        )}
      </form>

      {state.status === "IMPORTED" && (
        <section className="card card-pad">
          <span className="eyebrow">Lote guardado</span>
          <h2 style={{ marginTop: 6 }}>{state.importedCount} candidatos actualizados</h2>
          <p className="muted">
            El archivo se volvió a validar dentro del servidor y se escribió en una sola transacción.
            {holdout ? " El holdout continúa ciego hasta completar la corrida." : " Ya puedes revisar el feedback de calibración."}
          </p>
          <Link className="button" href={`/calibration/${runId}`}>Volver a la corrida</Link>
        </section>
      )}

      {state.preview !== null && (
        <section className="card">
          <div className="card-pad section-head">
            <div>
              <span className="eyebrow">Dry-run · {state.fileName}</span>
              <h2 style={{ marginTop: 6 }}>Resultado por caso</h2>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span className="badge badge-success">{state.preview.validCases} válidos</span>
              {state.preview.overwriteCases > 0 && <span className="badge">{state.preview.overwriteCases} reemplazos</span>}
              {state.preview.invalidCases > 0 && <span className="badge badge-warning">{state.preview.invalidCases} inválidos</span>}
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Caso</th><th>Referencia</th><th>Estado</th>
                  {!holdout && <th>Puntos candidato</th>}
                  {!holdout && <th>Grado candidato</th>}
                  {!holdout && <th>Grado vs experto</th>}
                  <th>Observación</th>
                </tr>
              </thead>
              <tbody>
                {state.preview.cases.map((item) => (
                  <tr key={item.caseCode}>
                    <td><strong>{item.caseCode}</strong></td>
                    <td>{item.anonymizedLabel ?? "—"}</td>
                    <td>
                      <span className={`badge ${item.status === "INVALID" ? "badge-warning" : "badge-success"}`}>
                        {item.status === "READY" ? "Listo" : item.status === "OVERWRITE" ? "Reemplazo" : "Inválido"}
                      </span>
                    </td>
                    {!holdout && <td>{item.candidatePoints ?? "—"}</td>}
                    {!holdout && <td>{item.candidateGradeCode ?? "—"}</td>}
                    {!holdout && <td>{item.metrics === null ? "—" : item.metrics.gradeMatch ? "Exacto" : item.metrics.gradeWithinOne ? "±1" : `Distancia ${item.metrics.gradeDistance}`}</td>}
                    <td>{item.message ?? (holdout ? "Validación estructural correcta; feedback oculto." : "Sin observaciones")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
