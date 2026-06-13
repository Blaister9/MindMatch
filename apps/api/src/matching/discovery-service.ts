import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { ConnectionType, PublicCandidate } from "@mindmatch/shared";
import { schema } from "../db";
import { adultCutoffYmd, ageFromBirthDate, bogotaTodayYmd } from "../domain/dates";
import { resolveSuggestedType, sharedBilateralTypes } from "../domain/pairs";
import type { MatchingContext, MatchingService, Reader } from "./types";

/** Estados de conexión que bloquean el redescubrimiento de un par. */
export const BLOCKING_CONNECTION_STATES = [
  "pending_approval",
  "approved",
  "active",
  "paused",
  "rejected",
  "closed",
] as const;

export interface SelfProfile {
  readonly id: string;
  readonly city: string;
  readonly connectionTypes: ConnectionType[];
}

export async function resolveSelfProfile(
  ex: Reader,
  clinicId: string,
  userId: string,
): Promise<SelfProfile | null> {
  const [row] = await ex
    .select({
      id: schema.patientProfiles.id,
      city: schema.patientProfiles.city,
      connectionTypes: schema.patientProfiles.connectionTypes,
    })
    .from(schema.patientProfiles)
    .where(
      and(
        eq(schema.patientProfiles.clinicId, clinicId),
        eq(schema.patientProfiles.userId, userId),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    city: row.city,
    connectionTypes: row.connectionTypes as ConnectionType[],
  };
}

interface EligibilityParams {
  clinicId: string;
  selfProfileId: string;
  selfBilateralTypes: ConnectionType[];
  adultCutoff: string;
  includePriorSwipeFilter: boolean;
  targetProfileId?: string;
}

/**
 * Condiciones de filtros duros (orden documentado). Fuente ÚNICA usada por el
 * deck de discovery y por la validación de swipe.
 */
function eligibilityConditions(params: EligibilityParams): SQL[] {
  const p = schema.patientProfiles;
  const u = schema.users;
  const { clinicId, selfProfileId, selfBilateralTypes, adultCutoff } = params;

  const typesArray = sql`ARRAY[${sql.join(
    selfBilateralTypes.map((t) => sql`${t}`),
    sql`, `,
  )}]::social.connection_type[]`;

  const blocking = sql.join(
    BLOCKING_CONNECTION_STATES.map((s) => sql`${s}`),
    sql`, `,
  );

  const conditions: SQL[] = [
    // 1 tenant · 4 mismo tenant (join u.clinic_id = p.clinic_id)
    eq(p.clinicId, clinicId),
    eq(u.clinicId, clinicId),
    // 2 no verse a sí mismo
    sql`${p.id} <> ${selfProfileId}`,
    // 5 usuario target paciente activo
    eq(u.role, "patient"),
    eq(u.status, "active"),
    // 6 onboarding completo
    sql`${p.onboardingCompletedAt} is not null`,
    // 7 mayor de 18 (límite calculado con día Bogotá, no CURRENT_DATE del server)
    sql`${p.birthDate} <= ${adultCutoff}::date`,
    // 8 intersección bilateral no vacía
    sql`${p.connectionTypes} && ${typesArray}`,
    // 10 ninguna conexión del par en estados bloqueantes (cualquier tipo)
    sql`not exists (
      select 1 from social.connections c
      where c.clinic_id = ${clinicId}
        and c.status::text in (${blocking})
        and ((c.patient_a_id = ${selfProfileId} and c.patient_b_id = ${p.id})
          or (c.patient_a_id = ${p.id} and c.patient_b_id = ${selfProfileId}))
    )`,
  ];

  // 9 ningún swipe previo del actor (SOLO discovery; el swipe lo gestiona aparte)
  if (params.includePriorSwipeFilter) {
    conditions.push(sql`not exists (
      select 1 from social.swipes s
      where s.clinic_id = ${clinicId}
        and s.actor_patient_id = ${selfProfileId}
        and s.target_patient_id = ${p.id}
    )`);
  }

  if (params.targetProfileId) {
    conditions.push(eq(p.id, params.targetProfileId));
  }

  return conditions;
}

interface EligibleRow {
  profileId: string;
  userId: string;
  displayName: string;
  birthDate: string;
  city: string;
  bio: string;
  goals: string;
  connectionTypes: ConnectionType[];
  avatarUrl: string | null;
}

function selectEligible(ex: Reader, conditions: SQL[]) {
  return ex
    .select({
      profileId: schema.patientProfiles.id,
      userId: schema.patientProfiles.userId,
      displayName: schema.patientProfiles.displayName,
      birthDate: schema.patientProfiles.birthDate,
      city: schema.patientProfiles.city,
      bio: schema.patientProfiles.bio,
      goals: schema.patientProfiles.goals,
      connectionTypes: schema.patientProfiles.connectionTypes,
      avatarUrl: schema.patientProfiles.avatarUrl,
    })
    .from(schema.patientProfiles)
    .innerJoin(
      schema.users,
      and(
        eq(schema.patientProfiles.clinicId, schema.users.clinicId),
        eq(schema.patientProfiles.userId, schema.users.id),
      ),
    )
    .where(and(...conditions));
}

/** Intereses de varios perfiles en una sola consulta (sin N+1). */
async function loadInterestsByProfile(
  ex: Reader,
  clinicId: string,
  profileIds: string[],
): Promise<Map<string, Array<{ id: string; name: string; slug: string }>>> {
  const map = new Map<string, Array<{ id: string; name: string; slug: string }>>();
  if (profileIds.length === 0) return map;
  const rows = await ex
    .select({
      profileId: schema.patientInterests.patientProfileId,
      id: schema.interests.id,
      name: schema.interests.name,
      slug: schema.interests.slug,
    })
    .from(schema.patientInterests)
    .innerJoin(
      schema.interests,
      and(
        eq(schema.patientInterests.clinicId, schema.interests.clinicId),
        eq(schema.patientInterests.interestId, schema.interests.id),
      ),
    )
    .where(
      and(
        eq(schema.patientInterests.clinicId, clinicId),
        inArray(schema.patientInterests.patientProfileId, profileIds),
      ),
    );
  for (const row of rows) {
    const list = map.get(row.profileId) ?? [];
    list.push({ id: row.id, name: row.name, slug: row.slug });
    map.set(row.profileId, list);
  }
  return map;
}

export async function getCandidates(
  ex: Reader,
  ctx: MatchingContext,
  self: SelfProfile,
  provider: MatchingService,
  limit: number,
): Promise<PublicCandidate[]> {
  const selfBilateralTypes = sharedBilateralTypes(
    self.connectionTypes,
    self.connectionTypes,
  );
  if (selfBilateralTypes.length === 0) return [];

  const today = bogotaTodayYmd();
  const adultCutoff = adultCutoffYmd(today);

  // Filtros duros 1-11.
  const rows = (await selectEligible(
    ex,
    eligibilityConditions({
      clinicId: ctx.clinicId,
      selfProfileId: ctx.selfProfileId,
      selfBilateralTypes,
      adultCutoff,
      includePriorSwipeFilter: true,
    }),
  )) as EligibleRow[];
  if (rows.length === 0) return [];

  // Filtro 12: compatibilidad existente en el provider seleccionado.
  const compat = await provider.scoreCandidates(
    ex,
    ctx,
    rows.map((r) => r.profileId),
  );
  const scored = rows.filter((r) => compat.has(r.profileId));
  if (scored.length === 0) return [];

  const interestsByProfile = await loadInterestsByProfile(ex, ctx.clinicId, [
    ctx.selfProfileId,
    ...scored.map((r) => r.profileId),
  ]);
  const selfSlugs = new Set(
    (interestsByProfile.get(ctx.selfProfileId) ?? []).map((i) => i.slug),
  );

  const candidates: PublicCandidate[] = scored.map((row) => {
    const pair = compat.get(row.profileId)!;
    const interests = interestsByProfile.get(row.profileId) ?? [];
    const sharedInterestSlugs = interests
      .filter((i) => selfSlugs.has(i.slug))
      .map((i) => i.slug);
    const suggested = resolveSuggestedType(
      self.connectionTypes,
      row.connectionTypes,
    );
    return {
      profileId: row.profileId,
      displayName: row.displayName,
      age: ageFromBirthDate(row.birthDate, today),
      city: row.city,
      bio: row.bio,
      goals: row.goals,
      interests,
      sharedInterestSlugs,
      avatarUrl: row.avatarUrl,
      compatibility: pair.score,
      explanation:
        pair.explanation ??
        buildFallbackExplanation(sharedInterestSlugs, interests, self.city, row.city),
      // suggested no puede ser null aquí (filtro 8 garantiza intersección)
      suggestedConnectionType: suggested ?? "friendship",
    };
  });

  candidates.sort(
    (a, b) =>
      b.compatibility - a.compatibility ||
      (a.profileId < b.profileId ? -1 : 1),
  );
  return candidates.slice(0, limit);
}

function buildFallbackExplanation(
  sharedSlugs: string[],
  interests: Array<{ name: string; slug: string }>,
  selfCity: string,
  otherCity: string,
): string {
  if (sharedSlugs.length > 0) {
    const names = interests
      .filter((i) => sharedSlugs.includes(i.slug))
      .map((i) => i.name);
    return `Intereses en común: ${names.join(", ")}.`;
  }
  if (selfCity && selfCity === otherCity) {
    return `Ambos están en ${otherCity}.`;
  }
  return "Compatibilidad basada en su perfil social.";
}

export interface ValidatedTarget {
  readonly profileId: string;
  readonly connectionTypes: ConnectionType[];
}

/**
 * Revalida los filtros duros para UN par dentro del swipe. NO incluye el filtro
 * 9 (swipe previo): el swipe gestiona la decisión existente vía conflicto.
 */
export async function validatePairForSwipe(
  ex: Reader,
  ctx: MatchingContext,
  selfBilateralTypes: ConnectionType[],
  targetProfileId: string,
): Promise<ValidatedTarget | null> {
  if (selfBilateralTypes.length === 0) return null;
  const adultCutoff = adultCutoffYmd();
  const rows = (await selectEligible(
    ex,
    eligibilityConditions({
      clinicId: ctx.clinicId,
      selfProfileId: ctx.selfProfileId,
      selfBilateralTypes,
      adultCutoff,
      includePriorSwipeFilter: false,
      targetProfileId,
    }),
  )) as EligibleRow[];
  const row = rows[0];
  if (!row) return null;
  return { profileId: row.profileId, connectionTypes: row.connectionTypes };
}
