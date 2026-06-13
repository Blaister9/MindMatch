import type {
  ConnectionType,
  DoctorInvitation,
  Interest,
  PatientProfile,
  PublicInvitation,
} from "@mindmatch/shared";

function toIso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function serializeDoctorInvitation(row: {
  id: string;
  patientName: string;
  email: string;
  birthDate: string;
  allowedConnectionTypes: ConnectionType[];
  restrictionsJson: Record<string, unknown>;
  status: "pending" | "accepted" | "expired" | "revoked";
  expiresAt: Date | string;
  acceptedAt: Date | string | null;
  createdAt: Date | string;
}): DoctorInvitation {
  return {
    id: row.id,
    patientName: row.patientName,
    email: row.email,
    birthDate: row.birthDate,
    allowedConnectionTypes: row.allowedConnectionTypes,
    restrictionsJson: row.restrictionsJson,
    status: row.status,
    expiresAt: toIso(row.expiresAt) ?? "",
    acceptedAt: toIso(row.acceptedAt),
    createdAt: toIso(row.createdAt) ?? "",
  };
}

export function serializePublicInvitation(row: {
  patientName: string;
  email: string;
  birthDate: string;
  allowedConnectionTypes: ConnectionType[];
  status: "pending" | "accepted" | "expired" | "revoked";
  expiresAt: Date | string;
}): PublicInvitation {
  return {
    patientName: row.patientName,
    email: row.email,
    birthDate: row.birthDate,
    allowedConnectionTypes: row.allowedConnectionTypes,
    status: row.status,
    expiresAt: toIso(row.expiresAt) ?? "",
  };
}

export function serializeInterest(row: {
  id: string;
  name: string;
  slug: string;
}): Interest {
  return { id: row.id, name: row.name, slug: row.slug };
}

export function serializePatientProfile(row: {
  id: string;
  displayName: string;
  birthDate: string;
  city: string;
  bio: string;
  goals: string;
  connectionTypes: ConnectionType[];
  allowedConnectionTypes: ConnectionType[];
  avatarUrl: string | null;
  onboardingCompletedAt: Date | string | null;
  interests: Array<{ id: string; name: string }>;
}): PatientProfile {
  return {
    id: row.id,
    displayName: row.displayName,
    birthDate: row.birthDate,
    city: row.city,
    bio: row.bio,
    goals: row.goals,
    connectionTypes: row.connectionTypes,
    allowedConnectionTypes: row.allowedConnectionTypes,
    avatarUrl: row.avatarUrl,
    onboardingCompletedAt: toIso(row.onboardingCompletedAt),
    interests: row.interests,
  };
}
