import { sql, type SQL } from "drizzle-orm";
import { schema } from "../db";

const YMD_REGEX = sql.raw("'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'");

/**
 * Fecha de negocio (lógica) de una alerta, semántica única reutilizable:
 * - R6: fecha Bogotá de `triggered_at` (evento realtime, sin reloj demo).
 * - R1–R5: `inputs_json.asOfDate` (fecha lógica exacta que evaluó el motor),
 *   validada como `YYYY-MM-DD`.
 * - R1–R5 sin asOfDate válido: fallback a la fecha Bogotá de `triggered_at`.
 * Nunca expone `inputs_json` (solo deriva la fecha). Asume que se consulta la
 * tabla `clinical.alerts` con su alias por defecto.
 */
export function alertBusinessDateExpr(): SQL<string> {
  const a = schema.alerts;
  return sql<string>`(
    case
      when ${a.ruleCode} = 'R6'
        then (${a.triggeredAt} at time zone 'America/Bogota')::date
      when (${a.inputsJson} ->> 'asOfDate') ~ ${YMD_REGEX}
        then (${a.inputsJson} ->> 'asOfDate')::date
      else (${a.triggeredAt} at time zone 'America/Bogota')::date
    end
  )`;
}

/**
 * Verdadero cuando una alerta R1–R5 NO tiene un asOfDate válido y por tanto usa
 * el fallback (para contar problemas de calidad sin exponer inputs_json).
 */
export function alertAsOfFallbackExpr(): SQL<boolean> {
  const a = schema.alerts;
  return sql<boolean>`(
    ${a.ruleCode} <> 'R6'
    and ((${a.inputsJson} ->> 'asOfDate') is null
      or (${a.inputsJson} ->> 'asOfDate') !~ ${YMD_REGEX})
  )`;
}
