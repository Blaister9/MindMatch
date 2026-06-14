export const VALID_SERVICES = ["api", "patient", "doctor"];

/**
 * Extrae el servicio solicitado desde argv admitiendo ambas formas:
 *   --service=api   (con signo igual)
 *   --service api   (separado por espacio, como lo pasa `pnpm <script> -- --service api`)
 * Devuelve "all" cuando no se especifica.
 */
export function parseServiceArg(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (typeof token !== "string") continue;
    if (token.startsWith("--service=")) {
      const value = token.slice("--service=".length).trim();
      if (value) return value;
    }
    if (token === "--service") {
      const next = argv[i + 1];
      if (typeof next === "string") {
        const value = next.trim();
        if (value && !value.startsWith("--")) return value;
      }
    }
  }
  return "all";
}

/** Traduce el servicio seleccionado a la lista concreta de servicios a operar. */
export function resolveServiceNames(selected) {
  if (selected === "all") return [...VALID_SERVICES];
  if (!VALID_SERVICES.includes(selected)) {
    throw new Error(`Servicio desconocido: ${selected}. Usa ${VALID_SERVICES.join("|")}|all.`);
  }
  return [selected];
}
