import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, queryClient, schema } from "../db";
import { env } from "../env";
import { hashPassword } from "../security/passwords";

const defaultInterests = [
  ["Caminar", "caminar"],
  ["Lectura", "lectura"],
  ["Música", "musica"],
  ["Cine", "cine"],
  ["Café y conversación", "cafe-conversacion"],
  ["Arte", "arte"],
  ["Ejercicio suave", "ejercicio-suave"],
  ["Voluntariado", "voluntariado"],
] as const;

async function bootstrapDoctor() {
  if (env.NODE_ENV === "production") {
    throw new Error("bootstrap:doctor no se puede ejecutar en producción.");
  }

  const passwordHash = await hashPassword(env.DEMO_DOCTOR_PASSWORD);

  await db.transaction(async (tx) => {
    const [clinic] = await tx
      .insert(schema.clinics)
      .values({
        id: randomUUID(),
        name: "Clínica Demo MindMatch",
        slug: env.DEFAULT_CLINIC_SLUG,
        timezone: "America/Bogota",
        status: "active",
      })
      .onConflictDoUpdate({
        target: schema.clinics.slug,
        set: { status: "active", updatedAt: new Date() },
      })
      .returning({ id: schema.clinics.id });

    if (!clinic) {
      throw new Error("No se pudo crear o reutilizar la clínica demo.");
    }

    const email = env.DEMO_DOCTOR_EMAIL.toLowerCase();
    const [existingDoctor] = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        sql`${schema.users.clinicId} = ${clinic.id} AND lower(${schema.users.email}) = ${email}`,
      )
      .limit(1);

    if (existingDoctor) {
      await tx
        .update(schema.users)
        .set({
          role: "doctor",
          passwordHash,
          status: "active",
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, existingDoctor.id));
    } else {
      await tx.insert(schema.users).values({
        id: randomUUID(),
        clinicId: clinic.id,
        role: "doctor",
        email,
        passwordHash,
        status: "active",
      });
    }

    for (const [name, slug] of defaultInterests) {
      await tx
        .insert(schema.interests)
        .values({
          id: randomUUID(),
          clinicId: clinic.id,
          name,
          slug,
          active: true,
        })
        .onConflictDoUpdate({
          target: [schema.interests.clinicId, schema.interests.slug],
          set: { name, active: true },
        });
    }
  });

  console.log("Bootstrap local de doctora demo completado.");
}

bootstrapDoctor()
  .catch((err) => {
    console.error("Error ejecutando bootstrap local:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await queryClient.end();
  });
