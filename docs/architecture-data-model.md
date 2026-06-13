# MindMatch - Modelo de datos canonico

Este documento define la seccion 3 canonica del modelo de datos de MindMatch para la Fase 0. El objetivo es dejar una base persistente reproducible para el demo, sin endpoints de producto, seed funcional ni pantallas de Fase 1.

## Principios

- Solo existen tres schemas funcionales: `social`, `clinical` y `analytics`.
- `social.clinics` es la raiz de tenancy.
- Toda tabla perteneciente a un tenant incluye `clinic_id`, excepto `social.clinics`.
- Las dependencias entre dominios solo pueden ir de `clinical` o `analytics` hacia `social`.
- `social` no tiene claves foraneas ni dependencias hacia `clinical`.
- El contenido de chat existe exclusivamente en `social.messages.body`.
- `clinical` y `analytics` nunca duplican cuerpos de mensajes, contrasenas, tokens, notas profesionales ni texto clinico libre.
- Las claves primarias son UUID, las fechas con hora usan `timestamptz` y las fechas naturales usan `date`.
- Los estados cerrados se modelan con enums PostgreSQL.

## Schema `social`

Contiene identidad, perfiles sociales seguros, discovery, conexiones, conversaciones, mensajes, reportes, grupos y misiones visibles para pacientes. No contiene diagnosticos, tratamientos, medicamentos, puntajes de riesgo ni notas clinicas.

Tablas:

- `social.clinics`: tenant raiz. `slug` es unico.
- `social.users`: identidades autenticables de doctores y pacientes. El email es unico por clinica con comparacion case-insensitive mediante indice de expresion.
- `social.refresh_tokens`: almacena solo hashes de refresh tokens.
- `social.invitations`: invitaciones creadas por doctora. Valida mayoria de edad y tipos permitidos de conexion.
- `social.patient_profiles`: perfil social del paciente, uno por usuario, con validacion de mayoria de edad.
- `social.patient_profiles.source_invitation_id`: relaciona de forma estable el perfil con la invitacion que autorizo sus tipos de conexion. Es nullable solo para compatibilidad con perfiles historicos o administrativos.
- `social.interests`: catalogo de intereses por clinica.
- `social.patient_interests`: relacion perfil-interes, con `weight` entre 1 y 5.
- `social.profile_embeddings`: embedding vigente por perfil y modelo. En Fase 0 usa `vector(1536)` sin llamadas externas; la dimension podra migrarse si el proveedor definitivo usa otra dimension.
- `social.match_scores`: compatibilidad social entre pares canonicos de pacientes, con `score` entre 0 y 1.
- `social.swipes`: decision `like` o `pass` de un paciente sobre otro.
- `social.connections`: estado social del match entre dos pacientes, con par canonico y tipo de conexion.
- `social.conversations`: conversaciones directas o grupales. Existe un indice unico parcial para una conversacion directa activa por conexion.
- `social.conversation_members`: miembros y moderadores de conversaciones.
- `social.messages`: contenido privado del chat. Incluye TODO tecnico para cifrado futuro del cuerpo.
- `social.message_reports`: reportes de participantes. Puede originar R6 posteriormente, pero no referencia `clinical.alerts`.
- `social.support_groups`: metadata de grupos de apoyo, sin informacion clinica individual.
- `social.wellness_missions`: actividades de bienestar visibles para pacientes, sin diagnostico ni tratamiento.

## Schema `clinical`

Contiene seguimiento profesional, pulso emocional, alertas, decisiones profesionales y notas privadas. Puede referenciar identidades o conexiones de `social`, siempre en direccion `clinical -> social`.

Tablas:

- `clinical.patient_clinical`: registro profesional separado del perfil social, uno por paciente y clinica.
- `clinical.check_in_preferences`: configuracion de check-in por paciente.
- `clinical.check_ins`: pulso emocional diario, con `mood` y `sleep` entre 1 y 5, una fila por paciente y fecha, e indice descendente por fecha.
- `clinical.risk_scores`: resultado de evaluacion deterministica. `inputs_json` guarda los insumos exactos y para R6 solo debe incluir identificador del reporte, nunca cuerpo de mensaje.
- `clinical.alerts`: alertas R1-R6 con `inputs_json` obligatorio, severidad y estado.
- `clinical.match_decisions`: decision profesional sobre una conexion social. No existe FK inversa desde `social.connections`.
- `clinical.professional_notes`: notas privadas de seguimiento, no relacionadas con mensajes individuales.

## Schema `analytics`

Contiene eventos y metricas operativas agregadas. No almacena cuerpos de mensajes, contrasenas, tokens, notas profesionales ni texto clinico libre. No usa claves foraneas hacia `clinical`.

Tablas:

- `analytics.events`: eventos de embudo y adopcion con `metadata_json` no sensible.
- `analytics.clinic_daily_metrics`: metricas diarias por clinica, una fila por fecha.
- `analytics.patient_daily_metrics`: metricas diarias por paciente, una fila por paciente y fecha, sin texto libre ni FK hacia `clinical`.

## Relaciones

- `social.users.clinic_id` referencia `social.clinics`.
- Todas las tablas de tenant referencian la clinica directa o indirectamente y exponen `clinic_id`.
- Las relaciones entre tablas de un mismo tenant usan FKs compuestas `clinic_id + id` cuando la pertenencia a clinica debe quedar protegida en base de datos.
- `social.patient_profiles.source_invitation_id` referencia `social.invitations.id`; el servicio valida que invitacion y perfil pertenezcan al mismo `clinic_id`.
- `clinical` referencia `social.users` y `social.connections`.
- `analytics` referencia `social.clinics` y, para actor/sujeto operacional, `social.users`.
- No existe ninguna FK de `social` hacia `clinical`.

## Privacidad

- Los mensajes permanecen en `social.messages`.
- Los endpoints futuros de doctora solo podran consumir metadata agregada del chat, no `messages.body`.
- `clinical.risk_scores.inputs_json` y `clinical.alerts.inputs_json` no deben contener cuerpos de mensajes. Para R6 se almacena identificador de `social.message_reports` y metadata minima.
- Las contrasenas y refresh tokens se almacenan solo como hashes.
- Los perfiles sociales, intereses, conexiones, conversaciones y scores de compatibilidad no deben incluir diagnosticos, tratamientos, medicamentos ni notas profesionales.

## Multi-tenancy

- `social.clinics` es el tenant raiz.
- Cada tabla de tenant incluye `clinic_id`.
- Las claves unicas compuestas incluyen `clinic_id` cuando la unicidad pertenece a una clinica.
- `source_invitation_id` es unico cuando existe: una invitacion solo puede originar un perfil.
- Los indices principales incluyen `clinic_id` para filtrar por tenant desde el primer dia.

## Limitaciones del demo

- No hay RLS de PostgreSQL en Fase 0.
- No hay grants separados por rol de aplicacion.
- No hay cifrado real de mensajes.
- No hay seed funcional ni endpoints de Fase 1.
- No se generan embeddings reales ni se llama a proveedores externos.
- Las metricas analytics son estructura persistente, no pipelines de agregacion.
- El flujo publico `POST /invitations/validate` forma parte de la aceptacion por invitacion y no habilita registro abierto.

## Pendientes de produccion

- RLS por tenant y rol.
- Grants de DB para separar dominios operativos.
- Cifrado de mensajes con administracion de llaves por tenant.
- Auditoria avanzada de accesos clinicos.
- Rotacion y endurecimiento de secretos.
- Estrategia de migracion de dimensiones de embeddings si cambia el proveedor.
- Familias de refresh tokens para deteccion avanzada de reutilizacion en produccion.
