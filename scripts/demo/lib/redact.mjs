const SECRET_KEYS = [
  "JWT_SECRET",
  "JWT_REFRESH_SECRET",
  "DEMO_DOCTOR_PASSWORD",
  "DEMO_PATIENT_PASSWORD",
  "Authorization",
  "Cookie",
  "accessToken",
  "refreshToken",
  "DATABASE_URL",
];

export function redact(text = "") {
  let out = String(text);
  for (const key of SECRET_KEYS) {
    out = out.replace(new RegExp(`(${key}\\s*[=:]\\s*)[^\\s,;]+`, "gi"), "$1[REDACTED]");
  }
  out = out.replace(/(Authorization\s*:\s*)Bearer\s+[A-Za-z0-9._-]+/gi, "$1Bearer [REDACTED]");
  out = out.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [REDACTED]");
  out = out.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "postgresql://[REDACTED]");
  out = out.replace(/("password"\s*:\s*)"[^"]+"/gi, '$1"[REDACTED]"');
  out = out.replace(/("accessToken"\s*:\s*)"[^"]+"/gi, '$1"[REDACTED]"');
  return out;
}

export function publicDbIdentity(databaseUrl) {
  const url = new URL(databaseUrl);
  return `${url.protocol}//${url.hostname}:${url.port || "5432"}/${url.pathname.replace(/^\//, "")}`;
}
