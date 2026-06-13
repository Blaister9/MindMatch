import { z } from "zod";

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export function isAdultOnDate(birthDateIso: string, today = new Date()): boolean {
  const [year, month, day] = birthDateIso.split("-").map(Number);
  if (!year || !month || !day) {
    return false;
  }

  const eighteenthBirthday = new Date(Date.UTC(year + 18, month - 1, day));
  const todayUtc = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );

  return eighteenthBirthday <= todayUtc;
}

export const adultBirthDateSchema = isoDateSchema.refine(
  (value) => isAdultOnDate(value),
  "La persona debe ser mayor de 18 años.",
);

export const futureDateTimeSchema = z.string().datetime().refine(
  (value) => new Date(value).getTime() > Date.now(),
  "La fecha de expiración debe ser futura.",
);
