import type { AlertSeverity, PulseRuleCode } from "@mindmatch/shared";

export interface RuleMetadata {
  readonly name: string;
  readonly description: string;
  readonly severity: AlertSeverity;
}

export const PULSE_RULE_REGISTRY: Record<PulseRuleCode, RuleMetadata> = {
  R1: {
    name: "Caida reciente del animo",
    description: "El promedio de animo de los ultimos tres dias bajo frente a la semana previa.",
    severity: "medium",
  },
  R2: {
    name: "Animo bajo sostenido",
    description: "El paciente reporto animo de 2 o menos durante tres o mas dias seguidos.",
    severity: "high",
  },
  R3: {
    name: "Check-in ausente",
    description: "No se registra check-in por tres o mas dias con recordatorio activo.",
    severity: "medium",
  },
  R4: {
    name: "Sueno bajo sostenido",
    description: "El paciente reporto sueno de 2 o menos durante cuatro o mas dias seguidos.",
    severity: "medium",
  },
  R5: {
    name: "Desconexion social",
    description: "Siete dias sin conexion social con tendencia de animo plana o negativa.",
    severity: "low",
  },
  R6: {
    name: "Reporte en chat",
    description: "Un paciente reporto un mensaje dentro de una conversacion.",
    severity: "high",
  },
};
