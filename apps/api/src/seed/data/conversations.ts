import type { PatientKey } from "./patients";

/**
 * Conexiones demo. Todas de tipo `friendship` (todos los pacientes lo
 * autorizan). Cada par DEBE existir en MATCHES (se enlaza su match_score).
 * - 2 active (respaldan las conversaciones directas)
 * - 4 pending_approval
 * - 1 paused
 */
export type SeededConnectionStatus = "active" | "pending_approval" | "paused";

export interface ConnectionSeed {
  readonly a: PatientKey;
  readonly b: PatientKey;
  readonly status: SeededConnectionStatus;
}

export const CONNECTIONS: readonly ConnectionSeed[] = [
  { a: "mariana", b: "daniel", status: "active" },
  { a: "laura", b: "andres", status: "active" },
  { a: "valentina", b: "juliana", status: "pending_approval" },
  { a: "mariana", b: "valentina", status: "pending_approval" },
  { a: "camilo", b: "felipe", status: "pending_approval" },
  { a: "daniel", b: "valentina", status: "pending_approval" },
  { a: "mariana", b: "juliana", status: "paused" },
] as const;

export interface DirectMessageSeed {
  readonly sender: PatientKey;
  readonly body: string;
}

export interface DirectConversationSeed {
  /** Par de la conexión `active` que respalda la conversación. */
  readonly a: PatientKey;
  readonly b: PatientKey;
  readonly messages: readonly DirectMessageSeed[];
}

export const DIRECT_CONVERSATIONS: readonly DirectConversationSeed[] = [
  {
    a: "mariana",
    b: "daniel",
    messages: [
      { sender: "daniel", body: "¡Hola Mariana! Qué chévere que hicimos match 😊 Vi que también eres de Bogotá." },
      { sender: "mariana", body: "¡Hola Daniel! Sí, full bogotana jaja. Me llamó la atención que te guste la música." },
      { sender: "daniel", body: "Total, no paro de buscar cosas nuevas para escuchar. ¿Qué andas oyendo estos días?" },
      { sender: "mariana", body: "Ahorita ando entre algo tranqui para leer y, de vez en cuando, salsa para subir el ánimo." },
      { sender: "daniel", body: "¡Buenísimo! Yo soy más de rock e indie, pero la salsa un viernes nunca falla." },
      { sender: "mariana", body: "Jajaja cierto. ¿Y eres más de quedarte en casa o de salir?" },
      { sender: "daniel", body: "Me gusta salir a montar bici, pero un buen café tranquilo también me encanta." },
      { sender: "mariana", body: "¡Ay, el café es mi plan favorito! Hay una cafetería linda cerca de la Javeriana." },
      { sender: "daniel", body: "La conozco, queda buenísima. ¿Te animas a un café por esa zona un día de estos?" },
      { sender: "mariana", body: "Me encantaría, la verdad. Entre semana suelo estar más libre por la tarde." },
      { sender: "daniel", body: "Perfecto, ¿te sirve un jueves a media tarde? Sin afán, solo charlar un rato." },
      { sender: "mariana", body: "El jueves me queda muy bien. Me hace bien tener planes así, tranquilos." },
      { sender: "daniel", body: "A mí también. Llevo un tiempo tratando de conocer gente nueva sin presión." },
      { sender: "mariana", body: "Te entiendo full. Entonces quedamos, te escribo el jueves para confirmar la hora." },
      { sender: "daniel", body: "¡Listo! Gracias por la buena conversa, Mariana. Nos vemos pronto ☕" },
    ],
  },
  {
    a: "laura",
    b: "andres",
    messages: [
      { sender: "andres", body: "Hola Laura, ¿cómo vas? Vi que te gusta el cine; a mí me tiene enviciado jaja." },
      { sender: "laura", body: "¡Hola Andrés! Sí, soy muy de cine. ¿Qué fue lo último que viste?" },
      { sender: "andres", body: "Una de esas lentas pero bonitas, de las que te dejan pensando. ¿Tú?" },
      { sender: "laura", body: "Igual ando en modo cine de autor. En Medellín hay un ciclo buenísimo ahorita." },
      { sender: "andres", body: "Qué envidia sana, en Cali también hay algo parecido pero más chiquito." },
      { sender: "laura", body: "Deberías venir un fin de semana; Medellín tiene clima rico para caminar." },
      { sender: "andres", body: "Me tientas. Me encanta salir a caminar y de paso tomar fotos del camino." },
      { sender: "laura", body: "¡Yo igual con la fotografía! Aunque soy más de retratos que de paisajes." },
      { sender: "andres", body: "Combinamos entonces: tú los retratos y yo los paisajes jaja." },
      { sender: "laura", body: "Jajaja hecho. ¿Y normalmente sales solo o con parche?" },
      { sender: "andres", body: "Depende, pero últimamente trato de ampliar mi círculo y conocer gente." },
      { sender: "laura", body: "Te entiendo, yo también. Por eso me animé con esto, sin prisa." },
      { sender: "andres", body: "Me parece lo más sano. ¿Te gustaría que sigamos hablando y vemos qué surge?" },
      { sender: "laura", body: "Claro que sí, me caes muy bien. Cuéntame qué peli me recomiendas para arrancar." },
      { sender: "andres", body: "Te paso una lista mañana 😄 Gracias por la buena energía, Laura." },
    ],
  },
] as const;

export interface GroupMemberSeed {
  readonly key: PatientKey;
  readonly role: "member" | "moderator";
}

export interface GroupMessageSeed {
  readonly sender: PatientKey;
  readonly body: string;
}

export interface SupportGroupSeed {
  readonly title: string;
  readonly description: string;
  readonly maxMembers: number;
  readonly members: readonly GroupMemberSeed[];
  readonly messages: readonly GroupMessageSeed[];
}

export const SUPPORT_GROUP: SupportGroupSeed = {
  title: "Ansiedad social",
  description:
    "Un espacio tranquilo para acompañarnos, compartir actividades sencillas y conocer gente a nuestro ritmo.",
  maxMembers: 12,
  members: [
    { key: "daniel", role: "moderator" },
    { key: "mariana", role: "member" },
    { key: "laura", role: "member" },
    { key: "valentina", role: "member" },
    { key: "juliana", role: "member" },
  ],
  messages: [
    { sender: "daniel", body: "¡Hola a todas y todos! Bienvenidos al grupo Ansiedad social. Aquí vamos a nuestro ritmo, sin presión 🙂" },
    { sender: "daniel", body: "Para romper el hielo, ¿les parece si nos presentamos con el nombre y algo que nos guste hacer?" },
    { sender: "mariana", body: "¡Hola! Soy Mariana, de Bogotá. Me encanta leer y el café tranquilo." },
    { sender: "valentina", body: "Hola, Valentina por aquí. Me gusta bailar y descubrir música nueva." },
    { sender: "laura", body: "¡Hola a todos! Laura, de Medellín. Fan del cine y de la fotografía." },
    { sender: "juliana", body: "Hola, soy Juliana, desde Barranquilla. Me relaja muchísimo cocinar." },
    { sender: "daniel", body: "Qué bueno leerlos. Yo soy Daniel; me ayuda salir a montar bici cuando ando acelerado." },
    { sender: "valentina", body: "A mí a veces me cuesta el primer paso para hablar con gente, así que esto me sirve." },
    { sender: "mariana", body: "Totalmente, Vale. Yo pienso mucho antes de escribir, pero aquí me siento cómoda." },
    { sender: "laura", body: "Lo mismo. Está chévere que nadie nos apura." },
    { sender: "juliana", body: "¿Alguien ha probado proponerse un plan pequeñito a la semana? A mí me funciona." },
    { sender: "daniel", body: "Buenísima idea, Juliana. Un plan pequeño y sin meta gigante, solo salir un rato." },
    { sender: "mariana", body: "Yo esta semana quiero ir a una librería sin afán de comprar, solo a mirar." },
    { sender: "valentina", body: "¡Me sumo a algo así! Quizás caminar por un parque con música." },
    { sender: "laura", body: "Podríamos contarnos cómo nos fue la próxima semana, sin obligación." },
    { sender: "daniel", body: "Me parece. Y si alguien no pudo, también vale; aquí no se juzga." },
    { sender: "juliana", body: "Eso me tranquiliza. A veces el plan es solo descansar y ya está bien." },
    { sender: "mariana", body: "Gracias por decir eso, Juliana. Me lo llevo para los días difíciles." },
    { sender: "valentina", body: "Qué rico tener un espacio así. Gracias por animarse a escribir todos." },
    { sender: "daniel", body: "Gracias a ustedes. Seguimos por aquí, a nuestro ritmo. Un abrazo al grupo 🤍" },
  ],
};
