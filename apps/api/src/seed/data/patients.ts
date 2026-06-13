import type { ConnectionType } from "@mindmatch/shared";

/** Claves lógicas estables de los ocho pacientes demo. */
export type PatientKey =
  | "mariana"
  | "daniel"
  | "laura"
  | "andres"
  | "valentina"
  | "camilo"
  | "juliana"
  | "felipe";

export const PATIENT_KEYS: readonly PatientKey[] = [
  "mariana",
  "daniel",
  "laura",
  "andres",
  "valentina",
  "camilo",
  "juliana",
  "felipe",
];

export interface PatientSeed {
  readonly key: PatientKey;
  readonly displayName: string;
  readonly email: string;
  readonly city: string;
  /** Fecha de nacimiento YYYY-MM-DD (mayoría de edad garantizada). */
  readonly birthDate: string;
  /** Tipos de conexión autorizados por la invitación. */
  readonly allowedConnectionTypes: ConnectionType[];
  /** Tipos del perfil; SIEMPRE subconjunto de los autorizados. */
  readonly connectionTypes: ConnectionType[];
  readonly bio: string;
  readonly goals: string;
  /** 3 a 6 slugs del catálogo de intereses. */
  readonly interestSlugs: string[];
  /** Hora local del recordatorio de check-in (HH:MM:SS). */
  readonly checkInLocalTime: string;
}

export const PATIENTS: readonly PatientSeed[] = [
  {
    key: "mariana",
    displayName: "Mariana Torres",
    email: "mariana@demo.com",
    city: "Bogotá",
    birthDate: "1996-09-12",
    allowedConnectionTypes: ["friendship", "group"],
    connectionTypes: ["friendship", "group"],
    bio: "Bogotana de corazón. Me encanta perderme en una librería y cerrar la tarde con un café tranquilo. Busco gente calmada para compartir charlas sin afán.",
    goals: "Volver a leer con frecuencia y hacer amigos en Bogotá sin presión.",
    interestSlugs: ["lectura", "cafe", "musica", "fotografia"],
    checkInLocalTime: "08:00:00",
  },
  {
    key: "daniel",
    displayName: "Daniel Rojas",
    email: "daniel@demo.com",
    city: "Bogotá",
    birthDate: "1994-11-03",
    allowedConnectionTypes: ["friendship", "group"],
    connectionTypes: ["friendship", "group"],
    bio: "Salgo a montar bici para despejarme y siempre ando con audífonos puestos. Me gusta la conversación honesta y los planes simples.",
    goals: "Ampliar mi círculo social y participar en actividades grupales.",
    interestSlugs: ["futbol", "musica", "cafe", "ciclismo"],
    checkInLocalTime: "07:30:00",
  },
  {
    key: "laura",
    displayName: "Laura Gómez",
    email: "laura@demo.com",
    city: "Medellín",
    birthDate: "1999-06-21",
    allowedConnectionTypes: ["friendship", "group", "romantic"],
    connectionTypes: ["friendship", "group"],
    bio: "Paisa cinéfila y fotógrafa de retratos. Disfruto los ciclos de cine y caminar por la ciudad buscando buena luz.",
    goals: "Conocer personas con intereses similares y participar en actividades grupales.",
    interestSlugs: ["cine", "fotografia", "baile", "cafe"],
    checkInLocalTime: "21:00:00",
  },
  {
    key: "andres",
    displayName: "Andrés Herrera",
    email: "andres@demo.com",
    city: "Cali",
    birthDate: "1992-02-17",
    allowedConnectionTypes: ["friendship", "romantic"],
    connectionTypes: ["friendship", "romantic"],
    bio: "Caleño tranquilo. Me relaja salir a caminar y tomar fotos del camino, y los findes no me pierdo el fútbol.",
    goals: "Ampliar el círculo social y practicar senderismo más seguido.",
    interestSlugs: ["futbol", "cine", "senderismo"],
    checkInLocalTime: "20:30:00",
  },
  {
    key: "valentina",
    displayName: "Valentina Ruiz",
    email: "valentina@demo.com",
    city: "Bogotá",
    birthDate: "2002-08-30",
    allowedConnectionTypes: ["friendship", "group"],
    connectionTypes: ["friendship", "group"],
    bio: "Me cargo de energía bailando y descubriendo música nueva. Soy curiosa y me gusta planear viajes cortos.",
    goals: "Hacer amigos en Bogotá y recuperar hábitos de descanso.",
    interestSlugs: ["baile", "musica", "cafe", "lectura", "viajes"],
    checkInLocalTime: "09:15:00",
  },
  {
    key: "camilo",
    displayName: "Camilo Vargas",
    email: "camilo@demo.com",
    city: "Medellín",
    birthDate: "1987-12-05",
    allowedConnectionTypes: ["friendship"],
    connectionTypes: ["friendship"],
    bio: "Madrugador y aficionado a la montaña. Salgo en bici, camino con mi perro y no perdono un buen tinto.",
    goals: "Practicar senderismo en grupo y conocer personas con intereses similares.",
    interestSlugs: ["senderismo", "ciclismo", "cafe", "mascotas"],
    checkInLocalTime: "06:45:00",
  },
  {
    key: "juliana",
    displayName: "Juliana Castro",
    email: "juliana@demo.com",
    city: "Barranquilla",
    birthDate: "1999-04-09",
    allowedConnectionTypes: ["friendship", "group"],
    connectionTypes: ["friendship", "group"],
    bio: "Barranquillera que se relaja cocinando y cuidando sus plantas. Pongo música mientras preparo algo rico y me gusta compartir mesa.",
    goals: "Aprender a cocinar recetas nuevas y ampliar mi círculo social.",
    interestSlugs: ["cocina", "baile", "musica", "jardineria"],
    checkInLocalTime: "19:45:00",
  },
  {
    key: "felipe",
    displayName: "Felipe Moreno",
    email: "felipe@demo.com",
    city: "Bucaramanga",
    birthDate: "1985-01-26",
    allowedConnectionTypes: ["friendship"],
    connectionTypes: ["friendship"],
    bio: "Santandereano al que le encanta la montaña y la cocina de fin de semana. Viajo cuando puedo y siempre ando con mi perra.",
    goals: "Practicar senderismo y conocer personas con intereses similares.",
    interestSlugs: ["senderismo", "ciclismo", "cocina", "viajes", "mascotas"],
    checkInLocalTime: "22:00:00",
  },
] as const;
