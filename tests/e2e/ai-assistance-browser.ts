import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createPool } from "../../src/persistence/database.js";

interface E2EAccount {
  id: string;
  email: string;
  password: string;
}

interface E2EFixture {
  organizationId: string;
  methodologyVersionId: string;
  valuationId: string;
  noDescriptionValuationId: string;
  users: {
    admin: E2EAccount;
    evaluator: E2EAccount;
    reviewer: E2EAccount;
  };
}

interface CdpTarget {
  type: string;
  webSocketDebuggerUrl?: string;
}

interface PendingCommand {
  resolve(value: unknown): void;
  reject(error: Error): void;
}

interface RuntimeEvaluation {
  result: {
    value?: unknown;
    description?: string;
  };
  exceptionDetails?: unknown;
}

interface CdpMessage {
  id?: number;
  method?: string;
  params?: {
    request?: {
      url?: string;
    };
  };
  result?: unknown;
  error?: { message?: string };
}

const fixturePath = required("COMPENSA_E2E_FIXTURE_PATH");
const databaseUrl = required("DATABASE_URL");
const baseUrl = (process.env.COMPENSA_E2E_BASE_URL ?? "http://127.0.0.1:3210").replace(/\/$/, "");
const cdpUrl = (process.env.COMPENSA_E2E_CDP_URL ?? "http://127.0.0.1:9222").replace(/\/$/, "");
const acceptedJustification = "E2E: el evaluador confirma la evidencia y acepta el nivel sugerido.";

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") throw new Error(`${name} is required.`);
  return value.trim();
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

class CdpPage {
  private nextId = 1;
  private readonly pending = new Map<number, PendingCommand>();
  private readonly observedRequestUrls = new Set<string>();

  private constructor(private readonly socket: WebSocket) {
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as CdpMessage;
      if (message.method === "Network.requestWillBeSent") {
        const url = message.params?.request?.url;
        if (url !== undefined) this.observedRequestUrls.add(url);
      }

      if (message.id === undefined) return;
      const pending = this.pending.get(message.id);
      if (pending === undefined) return;
      this.pending.delete(message.id);
      if (message.error !== undefined) {
        pending.reject(new Error(message.error.message ?? "Chrome DevTools command failed."));
      } else {
        pending.resolve(message.result);
      }
    });
  }

  static async connect(): Promise<CdpPage> {
    let targets: CdpTarget[] | null = null;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        const response = await fetch(`${cdpUrl}/json/list`);
        if (response.ok) {
          targets = (await response.json()) as CdpTarget[];
          if (targets.some((target) => target.type === "page" && target.webSocketDebuggerUrl)) break;
        }
      } catch {
        // Chrome may still be starting.
      }
      await sleep(100);
    }

    const target = targets?.find(
      (candidate) => candidate.type === "page" && candidate.webSocketDebuggerUrl !== undefined,
    );
    if (target?.webSocketDebuggerUrl === undefined) {
      throw new Error("No Chrome page target is available through the DevTools endpoint.");
    }

    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("Could not open DevTools websocket.")), {
        once: true,
      });
    });

    const page = new CdpPage(socket);
    await page.command("Page.enable");
    await page.command("Runtime.enable");
    await page.command("Network.enable");
    return page;
  }

  async close(): Promise<void> {
    this.socket.close();
  }

  async clearSession(): Promise<void> {
    await this.command("Network.clearBrowserCookies");
    await this.command("Network.clearBrowserCache");
  }

  unexpectedHttpRequests(allowedOrigin: string): string[] {
    return [...this.observedRequestUrls]
      .filter((url) => url.startsWith("http://") || url.startsWith("https://"))
      .filter((url) => {
        try {
          return new URL(url).origin !== allowedOrigin;
        } catch {
          return true;
        }
      })
      .sort();
  }

  async navigate(path: string): Promise<void> {
    const url = path.startsWith("http://") || path.startsWith("https://") ? path : `${baseUrl}${path}`;
    await this.command("Page.navigate", { url });
    await this.waitFor(() => this.evaluate<boolean>("document.readyState === 'complete'"));
  }

  async login(account: E2EAccount, callbackPath: string): Promise<void> {
    await this.clearSession();
    await this.navigate(`/sign-in?callbackURL=${encodeURIComponent(callbackPath)}`);
    await this.waitForText("Ingresar");
    await this.setValue("#email", account.email);
    await this.setValue("#password", account.password);
    await this.clickByText("button", "Ingresar");
    await this.waitFor(async () => !(await this.currentUrl()).includes("/sign-in"), 15_000);
    assert.equal(await this.currentUrl(), `${baseUrl}${callbackPath}`);
  }

  async currentUrl(): Promise<string> {
    return this.evaluate<string>("window.location.href");
  }

  async bodyText(): Promise<string> {
    return this.evaluate<string>("document.body?.innerText ?? ''");
  }

  async waitForText(text: string, timeoutMs = 10_000): Promise<void> {
    await this.waitFor(async () => (await this.bodyText()).includes(text), timeoutMs);
  }

  async setValue(selector: string, value: string): Promise<void> {
    await this.evaluate<void>(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
        throw new Error('Element is not an input/textarea: ${escapeForSingleQuotedMessage(selector)}');
      }
      element.value = ${JSON.stringify(value)};
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
  }

  async click(selector: string): Promise<void> {
    await this.evaluate<void>(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLElement)) {
        throw new Error('Clickable element not found: ${escapeForSingleQuotedMessage(selector)}');
      }
      element.click();
    })()`);
  }

  async clickByText(selector: string, text: string): Promise<void> {
    await this.evaluate<void>(`(() => {
      const element = Array.from(document.querySelectorAll(${JSON.stringify(selector)}))
        .find((candidate) => candidate.textContent?.trim().includes(${JSON.stringify(text)}));
      if (!(element instanceof HTMLElement)) {
        throw new Error('Text element not found: ${escapeForSingleQuotedMessage(text)}');
      }
      element.click();
    })()`);
  }

  async isChecked(selector: string): Promise<boolean> {
    return this.evaluate<boolean>(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLInputElement) || element.type !== 'checkbox') {
        throw new Error('Checkbox not found: ${escapeForSingleQuotedMessage(selector)}');
      }
      return element.checked;
    })()`);
  }

  async hasVisibleText(text: string): Promise<boolean> {
    return (await this.bodyText()).includes(text);
  }

  private async waitFor(predicate: () => Promise<boolean>, timeoutMs = 10_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown;
    while (Date.now() < deadline) {
      try {
        if (await predicate()) return;
      } catch (error) {
        lastError = error;
      }
      await sleep(100);
    }
    if (lastError instanceof Error) throw lastError;
    throw new Error(`Timed out after ${timeoutMs}ms waiting for browser condition.`);
  }

  private async evaluate<T>(expression: string): Promise<T> {
    const evaluation = await this.command<RuntimeEvaluation>("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (evaluation.exceptionDetails !== undefined) {
      throw new Error(evaluation.result.description ?? `Browser expression failed: ${expression}`);
    }
    return evaluation.result.value as T;
  }

  private command<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
}

function escapeForSingleQuotedMessage(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as E2EFixture;
const page = await CdpPage.connect();
const pool = createPool(databaseUrl);

try {
  await page.login(fixture.users.admin, "/ai-assistance");
  await page.waitForText("No existe configuración previa");
  assert.equal(await page.isChecked('input[name="assistanceEnabled"]'), false);
  assert.equal(await page.isChecked('input[name="externalProcessingAllowed"]'), false);
  await page.click('input[name="assistanceEnabled"]');
  await page.clickByText("button", "Guardar configuración");
  await page.waitForText("Última actualización registrada");
  assert.equal(await page.isChecked('input[name="assistanceEnabled"]'), true);
  assert.equal(await page.isChecked('input[name="externalProcessingAllowed"]'), false);

  await page.navigate(`/valuations/${fixture.noDescriptionValuationId}/ai-assistance`);
  await page.waitForText("Esta valoración no tiene un descriptivo anclado.");
  assert.equal(await page.hasVisibleText("Generar asistencia de prueba"), false);

  const assistancePath = `/valuations/${fixture.valuationId}/ai-assistance`;
  await page.login(fixture.users.evaluator, assistancePath);
  await page.waitForText("Modo de prueba local.");
  assert.equal(await page.hasVisibleText("Generar asistencia de prueba"), true);
  await page.clickByText("button", "Generar asistencia de prueba");
  await page.waitForText("Fixture local · no es recomendación real", 15_000);
  await page.waitForText("Abstención");

  await page.clickByText("summary", "Aceptar sugerencia");
  await page.setValue('details[open] textarea[name="justification"]', acceptedJustification);
  await page.click('details[open] button[type="submit"]');
  await page.waitForText("Resolución humana: ACCEPTED", 15_000);

  await page.login(fixture.users.reviewer, assistancePath);
  await page.waitForText("Solo lectura para tu rol.");
  await page.waitForText("Resolución humana: ACCEPTED");
  assert.equal(await page.hasVisibleText("Generar asistencia de prueba"), false);
  assert.equal(await page.hasVisibleText("Aceptar sugerencia"), false);
  assert.equal(await page.hasVisibleText("Modificar sugerencia"), false);
  assert.equal(await page.hasVisibleText("Rechazar sugerencia"), false);

  assert.deepEqual(page.unexpectedHttpRequests(new URL(baseUrl).origin), []);

  const settings = await pool.query(
    `SELECT assistance_enabled, external_processing_allowed, updated_by_user_id
     FROM ai_assistance_settings
     WHERE organization_id = $1`,
    [fixture.organizationId],
  );
  assert.deepEqual(settings.rows[0], {
    assistance_enabled: true,
    external_processing_allowed: false,
    updated_by_user_id: fixture.users.admin.id,
  });

  const run = await pool.query(
    `SELECT provider_id, model_id, created_by_user_id
     FROM ai_assistance_runs
     WHERE organization_id = $1 AND valuation_id = $2
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [fixture.organizationId, fixture.valuationId],
  );
  assert.deepEqual(run.rows[0], {
    provider_id: "LOCAL_FIXTURE",
    model_id: "workflow-fixture-v1",
    created_by_user_id: fixture.users.evaluator.id,
  });

  const decisions = await pool.query(
    `SELECT source, justification
     FROM valuation_decisions
     WHERE organization_id = $1 AND valuation_id = $2`,
    [fixture.organizationId, fixture.valuationId],
  );
  assert.equal(decisions.rows.length, 1);
  assert.deepEqual(decisions.rows[0], {
    source: "AI_ACCEPTED",
    justification: acceptedJustification,
  });

  const resolutions = await pool.query(
    `SELECT resolution, resolved_by_user_id
     FROM ai_suggestion_resolutions
     WHERE organization_id = $1`,
    [fixture.organizationId],
  );
  assert.equal(resolutions.rows.length, 1);
  assert.deepEqual(resolutions.rows[0], {
    resolution: "ACCEPTED",
    resolved_by_user_id: fixture.users.evaluator.id,
  });

  const valuation = await pool.query(
    `SELECT status, total_points, grade_code
     FROM valuations
     WHERE organization_id = $1 AND id = $2`,
    [fixture.organizationId, fixture.valuationId],
  );
  assert.deepEqual(valuation.rows[0], {
    status: "DRAFT",
    total_points: null,
    grade_code: null,
  });

  const audit = await pool.query(
    `SELECT actor_user_id, payload
     FROM security_audit_events
     WHERE organization_id = $1 AND action = 'AI_SUGGESTION_RESOLVED'
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [fixture.organizationId],
  );
  assert.equal(audit.rows[0]?.actor_user_id, fixture.users.evaluator.id);
  const auditPayload = JSON.stringify(audit.rows[0]?.payload ?? {});
  assert.equal(auditPayload.includes(acceptedJustification), false);
  assert.equal(auditPayload.includes("Salida determinística del fixture local"), false);

  console.log(
    "AI browser E2E PASS: ADMIN governance, EVALUATOR local assistance, REVIEWER read-only, local-only HTTP traffic, PostgreSQL effects verified.",
  );
} catch (error) {
  console.error(`Browser URL at failure: ${await page.currentUrl().catch(() => "unavailable")}`);
  console.error(`Browser body at failure:\n${await page.bodyText().catch(() => "unavailable")}`);
  console.error(`Observed HTTP(S) requests:\n${page.unexpectedHttpRequests(new URL(baseUrl).origin).join("\n")}`);
  throw error;
} finally {
  await pool.end();
  await page.close();
}
