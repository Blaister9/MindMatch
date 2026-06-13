import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { DEMO_CLINIC_SLUG } from "./data/clinic";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Elimina EXCLUSIVAMENTE los datos del tenant `mindmatch-demo`, en orden
 * hijo → padre, filtrando por `clinic_id`. No depende de ON DELETE CASCADE
 * (varias FKs son `restrict`). No toca ninguna otra clínica.
 *
 * Debe ejecutarse dentro de la transacción del seed.
 */
export async function resetDemoTenant(tx: Transaction): Promise<void> {
  const [clinic] = await tx
    .select({ id: schema.clinics.id })
    .from(schema.clinics)
    .where(eq(schema.clinics.slug, DEMO_CLINIC_SLUG))
    .limit(1);

  if (!clinic) {
    // No hay tenant demo previo: nada que borrar.
    return;
  }

  const clinicId = clinic.id;

  // analytics → clinical → social, hijos antes que padres.
  await tx.delete(schema.patientDailyMetrics).where(eq(schema.patientDailyMetrics.clinicId, clinicId));
  await tx.delete(schema.clinicDailyMetrics).where(eq(schema.clinicDailyMetrics.clinicId, clinicId));
  await tx.delete(schema.events).where(eq(schema.events.clinicId, clinicId));

  await tx.delete(schema.professionalNotes).where(eq(schema.professionalNotes.clinicId, clinicId));
  await tx.delete(schema.matchDecisions).where(eq(schema.matchDecisions.clinicId, clinicId));
  await tx.delete(schema.riskScores).where(eq(schema.riskScores.clinicId, clinicId));
  await tx.delete(schema.alerts).where(eq(schema.alerts.clinicId, clinicId));
  await tx.delete(schema.checkIns).where(eq(schema.checkIns.clinicId, clinicId));
  await tx.delete(schema.checkInPreferences).where(eq(schema.checkInPreferences.clinicId, clinicId));
  await tx.delete(schema.patientClinical).where(eq(schema.patientClinical.clinicId, clinicId));

  await tx.delete(schema.messageReports).where(eq(schema.messageReports.clinicId, clinicId));
  await tx.delete(schema.messages).where(eq(schema.messages.clinicId, clinicId));
  await tx.delete(schema.conversationMembers).where(eq(schema.conversationMembers.clinicId, clinicId));
  await tx.delete(schema.supportGroups).where(eq(schema.supportGroups.clinicId, clinicId));
  await tx.delete(schema.conversations).where(eq(schema.conversations.clinicId, clinicId));
  await tx.delete(schema.connections).where(eq(schema.connections.clinicId, clinicId));
  await tx.delete(schema.swipes).where(eq(schema.swipes.clinicId, clinicId));
  await tx.delete(schema.matchScores).where(eq(schema.matchScores.clinicId, clinicId));
  await tx.delete(schema.profileEmbeddings).where(eq(schema.profileEmbeddings.clinicId, clinicId));
  await tx.delete(schema.patientInterests).where(eq(schema.patientInterests.clinicId, clinicId));
  await tx.delete(schema.wellnessMissions).where(eq(schema.wellnessMissions.clinicId, clinicId));
  await tx.delete(schema.refreshTokens).where(eq(schema.refreshTokens.clinicId, clinicId));
  await tx.delete(schema.patientProfiles).where(eq(schema.patientProfiles.clinicId, clinicId));
  await tx.delete(schema.invitations).where(eq(schema.invitations.clinicId, clinicId));
  await tx.delete(schema.interests).where(eq(schema.interests.clinicId, clinicId));
  await tx.delete(schema.users).where(eq(schema.users.clinicId, clinicId));

  await tx.delete(schema.clinics).where(eq(schema.clinics.id, clinicId));
}
