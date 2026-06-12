import { pgSchema } from "drizzle-orm/pg-core";

/**
 * Esquema `social`: todo lo que el paciente puede tocar.
 * clínicas, usuarios, perfiles, intereses, matches, conversaciones,
 * mensajes, check-ins diarios, grupos de apoyo, misiones.
 *
 * Regla de arquitectura: este esquema NUNCA debe contener datos clínicos.
 */
export const social = pgSchema("social");

// TODO(sección 3): definir aquí las tablas del dominio social.
//   Ejemplos esperados: clinics, users, patient_profiles, interests,
//   profile_interests, matches, conversations, conversation_members,
//   messages, daily_checkins, support_groups, missions.
