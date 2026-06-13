/** Catálogo compartido de intereses de la clínica demo (15). */

export interface InterestSeed {
  readonly name: string;
  readonly slug: string;
}

export const INTERESTS: readonly InterestSeed[] = [
  { name: "Senderismo", slug: "senderismo" },
  { name: "Lectura", slug: "lectura" },
  { name: "Fútbol", slug: "futbol" },
  { name: "Cocina", slug: "cocina" },
  { name: "Música", slug: "musica" },
  { name: "Cine", slug: "cine" },
  { name: "Fotografía", slug: "fotografia" },
  { name: "Baile", slug: "baile" },
  { name: "Ciclismo", slug: "ciclismo" },
  { name: "Mascotas", slug: "mascotas" },
  { name: "Videojuegos", slug: "videojuegos" },
  { name: "Jardinería", slug: "jardineria" },
  { name: "Café", slug: "cafe" },
  { name: "Viajes", slug: "viajes" },
  { name: "Escritura", slug: "escritura" },
] as const;

export const INTEREST_SLUGS = INTERESTS.map((interest) => interest.slug);
