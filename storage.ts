import type { AnalysisInput, AnalysisResult } from "./schema";

const KEY = "trustguard:latest";

export interface StoredAnalysis {
  input: AnalysisInput;
  result: AnalysisResult;
  token: string;
}

export function saveAnalysis(value: StoredAnalysis): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode); the results page will show an empty state */
  }
}

export function loadAnalysis(): StoredAnalysis | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredAnalysis) : null;
  } catch {
    return null;
  }
}
