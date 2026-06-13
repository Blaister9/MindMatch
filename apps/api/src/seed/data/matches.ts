import type { PatientKey } from "./patients";

/**
 * Pares de compatibilidad precalculados (source = demo). Cada explicación se
 * basa SOLO en atributos realmente compartidos por ambos perfiles (intereses,
 * ciudad) o en metas/tipos de conexión compatibles. Nunca info clínica.
 *
 * Intereses por paciente (para auditar las explicaciones):
 *  mariana:   lectura, cafe, musica, fotografia
 *  daniel:    futbol, musica, cafe, ciclismo
 *  laura:     cine, fotografia, baile, cafe
 *  andres:    futbol, cine, senderismo
 *  valentina: baile, musica, cafe, lectura, viajes
 *  camilo:    senderismo, ciclismo, cafe, mascotas
 *  juliana:   cocina, baile, musica, jardineria
 *  felipe:    senderismo, ciclismo, cocina, viajes, mascotas
 */
export interface MatchSeed {
  readonly a: PatientKey;
  readonly b: PatientKey;
  readonly score: number;
  readonly explanation: string;
}

/** Clave lógica estable e independiente del orden para un par. */
export function pairKey(a: PatientKey, b: PatientKey): string {
  return [a, b].sort().join("-");
}

export const MATCHES: readonly MatchSeed[] = [
  {
    a: "mariana",
    b: "daniel",
    score: 0.91,
    explanation:
      "Comparten la música y el café, y ambos viven en Bogotá; buena base para una amistad tranquila.",
  },
  {
    a: "mariana",
    b: "valentina",
    score: 0.84,
    explanation:
      "Coinciden en lectura, música y café en Bogotá, y a ambas les interesan los planes grupales.",
  },
  {
    a: "mariana",
    b: "juliana",
    score: 0.74,
    explanation:
      "Las une el gusto por la música y la apertura a participar en actividades de grupo.",
  },
  {
    a: "mariana",
    b: "laura",
    score: 0.69,
    explanation:
      "Comparten la fotografía y el café, con ganas parecidas de ampliar su círculo.",
  },
  {
    a: "daniel",
    b: "andres",
    score: 0.66,
    explanation: "Los conecta el fútbol y el interés común por hacer más amigos.",
  },
  {
    a: "daniel",
    b: "valentina",
    score: 0.78,
    explanation:
      "Comparten la música y el café en Bogotá, y la meta de ampliar su círculo social.",
  },
  {
    a: "daniel",
    b: "camilo",
    score: 0.62,
    explanation: "Coinciden en el ciclismo y en disfrutar un buen café.",
  },
  {
    a: "laura",
    b: "andres",
    score: 0.88,
    explanation:
      "Los une el cine y el deseo de ampliar su círculo conociendo gente con calma.",
  },
  {
    a: "laura",
    b: "valentina",
    score: 0.71,
    explanation: "Comparten el baile y el café, y disfrutan los planes relajados.",
  },
  {
    a: "laura",
    b: "juliana",
    score: 0.64,
    explanation: "Las conecta el baile y el interés por las actividades en grupo.",
  },
  {
    a: "andres",
    b: "camilo",
    score: 0.67,
    explanation: "Comparten el senderismo y prefieren planes al aire libre.",
  },
  {
    a: "andres",
    b: "felipe",
    score: 0.59,
    explanation: "Los une el senderismo y las salidas de montaña.",
  },
  {
    a: "valentina",
    b: "juliana",
    score: 0.81,
    explanation:
      "Coinciden en el baile y la música, y a ambas les gustan los planes grupales.",
  },
  {
    a: "valentina",
    b: "camilo",
    score: 0.6,
    explanation: "Comparten el gusto por el café y los planes sencillos.",
  },
  {
    a: "camilo",
    b: "felipe",
    score: 0.76,
    explanation:
      "Comparten senderismo, ciclismo y el cariño por sus mascotas; perfil muy afín.",
  },
  {
    a: "juliana",
    b: "felipe",
    score: 0.63,
    explanation: "Los une la cocina y el interés por aprender recetas nuevas.",
  },
  {
    a: "mariana",
    b: "camilo",
    score: 0.58,
    explanation: "Coinciden en disfrutar un buen café y la conversación pausada.",
  },
  {
    a: "daniel",
    b: "juliana",
    score: 0.7,
    explanation: "Los conecta la música y las ganas de compartir en grupo.",
  },
] as const;
