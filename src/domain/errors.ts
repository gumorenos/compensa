export type EngineStatus = "SUCCESS" | "ERROR";

export interface EngineIssue {
  code: string;
  message: string;
  path?: string;
}

export function issue(code: string, message: string, path?: string): EngineIssue {
  return path === undefined ? { code, message } : { code, message, path };
}
