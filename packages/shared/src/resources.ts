/**
 * Recursos de bienestar: lista estática, genérica y configurable. NO contiene
 * teléfonos ni instituciones inventadas ni URLs externas por defecto, ni
 * personalización clínica. Los campos `href`/`phone` quedan vacíos para que
 * cada despliegue los configure con fuentes verificadas.
 */
export interface ResourceItem {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly href?: string;
  readonly phone?: string;
}

export const RESOURCES: readonly ResourceItem[] = [
  {
    id: "support-network",
    title: "Habla con tu red de apoyo",
    description:
      "Escríbele a alguien de confianza —familia o amistades— y cuéntale cómo te sientes hoy.",
  },
  {
    id: "care-team",
    title: "Contacta a tu equipo de atención",
    description:
      "Si tienes acompañamiento profesional, agenda o retoma contacto con tu equipo de salud.",
  },
  {
    id: "emergency",
    title: "Busca ayuda de emergencia local",
    description:
      "Si sientes que estás en peligro inmediato, acude a los servicios de emergencia de tu zona.",
  },
  {
    id: "self-care",
    title: "Prácticas breves de autocuidado",
    description:
      "Una caminata corta, respirar con calma o tomar agua pueden ayudarte a bajar el ritmo.",
  },
  {
    id: "how-to-report",
    title: "Cómo reportar una conversación",
    description:
      "Si un mensaje te incomoda, usa la opción de reportar; tu doctora recibirá el aviso.",
  },
];
