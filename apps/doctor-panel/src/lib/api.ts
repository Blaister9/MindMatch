import type {
  DoctorPendingMatchesResponse,
  MatchActionResult,
} from "@mindmatch/shared";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as
      | { error?: string; message?: string }
      | undefined;
    throw new ApiError(
      response.status,
      body?.error ?? "ERROR",
      body?.message ?? "Algo salió mal.",
    );
  }
  return (await response.json()) as T;
}

export function fetchPendingMatches(
  token: string,
): Promise<DoctorPendingMatchesResponse> {
  return request<DoctorPendingMatchesResponse>("/doctor/matches/pending", token);
}

export function approveMatch(
  token: string,
  connectionId: string,
  rationale?: string,
): Promise<MatchActionResult> {
  return request<MatchActionResult>(
    `/doctor/matches/${connectionId}/approve`,
    token,
    { method: "POST", body: JSON.stringify(rationale ? { rationale } : {}) },
  );
}

export function pauseMatch(
  token: string,
  connectionId: string,
  rationale?: string,
): Promise<MatchActionResult> {
  return request<MatchActionResult>(
    `/doctor/matches/${connectionId}/pause`,
    token,
    { method: "POST", body: JSON.stringify(rationale ? { rationale } : {}) },
  );
}
