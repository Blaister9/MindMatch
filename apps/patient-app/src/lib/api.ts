import type {
  CandidatesResponse,
  ConversationsResponse,
  MessagesPage,
  PatientConnectionsResponse,
  ReportInput,
  ReportResult,
  SwipeInput,
  SwipeResult,
  PulseTodayResponse,
  PulseHistoryResponse,
  PulsePreferencesResponse,
  UpsertCheckInInput,
  UpdatePulsePreferencesInput,
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

export function fetchCandidates(token: string): Promise<CandidatesResponse> {
  return request<CandidatesResponse>("/patient/discovery/candidates", token);
}

export function sendSwipe(token: string, input: SwipeInput): Promise<SwipeResult> {
  return request<SwipeResult>("/patient/swipes", token, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function fetchConnections(
  token: string,
): Promise<PatientConnectionsResponse> {
  return request<PatientConnectionsResponse>("/patient/connections", token);
}

export function fetchConversations(token: string): Promise<ConversationsResponse> {
  return request<ConversationsResponse>("/patient/conversations", token);
}

export function fetchMessages(
  token: string,
  conversationId: string,
  cursor?: string | null,
): Promise<MessagesPage> {
  const params = new URLSearchParams({ limit: "30" });
  if (cursor) params.set("cursor", cursor);
  return request<MessagesPage>(
    `/patient/conversations/${conversationId}/messages?${params.toString()}`,
    token,
  );
}

export function reportMessage(
  token: string,
  messageId: string,
  input: ReportInput,
): Promise<ReportResult> {
  return request<ReportResult>(`/patient/messages/${messageId}/report`, token, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function fetchPulseToday(token: string): Promise<PulseTodayResponse> {
  return request<PulseTodayResponse>("/patient/pulse/today", token);
}

export function savePulseToday(
  token: string,
  input: UpsertCheckInInput,
): Promise<{ checkIn: PulseTodayResponse["checkIn"] }> {
  return request<{ checkIn: PulseTodayResponse["checkIn"] }>("/patient/pulse/today", token, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function fetchPulseHistory(
  token: string,
  days: 7 | 30,
): Promise<PulseHistoryResponse> {
  return request<PulseHistoryResponse>(`/patient/pulse/history?days=${days}`, token);
}

export function fetchPulsePreferences(token: string): Promise<PulsePreferencesResponse> {
  return request<PulsePreferencesResponse>("/patient/pulse/preferences", token);
}

export function savePulsePreferences(
  token: string,
  input: UpdatePulsePreferencesInput,
): Promise<PulsePreferencesResponse> {
  return request<PulsePreferencesResponse>("/patient/pulse/preferences", token, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
