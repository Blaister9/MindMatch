import { pgSchema } from "drizzle-orm/pg-core";

/**
 * Esquema `clinical`: datos sensibles que SOLO la doctora puede ver.
 * risk_scores, alerts, patient_clinical, match_decisions.
 *
 * Regla de arquitectura INNEGOCIABLE: estas tablas JAMÁS se exponen
 * en endpoints de rol paciente.
 */
export const clinical = pgSchema("clinical");

// TODO(sección 3): definir aquí las tablas del dominio clínico.
//   Ejemplos esperados: patient_clinical, risk_scores, alerts,
//   match_decisions, message_reports.
