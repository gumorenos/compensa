"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import {
  goldStandardImportAction,
  type GoldStandardImportActionState,
} from "./gold-standard-import-actions.js";

const initialState: GoldStandardImportActionState = {
  status: "IDLE",
  payload: "",
  preview: null,
  message: null,
  importedCount: 0,
};

export function GoldStandardImportForm() {
  const [state, formAction, isPending] = useActionState(goldStandardImportAction, initialState);
  const [payload, setPayload] = useState("");

  useEffect(() => {
    if (state.status === "IMPORTED") {
      setPayload("");
      return;
    }
    if (state.payload !== "") setPayload(state.payload);
  }, [state.payload, state.status]);

  const previewMatchesPayload =
    state.preview !== null && state.payload !== "" && state.payload === payload.trim();
  const canImport = previewMatchesPayload && state.preview?.canImport === true;

  return (
    <div className="stack">
      <form action={formAction} className="card card-pad">
        <div className="section-head" style={{ marginBottom: 18 }}>
          <div>
            <span className="eyebrow">Paso 1</span>
            <h2 style={{ marginTop: 6 }}>Pega el lote histórico</h2>
            <p className="muted" style={{ marginBottom: 0 }}>
              El dry-run usa exactamente el mismo contrato que la importación real. Previsualizar nunca crea referencias Gold Standard.
            </p>
          </div>
          <span className="badge">JSON v1</span>
        </div>

        <div className="field">
          <label htmlFor="gold-standard-import-payload">Documento JSON</label>
          <textarea
            id="gold-standard-import-payload"
            name="payload"
            value={payload}
            onChange={(event) => setPayload(event.target.value)}
            spellCheck={false}
            rows={20}
            placeholder={'{\n  "version": 1,\n  "cases": [ ... ]\n}'}
          />
          <small className="muted">
            Máximo 100 casos y 512 KiB por operación. No incluyas nombres de personas, remuneraciones ni otros datos personales innecesarios.
          </small>
        </div>

        <div className="form-actions">
          <button
            className="button"
            type="submit"
            name="intent"
            value="preview"
            disabled={isPending || payload.trim() === ""}
          >
            {isPending ? "Validando…" : "Previsualizar"}
          </button>
          <button
            className="button button-secondary"
            type="submit"
            name="intent"
            value="import"
            disabled={isPending || !canImport}
            title={canImport ? undefined : "Primero ejecuta un dry-run válido del contenido actual."}
          >
            Importar lote validado
          </button>
        </div>

        {state.message !== null && (
          <p
            className={state.status === "ERROR" ? "import-message import-message-error" : "import-message"}
            role="status"
            aria-live="polite"
          >
            {state.message}
          </p>
        )}
      </form>

      {state.status === "IMPORTED" && (
        <section className="card card-pad">
          <span className="eyebrow">Importación completada</span>
          <h2 style={{ marginTop: 6 }}>{state.importedCount} referencias incorporadas</h2>
          <p className="muted">
            Las nuevas referencias quedaron validadas e inmutables. Ya pueden asignarse a calibración u holdout desde el Gold Standard.
          </p>
          <Link className="button" href="/gold-standard">
            Ver Gold Standard
          </Link>
        </section>
      )}

      {state.preview !== null && (
        <section className="card">
          <div className="card-pad section-head">
            <div>
              <span className="eyebrow">Paso 2 · Dry-run</span>
              <h2 style={{ marginTop: 6 }}>Resultado por caso</h2>
              <p className="muted" style={{ marginBottom: 0 }}>
                {previewMatchesPayload
                  ? "La previsualización corresponde al JSON que está actualmente en el editor."
                  : "El JSON cambió desde la última previsualización. Vuelve a ejecutar el dry-run antes de importar."}
              </p>
            </div>
            <div className="import-preview-summary">
              <span className="badge badge-success">{state.preview.validCases} válidos</span>
              {state.preview.invalidCases > 0 && (
                <span className="badge badge-warning">{state.preview.invalidCases} inválidos</span>
              )}
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Caso</th>
                  <th>Referencia</th>
                  <th>Estado</th>
                  <th>Puntos recalculados</th>
                  <th>Grado</th>
                  <th>Observaciones</th>
                </tr>
              </thead>
              <tbody>
                {state.preview.cases.map((item) => (
                  <tr key={item.caseCode}>
                    <td><strong>{item.caseCode}</strong></td>
                    <td>{item.anonymizedLabel}</td>
                    <td>
                      <span className={`badge ${item.status === "VALID" ? "badge-success" : "badge-warning"}`}>
                        {item.status === "VALID" ? "Válido" : "Inválido"}
                      </span>
                    </td>
                    <td>{item.recalculatedPoints ?? "—"}</td>
                    <td>{item.recalculatedGradeCode ?? "—"}</td>
                    <td>
                      {item.issues.length === 0 ? (
                        <span className="muted">Sin observaciones</span>
                      ) : (
                        <ul className="import-issues">
                          {item.issues.map((issue, index) => (
                            <li key={`${issue.code}-${index}`}>
                              <strong>{issue.code}</strong>: {issue.message}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card-pad import-confirmation">
            {canImport ? (
              <p style={{ margin: 0 }}>
                <strong>Lote listo.</strong> Todos los casos se reproducen con la metodología indicada y no colisionan con referencias existentes. La importación real volverá a ejecutar estas validaciones en el servidor antes de escribir.
              </p>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                La importación permanece bloqueada hasta que el contenido actual produzca un dry-run sin errores.
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
