import { loadDemoEnv, port, urls, validateEnv } from "./lib/env.mjs";
import { requestJson, requestText } from "./lib/http.mjs";
import { readJson, manifestPath } from "./lib/runtime.mjs";

const expectClean = process.argv.includes("--expect-clean");
const { env } = loadDemoEnv();
const validation = validateEnv(env);
if (validation.errors.length) throw new Error(validation.errors.join("\n"));
const manifest = readJson(manifestPath);
const u = urls(env);

async function login(email, password) {
  const res = await requestJson(`${u.api}/auth/login`, {
    method: "POST",
    body: { clinicSlug: "mindmatch-demo", email, password },
  });
  return res.accessToken;
}

const patientHtml = await requestText(u.patient);
const doctorHtml = await requestText(u.doctor);
if (!patientHtml.includes("<html") && !patientHtml.includes("<!doctype")) throw new Error("Paciente no devuelve HTML valido.");
if (!doctorHtml.includes("<html") && !doctorHtml.includes("<!doctype")) throw new Error("Doctora no devuelve HTML valido.");
await requestJson(`${u.api}/health`);
const doctorToken = await login(env.DEMO_DOCTOR_EMAIL, env.DEMO_DOCTOR_PASSWORD);
const patientToken = await login(env.DEMO_PATIENT_EMAIL, env.DEMO_PATIENT_PASSWORD);
const summary = await requestJson(`${u.api}/doctor/dashboard/summary`, { token: doctorToken });
const patients = await requestJson(`${u.api}/doctor/dashboard/patients`, { token: doctorToken });
const pulse = await requestJson(`${u.api}/patient/pulse/today`, { token: patientToken });
const conversations = await requestJson(`${u.api}/patient/conversations`, { token: patientToken });
const analytics = await requestJson(`${u.api}/doctor/analytics/summary`, { token: doctorToken });
await requestJson(`${u.api}/doctor/analytics/mood`, { token: doctorToken });
await requestJson(`${u.api}/doctor/analytics/funnel`, { token: doctorToken });
const missions = await requestJson(`${u.api}/patient/missions`, { token: patientToken });

for (const forbidden of ["inputsJson", "passwordHash", "tokenHash"]) {
  const compact = JSON.stringify({ summary, patients, pulse, conversations, analytics, missions });
  if (compact.includes(forbidden)) throw new Error(`Campo prohibido expuesto: ${forbidden}`);
}

if (expectClean) {
  if (summary.openAlertsTotal !== 0 || summary.openAlertsToday !== 0) throw new Error("Se esperaban cero alertas en demo limpio.");
  if (patients.patients?.length !== 8) throw new Error("Se esperaban ocho pacientes.");
  if (missions.missions?.length !== 0) throw new Error("Se esperaban cero misiones iniciales para paciente smoke.");
  if (analytics.dataStatus !== "ok") throw new Error("Analytics no generado.");
}

console.log(`OK: check RC ${manifest?.rcVersion || "unknown"} API:${port(env, "API_PORT", 3001)} pacientes:${patients.patients?.length ?? "?"} alertas:${summary.openAlertsTotal}`);
