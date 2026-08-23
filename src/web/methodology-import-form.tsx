"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import {
  methodologyImportAction,
  type MethodologyImportActionState,
} from "./methodology-actions.js";

const initialState: MethodologyImportActionState = {
  status: "IDLE",
  payload: "",
  contentOwner: "",
  rightsConfirmed: false,
  preview: null,
  message: null,
  methodologyId: null,
};

const editorStyle = {
  width: "100%",
  minHeight: 420,
  resize: "vertical" as const,
  padding: "14px 16px",
  border: "1px solid var(--line)",
  borderRadius: 10,
  background: "white",
  color: "var(--text)",
  font: "13px/1.55 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};

export function MethodologyImportForm() {
  const [state, formAction, isPending] = useActionState(methodologyImportAction, initialState);
  const [payload, setPayload] = useState("");
  const [contentOwner, setContentOwner] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);

  useEffect(() => {
    if (state.status === "IMPORTED") {
      setPayload("");
      setContentOwner("");
      setRightsConfirmed(false);
      return;
    }
    if (state.payload !== "") setPayload(state.payload);
    if (state.contentOwner !== "") setContentOwner(state.contentOwner);
    setRightsConfirmed(state.rightsConfirmed);
  }, [state]);

  const previewMatches =
    state.preview !== null &&
    state.payload !== "" &&
    state.payload === payload.trim() &&
    state.contentOwner === contentOwner.trim();
  const canImport = previewMatches && state.preview?.status === "VALID" && rightsConfirmed;

  return (
    <div className="stack">
      <form action={formAction} className="card card-pad">
        <div className="section-head" style={{ marginBottom: 18 }}>
          <div>
            <span className="eyebrow">Paso 1</span>
            <h2 style={{ marginTop: 6 }}>Definición metodológica</h2>
            <p className="muted" style={{ marginBottom: 0 }}>
              Compensa acepta únicamente el DSL declarativo restringido del motor: lookups y operaciones aritméticas explícitas. No se ejecuta código del documento.
            </p>
          </div>
          <span className="badge">JSON</span>
        </div>

        <div className="field">
          <label htmlFor="methodology-owner">Propietario / fuente autorizada *</label>
          <input
            id="methodology-owner"
            name="contentOwner"
            type="text"
            value={contentOwner}
            onChange={(event) => setContentOwner(event.target.value)}
            placeholder="Ej. Metodología interna de ACME / contenido licenciado por ACME"
            required
          />
          <small className="muted">
            Este dato queda almacenado con la versión para trazabilidad de origen y derechos de uso.
          </small>
        </div>

        <div className="field">
          <label htmlFor="methodology-payload">JSON de la metodología *</label>
          <textarea
            id="methodology-payload"
            name="payload"
            rows={24}
            value={payload}
            onChange={(event) => setPayload(event.target.value)}
            style={editorStyle}
            spellCheck={false}
            placeholder={'{\n  "code": "ACME_POINT_FACTOR",\n  "name": "Metodología ACME",\n  "version": "1.0",\n  "factors": [ ... ],\n  "scoring": { ... },\n  "grades": [ ... ]\n}'}
          />
          <small className="muted">Máximo 512 KiB por definición.</small>
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

        <div className="form-actions" style={{ marginTop: 20 }}>
          <button
            className="button"
            type="submit"
            name="intent"
            value="preview"
            disabled={isPending || payload.trim() === "" || contentOwner.trim() === ""}
          >
            {isPending ? "Validando…" : "Previsualizar"}
          </button>
          <button
            className="button button-secondary"
            type="submit"
            name="intent"
            value="import"
            disabled={isPending || !canImport}
            title={canImport ? undefined : "Ejecuta un dry-run válido del contenido actual y confirma los derechos de uso."}
          >
            Importar versión activa
          </button>
        </div>

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
          <p className="muted">
            La definición quedó activa e inmutable. Para cambiar factores, niveles, reglas o grados crea una versión nueva.
          </p>
          <Link className="button" href="/methodologies">Ver metodologías</Link>
        </section>
      )}

      {state.preview !== null && (
        <section className="card">
          <div className="card-pad section-head">
            <div>
              <span className="eyebrow">Paso 2 · Dry-run</span>
              <h2 style={{ marginTop: 6 }}>
                {state.preview.definition?.name ?? "Definición no interpretable"}
              </h2>
              <p className="muted" style={{ marginBottom: 0 }}>
                {previewMatches
                  ? "Este resultado corresponde al JSON y origen actualmente visibles en el formulario."
                  : "El contenido cambió desde el último dry-run. Previsualiza nuevamente antes de importar."}
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
