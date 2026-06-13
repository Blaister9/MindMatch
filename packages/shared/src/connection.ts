import { z } from "zod";

/** Tipos de conexion que la doctora puede autorizar para un paciente. */
export const connectionTypeSchema = z.enum(["friendship", "group", "romantic"]);
export type ConnectionType = z.infer<typeof connectionTypeSchema>;

export const CONNECTION_TYPES = connectionTypeSchema.options;

/** Severidad de las alertas del Pulso Emocional. */
export const alertSeveritySchema = z.enum(["low", "medium", "high"]);
export type AlertSeverity = z.infer<typeof alertSeveritySchema>;

/** Reglas del motor del Pulso (R1-R6). */
export const pulseRuleSchema = z.enum(["R1", "R2", "R3", "R4", "R5", "R6"]);
export type PulseRule = z.infer<typeof pulseRuleSchema>;
