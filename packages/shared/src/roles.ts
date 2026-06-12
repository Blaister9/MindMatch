import { z } from "zod";

/** Roles del sistema. Solo dos: la doctora administra, el paciente participa. */
export const roleSchema = z.enum(["doctor", "patient"]);
export type Role = z.infer<typeof roleSchema>;

export const ROLES = roleSchema.options;
