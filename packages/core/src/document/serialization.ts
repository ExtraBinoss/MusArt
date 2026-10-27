import { EngineError, ensure } from "../errors";
import type { Project } from "./model";
import { validateProject } from "./validation";
import { reserveProjectIds } from "./identity";

export function serializeProject(project: Project): string {
  validateProject(project);
  return JSON.stringify(project);
}
export function parseProject(json: string): Project {
  ensure(json.length <= 250_000_000, "INVALID_DOCUMENT", "Fichier de projet trop volumineux");
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new EngineError("INVALID_DOCUMENT", "Le projet ne contient pas un JSON valide");
  }
  validateProject(value);
  reserveProjectIds(value);
  return value;
}
