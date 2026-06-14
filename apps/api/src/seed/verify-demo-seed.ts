import { createHash } from "node:crypto";
import { and, eq, inArray, sql, type Column, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db, queryClient, schema } from "../db";
import { createAnchor, type SeedAnchor } from "./anchor";
import { DEMO_CLINIC_NAME, DEMO_CLINIC_SLUG, DEMO_DOCTOR_EMAIL } from "./data/clinic";
import { CHECK_IN_DAYS } from "./data/check-ins";
import { PATIENTS, type PatientKey } from "./data/patients";

/** Solo necesitamos lecturas; sirve tanto para `db` como para una transacción. */
type Executor = Pick<typeof db, "select">;

export interface VerifyResult {
  counts: Record<string, number>;
  signature: string;
}

const emailToKey = new Map<string, PatientKey>(
  PATIENTS.map((p) => [p.email.toLowerCase(), p.key]),
);

function keyForEmail(email: string): PatientKey {
  const key = emailToKey.get(email.toLowerCase());
  if (!key) {
    throw new Error(`Email demo no reconocido en verificación: ${email}`);
  }
  return key;
}

function mean(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}

/** Caída R1: media de los últimos 3 días vs media de los 7 anteriores. */
function r1Drop(mood: number[]): number {
  const recent3 = mean(mood.slice(11, 14)); // días 12-14
  const prev7 = mean(mood.slice(4, 11)); // días 5-11
  return prev7 - recent3;
}

/** R2: corrida máxima de días con ánimo <= 2. */
function maxLowMoodRun(mood: number[]): number {
  return maxRun(mood.map((m) => m <= 2));
}

/** R4: corrida máxima de días con sueño <= 2. */
function maxLowSleepRun(sleep: number[]): number {
  return maxRun(sleep.map((s) => s <= 2));
}

/** R5: corrida máxima de días sin conexión social. */
function maxNoConnectionRun(connected: boolean[]): number {
  return maxRun(connected.map((c) => !c));
}

function maxRun(flags: boolean[]): number {
  let best = 0;
  let current = 0;
  for (const flag of flags) {
    current = flag ? current + 1 : 0;
    if (current > best) best = current;
  }
  return best;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Verifica el dataset demo: conteos, invariantes, aislamiento de tenant, las
 * reglas del Pulso para Mariana y la NO activación accidental en el resto.
 * Lanza Error con la lista de problemas si algo falla. Devuelve conteos y la
 * firma lógica (sin ids ni timestamps técnicos).
 */
export async function verifyDemoSeed(
  ex: Executor,
  anchor: SeedAnchor,
): Promise<VerifyResult> {
  const problems: string[] = [];
  const counts: Record<string, number> = {};

  const expect = (label: string, actual: number, want: number) => {
    counts[label] = actual;
    if (actual !== want) {
      problems.push(`${label}: esperado ${want}, obtenido ${actual}.`);
    }
  };
  const expectRange = (label: string, actual: number, min: number, max: number) => {
    counts[label] = actual;
    if (actual < min || actual > max) {
      problems.push(`${label}: esperado entre ${min} y ${max}, obtenido ${actual}.`);
    }
  };

  const countRows = async (table: PgTable, where: SQL | undefined): Promise<number> => {
    const [row] = await ex
      .select({ n: sql<number>`count(*)::int` })
      .from(table)
      .where(where);
    return row?.n ?? 0;
  };

  // ── Clínica demo ────────────────────────────────────────────────
  const [clinic] = await ex
    .select({
      id: schema.clinics.id,
      name: schema.clinics.name,
      slug: schema.clinics.slug,
      timezone: schema.clinics.timezone,
      status: schema.clinics.status,
    })
    .from(schema.clinics)
    .where(eq(schema.clinics.slug, DEMO_CLINIC_SLUG))
    .limit(1);

  if (!clinic) {
    throw new Error(
      `Verificación fallida: no existe la clínica demo (slug ${DEMO_CLINIC_SLUG}).`,
    );
  }
  counts["clinicas_demo"] = 1;
  const clinicId = clinic.id;
  const clinicScope = (table: { clinicId: Column }) => eq(table.clinicId, clinicId);

  // ── Conteos principales ─────────────────────────────────────────
  expect(
    "doctora_demo",
    await countRows(
      schema.users,
      and(
        eq(schema.users.clinicId, clinicId),
        eq(schema.users.role, "doctor"),
        sql`lower(${schema.users.email}) = ${DEMO_DOCTOR_EMAIL.toLowerCase()}`,
      ),
    ),
    1,
  );
  expect(
    "pacientes",
    await countRows(
      schema.users,
      and(eq(schema.users.clinicId, clinicId), eq(schema.users.role, "patient")),
    ),
    8,
  );
  expect(
    "invitaciones_aceptadas",
    await countRows(
      schema.invitations,
      and(eq(schema.invitations.clinicId, clinicId), eq(schema.invitations.status, "accepted")),
    ),
    8,
  );
  expect("perfiles", await countRows(schema.patientProfiles, clinicScope(schema.patientProfiles)), 8);
  expect("intereses", await countRows(schema.interests, clinicScope(schema.interests)), 15);
  expect("patient_clinical", await countRows(schema.patientClinical, clinicScope(schema.patientClinical)), 8);
  expect("check_in_preferences", await countRows(schema.checkInPreferences, clinicScope(schema.checkInPreferences)), 8);
  expect("demo_clocks", await countRows(schema.demoClocks, eq(schema.demoClocks.clinicId, clinicId)), 1);
  expect("check_ins", await countRows(schema.checkIns, clinicScope(schema.checkIns)), 112);
  expect("match_scores", await countRows(schema.matchScores, clinicScope(schema.matchScores)), 18);
  expect("conexiones", await countRows(schema.connections, clinicScope(schema.connections)), 7);
  expect(
    "conexiones_active",
    await countRows(schema.connections, and(clinicScope(schema.connections), eq(schema.connections.status, "active"))),
    2,
  );
  expect(
    "conexiones_pending_approval",
    await countRows(schema.connections, and(clinicScope(schema.connections), eq(schema.connections.status, "pending_approval"))),
    4,
  );
  expect(
    "conexiones_paused",
    await countRows(schema.connections, and(clinicScope(schema.connections), eq(schema.connections.status, "paused"))),
    1,
  );
  expect(
    "conversaciones_directas",
    await countRows(schema.conversations, and(clinicScope(schema.conversations), eq(schema.conversations.type, "direct"))),
    2,
  );
  expect(
    "conversaciones_grupo",
    await countRows(schema.conversations, and(clinicScope(schema.conversations), eq(schema.conversations.type, "group"))),
    1,
  );
  expect("support_groups", await countRows(schema.supportGroups, clinicScope(schema.supportGroups)), 1);

  // Cero en tablas que NO se siembran en Fase 2.
  expect("profile_embeddings", await countRows(schema.profileEmbeddings, clinicScope(schema.profileEmbeddings)), 0);
  expect("alerts", await countRows(schema.alerts, clinicScope(schema.alerts)), 0);
  expect("risk_scores", await countRows(schema.riskScores, clinicScope(schema.riskScores)), 0);
  expect("match_decisions", await countRows(schema.matchDecisions, clinicScope(schema.matchDecisions)), 0);
  expect("professional_notes", await countRows(schema.professionalNotes, clinicScope(schema.professionalNotes)), 0);
  expect("analytics_events", await countRows(schema.events, clinicScope(schema.events)), 0);
  expect("clinic_daily_metrics", await countRows(schema.clinicDailyMetrics, clinicScope(schema.clinicDailyMetrics)), 0);
  expect("patient_daily_metrics", await countRows(schema.patientDailyMetrics, clinicScope(schema.patientDailyMetrics)), 0);
  expect("swipes", await countRows(schema.swipes, clinicScope(schema.swipes)), 0);
  expect("message_reports", await countRows(schema.messageReports, clinicScope(schema.messageReports)), 0);

  const [demoClock] = await ex
    .select({ currentDate: schema.demoClocks.currentDate })
    .from(schema.demoClocks)
    .where(eq(schema.demoClocks.clinicId, clinicId))
    .limit(1);
  if (demoClock?.currentDate !== anchor.today) {
    problems.push(`Reloj demo ${demoClock?.currentDate ?? "ausente"} != ${anchor.today}.`);
  }

  // ── Mensajes por tipo de conversación ───────────────────────────
  const directConvs = await ex
    .select({ id: schema.conversations.id })
    .from(schema.conversations)
    .where(and(clinicScope(schema.conversations), eq(schema.conversations.type, "direct")));
  const [groupConv] = await ex
    .select({ id: schema.conversations.id })
    .from(schema.conversations)
    .where(and(clinicScope(schema.conversations), eq(schema.conversations.type, "group")))
    .limit(1);

  const directIds = directConvs.map((c) => c.id);
  const directMsgs = directIds.length
    ? await countRows(schema.messages, and(clinicScope(schema.messages), inArray(schema.messages.conversationId, directIds)))
    : 0;
  expect("mensajes_directos", directMsgs, 30);

  if (groupConv) {
    const groupMsgs = await countRows(
      schema.messages,
      and(clinicScope(schema.messages), eq(schema.messages.conversationId, groupConv.id)),
    );
    expectRange("mensajes_grupo", groupMsgs, 18, 25);
    expect(
      "miembros_grupo",
      await countRows(schema.conversationMembers, and(clinicScope(schema.conversationMembers), eq(schema.conversationMembers.conversationId, groupConv.id))),
      5,
    );
  } else {
    problems.push("No se encontró la conversación de grupo.");
  }

  // ── Doctora ausente de conversaciones ───────────────────────────
  const doctorMembers = await ex
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.conversationMembers)
    .innerJoin(
      schema.users,
      and(
        eq(schema.conversationMembers.clinicId, schema.users.clinicId),
        eq(schema.conversationMembers.userId, schema.users.id),
      ),
    )
    .where(and(eq(schema.conversationMembers.clinicId, clinicId), eq(schema.users.role, "doctor")));
  if ((doctorMembers[0]?.n ?? 0) !== 0) {
    problems.push("La doctora aparece como miembro de alguna conversación.");
  }

  // ── Perfiles: edad, source_invitation, subconjunto de tipos ─────
  const profiles = await ex
    .select({
      profileId: schema.patientProfiles.id,
      email: schema.users.email,
      displayName: schema.patientProfiles.displayName,
      city: schema.patientProfiles.city,
      birthDate: schema.patientProfiles.birthDate,
      bio: schema.patientProfiles.bio,
      goals: schema.patientProfiles.goals,
      connectionTypes: schema.patientProfiles.connectionTypes,
      avatarUrl: schema.patientProfiles.avatarUrl,
      sourceInvitationId: schema.patientProfiles.sourceInvitationId,
      allowedConnectionTypes: schema.invitations.allowedConnectionTypes,
      invitationClinicId: schema.invitations.clinicId,
      acceptedAt: schema.invitations.acceptedAt,
      expiresAt: schema.invitations.expiresAt,
    })
    .from(schema.patientProfiles)
    .innerJoin(
      schema.users,
      and(
        eq(schema.patientProfiles.clinicId, schema.users.clinicId),
        eq(schema.patientProfiles.userId, schema.users.id),
      ),
    )
    .innerJoin(
      schema.invitations,
      eq(schema.patientProfiles.sourceInvitationId, schema.invitations.id),
    )
    .where(clinicScope(schema.patientProfiles));

  const profileIdToKey = new Map<string, PatientKey>();
  const emails = new Set<string>();
  for (const p of profiles) {
    profileIdToKey.set(p.profileId, keyForEmail(p.email));
    emails.add(p.email.toLowerCase());
    if (!p.sourceInvitationId) {
      problems.push(`Perfil sin source_invitation_id: ${p.email}.`);
    }
    if (p.invitationClinicId !== clinicId) {
      problems.push(`Invitación de otro tenant para ${p.email}.`);
    }
    if (p.avatarUrl !== null) {
      problems.push(`Avatar no nulo para ${p.email}.`);
    }
    const age = anchor.ageOn(p.birthDate);
    if (age < 18) {
      problems.push(`${p.email} no es mayor de edad (${age}).`);
    }
    const allowed = new Set(p.allowedConnectionTypes as string[]);
    for (const type of p.connectionTypes as string[]) {
      if (!allowed.has(type)) {
        problems.push(`Tipo '${type}' del perfil ${p.email} no está autorizado.`);
      }
    }
    if (p.acceptedAt && p.expiresAt && !(p.acceptedAt < p.expiresAt)) {
      problems.push(`accepted_at no es anterior a expires_at para ${p.email}.`);
    }
  }
  if (emails.size !== profiles.length) {
    problems.push("Emails de pacientes no son únicos.");
  }

  // ── Intereses por perfil entre 3 y 6, ninguno sin intereses ─────
  const interestCounts = await ex
    .select({
      profileId: schema.patientInterests.patientProfileId,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.patientInterests)
    .where(clinicScope(schema.patientInterests))
    .groupBy(schema.patientInterests.patientProfileId);
  if (interestCounts.length !== 8) {
    problems.push(`Perfiles con intereses: ${interestCounts.length}, esperado 8.`);
  }
  for (const row of interestCounts) {
    if (row.n < 3 || row.n > 6) {
      problems.push(`Perfil ${row.profileId} tiene ${row.n} intereses (fuera de 3-6).`);
    }
  }

  // ── Aislamiento de tenant: ningún hijo referencia otra clínica ──
  // (Las FKs compuestas clinic_id+id ya lo garantizan; verificación explícita.)
  const crossInterests = await ex
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.patientInterests)
    .innerJoin(
      schema.interests,
      and(
        eq(schema.patientInterests.clinicId, schema.interests.clinicId),
        eq(schema.patientInterests.interestId, schema.interests.id),
      ),
    )
    .where(and(eq(schema.patientInterests.clinicId, clinicId), sql`${schema.interests.clinicId} <> ${clinicId}`));
  if ((crossInterests[0]?.n ?? 0) !== 0) {
    problems.push("Intereses de perfil referencian otra clínica.");
  }

  // ── Check-ins y reglas del Pulso ────────────────────────────────
  const checkInRows = await ex
    .select({
      email: schema.users.email,
      date: schema.checkIns.checkInDate,
      mood: schema.checkIns.mood,
      sleep: schema.checkIns.sleep,
      connected: schema.checkIns.connectedWithSomeone,
    })
    .from(schema.checkIns)
    .innerJoin(
      schema.users,
      and(
        eq(schema.checkIns.clinicId, schema.users.clinicId),
        eq(schema.checkIns.patientUserId, schema.users.id),
      ),
    )
    .where(clinicScope(schema.checkIns))
    .orderBy(schema.users.email, schema.checkIns.checkInDate);

  const byPatient = new Map<PatientKey, { dates: string[]; mood: number[]; sleep: number[]; connected: boolean[] }>();
  for (const row of checkInRows) {
    const key = keyForEmail(row.email);
    if (!byPatient.has(key)) {
      byPatient.set(key, { dates: [], mood: [], sleep: [], connected: [] });
    }
    const bucket = byPatient.get(key)!;
    bucket.dates.push(row.date);
    bucket.mood.push(row.mood);
    bucket.sleep.push(row.sleep);
    bucket.connected.push(row.connected);
  }

  for (const patient of PATIENTS) {
    const series = byPatient.get(patient.key);
    if (!series || series.mood.length !== CHECK_IN_DAYS) {
      problems.push(`${patient.key}: se esperaban ${CHECK_IN_DAYS} check-ins.`);
      continue;
    }
    // R3: 14 fechas consecutivas terminando hoy.
    for (let j = 0; j < CHECK_IN_DAYS; j += 1) {
      const expectedDate = anchor.date(CHECK_IN_DAYS - 1 - j);
      if (series.dates[j] !== expectedDate) {
        problems.push(`${patient.key}: fecha de check-in ${series.dates[j]} != ${expectedDate}.`);
      }
    }
    const drop = r1Drop(series.mood);
    const lowMoodRun = maxLowMoodRun(series.mood);
    const lowSleepRun = maxLowSleepRun(series.sleep);
    const noConnRun = maxNoConnectionRun(series.connected);

    // R4 / R5: nadie debe dispararlas (ni Mariana).
    if (lowSleepRun >= 4) {
      problems.push(`${patient.key}: dispararía R4 (sueño<=2 por ${lowSleepRun} días).`);
    }
    if (noConnRun >= 7) {
      problems.push(`${patient.key}: dispararía R5 (sin conexión por ${noConnRun} días).`);
    }

    if (patient.key === "mariana") {
      if (!(drop >= 1.5)) {
        problems.push(`Mariana NO cumple R1 (caída ${drop.toFixed(4)} < 1.5).`);
      }
      if (lowMoodRun < 3) {
        problems.push(`Mariana NO cumple R2 (corrida ánimo<=2 = ${lowMoodRun}).`);
      }
    } else {
      if (drop >= 1.5) {
        problems.push(`${patient.key}: dispararía R1 accidentalmente (caída ${drop.toFixed(4)}).`);
      }
      if (lowMoodRun >= 3) {
        problems.push(`${patient.key}: dispararía R2 accidentalmente (corrida ${lowMoodRun}).`);
      }
    }
  }

  // ── Firma lógica (sin ids ni timestamps técnicos) ───────────────
  const sortedProfiles = [...profiles]
    .map((p) => ({
      key: keyForEmail(p.email),
      email: p.email.toLowerCase(),
      displayName: p.displayName,
      city: p.city,
      birthDate: p.birthDate,
      bio: p.bio,
      goals: p.goals,
      connectionTypes: [...(p.connectionTypes as string[])].sort(),
    }))
    .sort((a, b) => (a.key < b.key ? -1 : 1));

  const interestsByProfile = await ex
    .select({ email: schema.users.email, slug: schema.interests.slug })
    .from(schema.patientInterests)
    .innerJoin(
      schema.patientProfiles,
      and(
        eq(schema.patientInterests.clinicId, schema.patientProfiles.clinicId),
        eq(schema.patientInterests.patientProfileId, schema.patientProfiles.id),
      ),
    )
    .innerJoin(
      schema.users,
      and(
        eq(schema.patientProfiles.clinicId, schema.users.clinicId),
        eq(schema.patientProfiles.userId, schema.users.id),
      ),
    )
    .innerJoin(
      schema.interests,
      and(
        eq(schema.patientInterests.clinicId, schema.interests.clinicId),
        eq(schema.patientInterests.interestId, schema.interests.id),
      ),
    )
    .where(clinicScope(schema.patientInterests));
  const interestsByKey: Record<string, string[]> = {};
  for (const row of interestsByProfile) {
    const key = keyForEmail(row.email);
    (interestsByKey[key] ??= []).push(row.slug);
  }
  for (const key of Object.keys(interestsByKey)) {
    interestsByKey[key]!.sort();
  }

  const checkInSignature = [...byPatient.entries()]
    .map(([key, series]) => ({
      key,
      days: series.dates.map((date, j) => ({
        offset: anchor.offsetFromToday(date),
        mood: series.mood[j],
        sleep: series.sleep[j],
        connected: series.connected[j],
      })),
    }))
    .sort((a, b) => (a.key < b.key ? -1 : 1));

  // Matches por par de keys ordenado.
  const matchRows = await ex
    .select({
      a: schema.matchScores.patientAId,
      b: schema.matchScores.patientBId,
      score: schema.matchScores.score,
      explanation: schema.matchScores.explanation,
      source: schema.matchScores.source,
    })
    .from(schema.matchScores)
    .where(clinicScope(schema.matchScores));
  const matchSignature = matchRows
    .map((m) => {
      const pair = [profileIdToKey.get(m.a)!, profileIdToKey.get(m.b)!].sort();
      return { pair, score: m.score, explanation: m.explanation, source: m.source };
    })
    .sort((x, y) => (x.pair.join("-") < y.pair.join("-") ? -1 : 1));

  // Conexiones.
  const connectionRows = await ex
    .select({
      a: schema.connections.patientAId,
      b: schema.connections.patientBId,
      type: schema.connections.connectionType,
      status: schema.connections.status,
    })
    .from(schema.connections)
    .where(clinicScope(schema.connections));
  const connectionSignature = connectionRows
    .map((c) => {
      const pair = [profileIdToKey.get(c.a)!, profileIdToKey.get(c.b)!].sort();
      return { pair, type: c.type, status: c.status };
    })
    .sort((x, y) => (x.pair.join("-") < y.pair.join("-") ? -1 : 1));

  // Conversaciones (directas + grupo) con miembros y mensajes en orden.
  const allConversations = await ex
    .select({
      id: schema.conversations.id,
      type: schema.conversations.type,
      title: schema.conversations.title,
      status: schema.conversations.status,
    })
    .from(schema.conversations)
    .where(clinicScope(schema.conversations));

  const conversationSignature: unknown[] = [];
  for (const conv of allConversations) {
    const members = await ex
      .select({ email: schema.users.email, role: schema.conversationMembers.memberRole })
      .from(schema.conversationMembers)
      .innerJoin(
        schema.users,
        and(
          eq(schema.conversationMembers.clinicId, schema.users.clinicId),
          eq(schema.conversationMembers.userId, schema.users.id),
        ),
      )
      .where(and(clinicScope(schema.conversationMembers), eq(schema.conversationMembers.conversationId, conv.id)));
    const msgs = await ex
      .select({ email: schema.users.email, body: schema.messages.body, sentAt: schema.messages.sentAt })
      .from(schema.messages)
      .innerJoin(
        schema.users,
        and(
          eq(schema.messages.clinicId, schema.users.clinicId),
          eq(schema.messages.senderUserId, schema.users.id),
        ),
      )
      .where(and(clinicScope(schema.messages), eq(schema.messages.conversationId, conv.id)))
      .orderBy(schema.messages.sentAt);

    // Timestamps estrictamente no decrecientes y remitente miembro.
    const memberKeys = new Set(members.map((m) => keyForEmail(m.email)));
    let previous = -Infinity;
    for (const msg of msgs) {
      const t = msg.sentAt.getTime();
      if (t < previous) {
        problems.push(`Mensajes con timestamp decreciente en conversación ${conv.type}.`);
      }
      previous = t;
      if (!memberKeys.has(keyForEmail(msg.email))) {
        problems.push(`Remitente fuera de la conversación ${conv.type}.`);
      }
    }

    conversationSignature.push({
      kind: conv.type,
      title: conv.title,
      status: conv.status,
      members: members
        .map((m) => ({ key: keyForEmail(m.email), role: m.role }))
        .sort((a, b) => (a.key < b.key ? -1 : 1)),
      messages: msgs.map((m) => ({ sender: keyForEmail(m.email), body: m.body })),
    });
  }
  conversationSignature.sort((a, b) =>
    stableStringify(a) < stableStringify(b) ? -1 : 1,
  );

  const signaturePayload = {
    clinic: { name: DEMO_CLINIC_NAME, slug: DEMO_CLINIC_SLUG, status: clinic.status, timezone: clinic.timezone },
    patients: sortedProfiles.map((p) => ({ ...p, interests: interestsByKey[p.key] ?? [] })),
    checkIns: checkInSignature,
    matches: matchSignature,
    connections: connectionSignature,
    conversations: conversationSignature,
  };
  const signature = createHash("sha256").update(stableStringify(signaturePayload)).digest("hex");

  if (problems.length > 0) {
    throw new Error(
      `Verificación del seed FALLIDA (${problems.length}):\n - ${problems.join("\n - ")}`,
    );
  }

  return { counts, signature };
}

/** CLI independiente: `pnpm --filter @mindmatch/api seed:verify`. */
async function runCli() {
  const anchor = createAnchor();
  try {
    const { counts, signature } = await verifyDemoSeed(db, anchor);
    console.log("✅ Verificación del seed demo OK");
    console.table(counts);
    console.log(`🔏 Firma lógica: ${signature}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await queryClient.end();
  }
}

// Ejecutar solo cuando se invoca directamente como script.
const invokedDirectly = process.argv[1]?.includes("verify-demo-seed");
if (invokedDirectly) {
  void runCli();
}
