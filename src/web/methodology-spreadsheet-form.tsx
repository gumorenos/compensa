"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import {
  methodologySpreadsheetAction,
  type MethodologySpreadsheetActionState,
} from "./methodology-spreadsheet-actions.js";

const initialState: MethodologySpreadsheetActionState = {
  status: "IDLE",
  fileName: "",
  canonicalPayload: "",
  contentOwner: "",
  rightsConfirmed: false,
  preview: null,
  message: null,
  methodologyId: null,
};

export function MethodologySpreadsheetForm() {
  const [state, formAction, isPending] = useActionState(methodologySpreadsheetAction, initialState);
  const [fileChanged, setFileChanged] = useState(false);
  const [contentOwner, setContentOwner] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);

  useEffect(() => {
    if (state.status === "IMPORTED") {
      setContentOwner("");
      setRightsConfirmed(false);
      setFileChanged(false);
      return;
    }
    if (state.status === "PREVIEW") setFileChanged(false);
    if (state.contentOwner !== "") setContentOwner(state.contentOwner);
    setRightsConfirmed(state.rightsConfirmed);
  }, [state.status, state.canonicalPayload, state.contentOwner, state.rightsConfirmed]);

  const previewMatchesOwner = state.contentOwner === contentOwner.trim();
  const canImport =
    state.preview?.status === "VALID" &&
    state.canonicalPayload !== "" &&
    !fileChanged &&
    previewMatchesOwner &&
    rightsConfirmed;

  return (
    <div className="stack">
      <form action={formAction} className="card card-pad">
        <div className="section-head" style={{ marginBottom: 18 }}>
          <div>
            <span className="eyebrow">Excel / CSV</span>
            <h2 style={{ marginTop: 6 }}>Cargar metodología tabular</h2>
            <p className="muted" style={{ marginBottom: 0 }}>
              Usa filas <code>META</code>, <code>FACTOR</code>, <code>DIMENSION</code>, <code>LEVEL</code>, <code>STEP</code>, <code>LOOKUP</code> y <code>GRADE</code>. El archivo se transforma al mismo DSL determinístico validado que usa la vía JSON.
            </p>
          </div>
          <span className="badge">.xlsx · .csv</span>
        </div>

        <div className="form-actions" style={{ marginBottom: 18 }}>
          <a className="button button-small button-secondary" href="/api/templates/methodology.xlsx">Descargar plantilla Excel</a>
          <a className="button button-small button-secondary" href="/api/templates/methodology.csv">Descargar plantilla CSV</a>
        </div>

        <div className="field">
          <label htmlFor="methodology-spreadsheet-owner">Propietario / fuente autorizada *</label>
          <input
            id="methodology-spreadsheet-owner"
            name="contentOwner"
            type="text"
            value={contentOwner}
            onChange={(event) => setContentOwner(event.target.value)}
            placeholder="Ej. Metodología interna de ACME / contenido licenciado por ACME"
            required
          />
        </div>

        <div className="field">
          <label htmlFor="methodology-spreadsheet">Archivo *</label>
          <input
            id="methodology-spreadsheet"
            name="spreadsheetFile"
            type="file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={() => setFileChanged(true)}
          />
          <small className="muted">Máximo 5 MiB, 5.000 filas y 64 columnas. No se permiten fórmulas en celdas.</small>
        </div>

        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 12 }}>
          <input
            type="checkbox"
            name="rightsConfirmed"
            value="yes"
            checked={rightsConfirmed}
            onChange={(event) => setRightsConfirmed(event.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span>
            Confirmo que mi organización tiene derecho, licencia o autorización para utilizar el contenido de esta definición. Compensa no incorpora ni certifica manuales propietarios de terceros.
          </span>
        </label>

        <input type="hidden" name="canonicalPayload" value={state.canonicalPayload} />
        <input type="hidden" name="fileName" value={state.fileName} />

        <div className="form-actions" style={{ marginTop: 20 }}>
          <button
            className="button"
            type="submit"
            name="intent"
            value="preview"
            disabled={isPending || contentOwner.trim() === ""}
          >
            {isPending ? "Procesando…" : "Previsualizar archivo"}
          </button>
          <button
            className="button button-secondary"
            type="submit"
            name="intent"
            value="import"
            disabled={isPending || !canImport}
            title={canImport ? undefined : "Previsualiza el archivo actual, conserva el mismo origen y confirma los derechos de uso."}
          >
            Importar versión activa
          </button>
        </div>

        {(fileChanged || !previewMatchesOwner) && state.preview !== null && (
          <p className="muted" style={{ marginTop: 14, marginBottom: 0 }}>
            El archivo o su origen cambió después del último dry-run. Previsualiza nuevamente antes de importar.
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

      {state.status === "IMPORTED" && state.methodologyId !== null && (
        <section className="card card-pad">
          <span className="eyebrow">Versión creada</span>
          <h2 style={{ marginTop: 6 }}>Metodología disponible para nuevas valoraciones</h2>
          <p className="muted">La definición del archivo quedó activa e inmutable; cualquier cambio posterior debe ser una nueva versión.</p>
          <Link className="button" href="/methodologies">Ver metodologías</Link>
        </section>
      )}

      {state.preview !== null && (
        <section className="card">
          <div className="card-pad section-head">
            <div>
              <span className="eyebrow">Dry-run · {state.fileName}</span>
              <h2 style={{ marginTop: 6 }}>{state.preview.definition?.name ?? "Definición no interpretable"}</h2>
              <p className="muted" style={{ marginBottom: 0 }}>
                El archivo fue convertido a una definición canónica y validado por el mismo motor que usa la importación JSON.
              </p>
            </div>
            <span className={`badge ${state.preview.status === "VALID" ? "badge-success" : "badge-warning"}`}>
              {state.preview.status === "VALID" ? "Válida" : "Inválida"}
            </span>
          </div>

          <dl className="metadata card-pad" style={{ borderTop: "1px solid var(--line)", margin: 0 }}>
            <div><dt>Factores</dt><dd>{state.preview.factorCount}</dd></div>
            <div><dt>Dimensiones</dt><dd>{state.preview.dimensionCount}</dd></div>
            <div><dt>Niveles</dt><dd>{state.preview.levelCount}</dd></div>
            <div><dt>Pasos de cálculo</dt><dd>{state.preview.scoringStepCount}</dd></div>
            <div><dt>Grados</dt><dd>{state.preview.gradeCount}</dd></div>
          </dl>

          {state.preview.issues.length > 0 && (
            <div className="card-pad" style={{ borderTop: "1px solid var(--line)" }}>
              <h3>Observaciones bloqueantes</h3>
              <ul style={{ marginBottom: 0, paddingLeft: 20, display: "grid", gap: 8 }}>
                {state.preview.issues.map((issue, index) => (
                  <li key={`${issue.code}-${index}`}>
                    <strong>{issue.code}</strong>{issue.path === undefined ? "" : ` · ${issue.path}`}: {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
