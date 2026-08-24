"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import {
  goldStandardSpreadsheetAction,
  type GoldStandardSpreadsheetActionState,
} from "./gold-standard-spreadsheet-actions.js";

const initialState: GoldStandardSpreadsheetActionState = {
  status: "IDLE",
  fileName: "",
  canonicalPayload: "",
  preview: null,
  message: null,
  importedCount: 0,
};

export function GoldStandardSpreadsheetForm() {
  const [state, formAction, isPending] = useActionState(goldStandardSpreadsheetAction, initialState);
  const [fileChanged, setFileChanged] = useState(false);

  useEffect(() => {
    if (state.status === "PREVIEW") setFileChanged(false);
  }, [state.status, state.canonicalPayload]);

  const canImport = state.preview?.canImport === true && state.canonicalPayload !== "" && !fileChanged;

  return (
    <div className="stack">
      <form action={formAction} className="card card-pad">
        <div className="section-head" style={{ marginBottom: 18 }}>
          <div>
            <span className="eyebrow">Excel / CSV</span>
            <h2 style={{ marginTop: 6 }}>Cargar archivo histórico</h2>
            <p className="muted" style={{ marginBottom: 0 }}>
              Una fila representa una decisión y, opcionalmente, una evidencia. Compensa agrupa las filas por <code>codigo_caso</code> y las convierte al mismo contrato validado que usa la importación JSON.
            </p>
          </div>
          <span className="badge">.xlsx · .csv</span>
        </div>

        <div className="form-actions" style={{ marginBottom: 18 }}>
          <a className="button button-small button-secondary" href="/api/templates/gold-standard.xlsx">Descargar plantilla Excel</a>
          <a className="button button-small button-secondary" href="/api/templates/gold-standard.csv">Descargar plantilla CSV</a>
        </div>

        <div className="field">
          <label htmlFor="gold-standard-spreadsheet">Archivo *</label>
          <input
            id="gold-standard-spreadsheet"
            name="spreadsheetFile"
            type="file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={() => setFileChanged(true)}
          />
          <small className="muted">Máximo 5 MiB, 5.000 filas y 64 columnas. No se permiten fórmulas en celdas.</small>
        </div>

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
            title={canImport ? undefined : "Previsualiza el archivo actual y corrige todos los errores antes de importar."}
          >
            Importar archivo validado
          </button>
        </div>

        {fileChanged && state.preview !== null && (
          <p className="muted" style={{ marginTop: 14, marginBottom: 0 }}>
            Cambiaste el archivo después del último dry-run. Previsualízalo otra vez antes de importar.
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
          <span className="eyebrow">Importación completada</span>
          <h2 style={{ marginTop: 6 }}>{state.importedCount} referencias incorporadas</h2>
          <p className="muted">El archivo pasó el dry-run nuevamente en servidor justo antes de la escritura atómica.</p>
          <Link className="button" href="/gold-standard">Ver Gold Standard</Link>
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
              {state.preview.invalidCases > 0 && <span className="badge badge-warning">{state.preview.invalidCases} inválidos</span>}
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Caso</th><th>Referencia</th><th>Estado</th><th>Puntos</th><th>Grado</th><th>Observaciones</th></tr>
              </thead>
              <tbody>
                {state.preview.cases.map((item) => (
                  <tr key={item.caseCode}>
                    <td><strong>{item.caseCode}</strong></td>
                    <td>{item.anonymizedLabel}</td>
                    <td><span className={`badge ${item.status === "VALID" ? "badge-success" : "badge-warning"}`}>{item.status === "VALID" ? "Válido" : "Inválido"}</span></td>
                    <td>{item.recalculatedPoints ?? "—"}</td>
                    <td>{item.recalculatedGradeCode ?? "—"}</td>
                    <td>
                      {item.issues.length === 0 ? <span className="muted">Sin observaciones</span> : (
                        <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
                          {item.issues.map((issue, index) => <li key={`${issue.code}-${index}`}><strong>{issue.code}</strong>: {issue.message}</li>)}
                        </ul>
                      )}
                    </td>
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
