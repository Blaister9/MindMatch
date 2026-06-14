import type { PatientStatusColor, PatientStatusReason } from "@mindmatch/shared";

export const STATUS_COLOR_META: Record<
  PatientStatusColor,
  { label: string; icon: string; dot: string; chip: string }
> = {
  green: { label: "Al día", icon: "✓", dot: "bg-emerald-500", chip: "bg-emerald-100 text-emerald-800" },
  yellow: { label: "Seguimiento", icon: "◑", dot: "bg-amber-500", chip: "bg-amber-100 text-amber-800" },
  red: { label: "Requiere atención", icon: "⚠", dot: "bg-red-500", chip: "bg-red-100 text-red-800" },
};

export const STATUS_REASON_TEXT: Record<PatientStatusReason, string> = {
  high_alert_open: "Alerta alta abierta",
  medium_or_low_alert_open: "Alerta media o baja abierta",
  check_in_missing_3_plus_days: "Sin check-in 3+ días",
  check_in_missing_1_2_days: "Sin check-in 1–2 días",
  up_to_date: "Al día",
  preference_disabled_no_open_alerts: "Recordatorio desactivado, sin alertas",
};

export const STATUS_HELP_TEXT =
  "Estado de seguimiento según alertas abiertas y actividad reciente.";
