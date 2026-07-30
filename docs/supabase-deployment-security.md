# Despliegue y seguridad de Supabase

Este runbook cubre Auth pública, datos privados protegidos por RLS, mutaciones mediante RPCs, Realtime como invalidación de caché y Web Push explícito para solicitudes de apoyo. Realtime no es autorización y la aceptación del proveedor no demuestra visualización ni entrega en un dispositivo.

## Límites de confianza

| Valor | Ubicación permitida | ¿Secreto? |
| --- | --- | --- |
| URL de Supabase | Cloudflare `VITE_SUPABASE_URL`, entorno local | No |
| Clave publicable/anon | Cloudflare `VITE_SUPABASE_PUBLISHABLE_KEY`, entorno local | No; sigue siendo pública |
| Clave pública VAPID | Cloudflare `VITE_VAPID_PUBLIC_KEY`, entorno local | No; sigue siendo pública |
| `VAPID_SUBJECT`, `VAPID_PRIVATE_KEY` | Supabase Edge Function secrets | Sí |
| Contraseñas de usuarios de prueba | Gestor de secretos o entorno efímero de CI | Sí |
| URL de conexión PostgreSQL | Gestor de secretos o entorno efímero de CI | Sí |
| `service_role`, claves privadas, tokens de gestión | Solo backend/operación que realmente los requiera | Sí; PROHIBIDOS en esta aplicación |

Toda variable `VITE_*` queda incorporada al JavaScript del navegador. Nunca uses ese prefijo para `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, contraseñas, `SUPABASE_TEST_DB_URL`, `service_role` u otros secretos. No agregues archivos `.env*` al repositorio; `.env.example` contiene solamente nombres y valores públicos vacíos. No copies secretos, JWTs, endpoints ni claves de suscripción a logs, tickets o evidencia.

## Preparar un proyecto Supabase Free

1. Crea un proyecto separado para desarrollo o validación. Selecciona una región cercana y guarda la contraseña de base en un gestor de secretos.
2. En Auth, habilita Email/Password. Conserva confirmación de correo para usuarios reales según la política del producto.
3. Para el harness, crea manualmente tres usuarios **descartables y confirmados**: User A, User B e intruder. Deben tener correos distintos y no compartir contraseñas.
4. Verifica que los tres perfiles se inicializaron. La migración de esquema instala el trigger correspondiente y también converge usuarios preexistentes.
5. Obtén la URL del proyecto y su clave publicable desde la configuración de API. No copies `service_role`.
6. Obtén una cadena PostgreSQL compatible con `psql` para la base descartable. Prefiere la conexión/pooler recomendado por el panel para tu red y cliente.

El plan Free puede pausar proyectos inactivos y sus cuotas cambian con el tiempo. Consulta el panel y la documentación vigente antes de asumir disponibilidad, retención o capacidad de producción.

## Aplicar y validar migraciones

Las migraciones se aplican en este orden completo y son rerunnable:

```text
supabase/migrations/202607280001_authorization_schema.sql
supabase/migrations/202607280002_rls_policies.sql
supabase/migrations/202607280003_lifecycle_rpcs.sql
supabase/migrations/202607290001_support_rpc_response_compatibility.sql
supabase/migrations/202607290002_support_rpc_full_response.sql
supabase/migrations/202607290003_lifecycle_rpc_contracts.sql
supabase/migrations/202607290004_profile_bootstrap_lifecycle.sql
supabase/migrations/202607290005_qualify_support_returning.sql
supabase/migrations/202607300001_realtime_push.sql
```

Antes de producción:

1. Toma un respaldo verificable según la política del entorno.
2. Prueba primero en un proyecto descartable con el mismo nivel de migraciones.
3. Expone `SUPABASE_TEST_DB_URL` solo al proceso actual y confirma que `psql` esté en `PATH`.
4. Ejecuta `npm ci`, `npm run test:sql` y `npm run test:rls`. Para los gates locales completos, ejecuta también `npm test`, `npm run build` y `npm audit --omit=dev`.
5. Revisa el resultado: un `SKIPPED (BLOCKED)` NO es evidencia aprobada.
6. Aplica los mismos archivos, en el mismo orden, al destino autorizado.
7. Repite las pruebas contra el destino de validación posterior al despliegue.

`npm run test:sql` aplica las nueve migraciones dos veces, desde `202607280001` hasta `202607300001`, antes de ejecutar `supabase/tests/authorization_rls.sql`, `supabase/tests/lifecycle_rpcs.sql` y `supabase/tests/realtime_push_rls.sql`. Esto verifica convergencia, forced RLS, grants, publicación, señal de revocación y aislamiento de suscripciones. La URL de conexión permite migrar y por eso nunca debe llegar al navegador.

### Despliegue hospedado con Supabase CLI

Ejecuta estos comandos desde la raíz del repositorio con una cuenta y un proyecto de validación autorizados. Confirma el identificador del proyecto antes de responder cualquier prompt. No uses `--include-seed` ni `--include-all` sin revisar por qué serían necesarios.

```bash
npx supabase login
npx supabase link --project-ref "$SUPABASE_PROJECT_REF"
npx supabase migration list
npx supabase db push --dry-run
npx supabase db push
npx supabase migration list
```

El `--dry-run` debe listar solamente migraciones esperadas y la lista final debe mostrar `202607300001` tanto local como remota. Guarda la salida saneada, sin URL de conexión ni tokens. Si la historia remota diverge, detente: no repares historia ni fuerces migraciones durante un despliegue ordinario.

## Configurar VAPID y desplegar la función

Genera el par VAPID fuera del repositorio y conserva el privado en el gestor de secretos. La clave pública debe ser la misma en `VITE_VAPID_PUBLIC_KEY` y `VAPID_PUBLIC_KEY`; `VAPID_SUBJECT` debe ser un contacto válido, por ejemplo `mailto:operations@example.com`. Crea temporalmente `.env.vapid.local`, que está ignorado por Git:

```dotenv
VAPID_SUBJECT=mailto:operations@example.com
VAPID_PUBLIC_KEY=<public-key>
VAPID_PRIVATE_KEY=<private-key>
```

Carga el archivo directamente y elimínalo en cuanto Supabase confirme los nombres. No pegues valores en comandos, logs o capturas:

```bash
npx supabase secrets set --env-file .env.vapid.local --project-ref "$SUPABASE_PROJECT_REF"
npx supabase secrets list --project-ref "$SUPABASE_PROJECT_REF"
rm .env.vapid.local
npx supabase functions deploy send-support-push --project-ref "$SUPABASE_PROJECT_REF"
npx supabase functions list --project-ref "$SUPABASE_PROJECT_REF"
```

Despliega sin `--no-verify-jwt`: la función requiere verificación JWT y además valida al usuario, la solicitud pendiente y el vínculo activo. `secrets list` se usa solo para confirmar nombres, nunca valores. Configura `VITE_VAPID_PUBLIC_KEY` en el cliente hospedado y vuelve a desplegarlo sobre HTTPS después de migración, secretos y función.

### Smoke de función hospedada

Con User A y User B vinculados activamente, User B debe habilitar Push explícitamente y User A debe crear una solicitud pendiente. Conserva JWT e ID solamente en variables efímeras:

```bash
curl --fail-with-body \
  -H "Authorization: Bearer $SUPABASE_TEST_USER_A_JWT" \
  -H "Content-Type: application/json" \
  --data "{\"support_request_id\":\"$SUPPORT_REQUEST_ID\"}" \
  "$SUPABASE_URL/functions/v1/send-support-push"
```

Registra por separado: respuesta autorizada, intento rechazado con intruder, aceptación o rechazo del proveedor y visualización real. Una respuesta exitosa o `provider acceptance` NO prueba `device display` ni entrega. Sanea JWT, ID de solicitud, endpoint y material de suscripción de toda evidencia.

## Harness de autorización en vivo

Define estas variables en una terminal efímera o almacén de secretos de CI:

```text
SUPABASE_TEST_URL
SUPABASE_TEST_PUBLISHABLE_KEY
SUPABASE_TEST_USER_A_EMAIL
SUPABASE_TEST_USER_A_PASSWORD
SUPABASE_TEST_USER_B_EMAIL
SUPABASE_TEST_USER_B_PASSWORD
SUPABASE_TEST_INTRUDER_EMAIL
SUPABASE_TEST_INTRUDER_PASSWORD
```

Luego ejecuta:

```bash
npm run test:rls
```

El harness usa exclusivamente la clave publicable y sesiones reales de los tres usuarios. Valida:

- creación/listado de datos propios a través del adaptador y bloqueo de User B/intruder;
- aislamiento de notas privadas mediante consultas directas autenticadas;
- invitación, aceptación y estado activo mediante los RPCs usados por el adaptador;
- lectura y transiciones de apoyo para los dos miembros, con intruder excluido;
- rechazo de mutación directa de vínculo;
- revocación inmediata al pausar y permanente al finalizar.

Las cuentas deben ser descartables. El harness elimina el hábito y la nota que crea, pero conserva el vínculo finalizado como evidencia del ciclo irreversible. Usa cuentas nuevas o restablece el proyecto para una campaña totalmente limpia.

## Smoke hospedado de Realtime/RLS

Prerequisitos: migración `202607300001` aplicada, dos usuarios descartables con vínculo activo, intruder separado, cliente HTTPS desplegado y DevTools disponibles.

1. Ejecuta `npm run test:sql` con `SUPABASE_TEST_DB_URL` del proyecto descartable. Debe completar las pruebas runtime, no `SKIPPED (BLOCKED)`.
2. Inicia User A y User B en perfiles de navegador separados. Abre Network → WS y confirma un único canal por actor/vínculo.
3. User A cambia una preferencia propia. En User B confirma el evento filtrado y un refetch de la consulta permitida; no copies el payload ni lo trates como fuente de datos.
4. User A crea una solicitud de apoyo. En User B confirma invalidación/refetch de apoyo y ausencia de detalles sensibles en notificaciones.
5. Con intruder, intenta leer `partnership_realtime_state` y `push_subscriptions` de otro usuario. Confirma cero filas o rechazo según la operación; nunca uses `service_role` para este smoke.
6. Pausa el vínculo. Confirma que `partnership_realtime_state` emite estado inactivo al destinatario, el canal se elimina y las cachés compartidas/de apoyo dejan de estar disponibles.
7. Recarga y confirma que un vínculo inactivo no crea otro canal. Reanuda solo mediante el flujo autorizado si el escenario de prueba lo permite.

Registra conteo de canales, consultas invalidadas y resultados RLS sin guardar payloads, endpoints o claves. Si faltan proyecto, credenciales, publicación o navegador, registra `SKIPPED (BLOCKED)` y enumera exactamente el prerrequisito ausente.

## Matriz de activación, navegador y dispositivo

Cada fila requiere HTTPS, usuario receptor con vínculo activo y acción manual **Habilitar notificaciones**. El permiso no debe aparecer al iniciar sesión ni al abrir la app. Usa `PASS`, `FAIL` o `SKIPPED (BLOCKED)`; nunca infieras una fila desde otra.

| Entorno | Activación explícita y persistencia | Realtime/cleanup | Provider acceptance | Device display | Evidencia requerida |
| --- | --- | --- | --- | --- | --- |
| Chrome/Edge de escritorio | Pendiente | Pendiente | Pendiente | Pendiente | versión, SO, permiso, respuesta saneada y captura de copy fijo |
| Chrome en Android físico | Pendiente | Pendiente | Pendiente | Pendiente | dispositivo/OS, app en background/cerrada y resultado visible |
| Safari en iPhone/iPad físico, PWA instalada | Pendiente | Pendiente | Pendiente | Pendiente | versión iOS/iPadOS, instalación Home Screen y resultado visible |
| Navegador que responde `denied` | Pendiente | N/A | N/A | N/A | no hay suscripción, persistencia ni dispatch |
| Navegador sin Push API | Pendiente | N/A | N/A | N/A | estado `unsupported`, sin prompt ni escritura |
| Revocación explícita | Pendiente | N/A | N/A | N/A | revocación servidor-first y suscripción local desuscrita |

Para cada navegador compatible:

1. Confirma estado inicial sin prompt y sin fila de suscripción.
2. Selecciona Habilitar; registra permiso y una única fila owner-scoped sin exponer endpoint/keys.
3. Repite Habilitar y confirma upsert idempotente, no una segunda fila.
4. Desde el otro miembro crea una solicitud explícita y ejecuta el dispatch autorizado.
5. Registra `provider acceptance` separado de `device display`; verifica únicamente el copy fijo y privado en el dispositivo.
6. Selecciona Deshabilitar y confirma revocación servidor-first; una falla del servidor debe conservar la suscripción local para reintento seguro.
7. Repite con login, reload y apertura pasiva: ninguno puede solicitar permiso ni activar Push.

Sin acceso real a cada entorno, sus credenciales y un proveedor alcanzable, deja su fila como `SKIPPED (BLOCKED)`. Simulación jsdom, unit tests, build o aceptación HTTP no sustituyen evidencia de navegador/dispositivo.

## Configurar Cloudflare Pages

1. Conecta el repositorio y selecciona la rama autorizada.
2. Usa `npm run build` como comando y `dist` como directorio de salida.
3. Configura por entorno:
   - `VITE_DATA_ADAPTER=supabase`
   - `VITE_SUPABASE_URL=<URL pública>`
   - `VITE_SUPABASE_PUBLISHABLE_KEY=<clave publicable>`
   - `VITE_VAPID_PUBLIC_KEY=<clave pública VAPID>`
4. No configures `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, contraseñas de prueba, URL PostgreSQL ni `service_role` como variables `VITE_*`.
5. Ejecuta los gates antes del despliegue; Cloudflare construye el cliente, pero no aplica migraciones.
6. Después del despliegue, valida inicio de sesión y estados de error. Esto es un smoke check, no reemplaza el harness de autorización ni constituye E2E de navegador.

Una configuración incompleta o `VITE_DATA_ADAPTER=unavailable` selecciona el adaptador no disponible y falla cerrada. El fixture nunca es un fallback de producción.

## Rollback fail-closed

No desactives RLS, no restaures políticas permisivas y no borres datos para recuperar disponibilidad.

Para retirar solamente Realtime/Push:

1. Despliega primero una versión anterior del cliente que no suscriba canales ni invoque Push.
2. Elimina la función hospedada y los secretos únicamente después de confirmar que ningún cliente activo la invoca:

   ```bash
   npx supabase functions delete send-support-push --project-ref "$SUPABASE_PROJECT_REF"
   npx supabase secrets unset VAPID_SUBJECT VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY --project-ref "$SUPABASE_PROJECT_REF"
   ```

3. Conserva `push_subscriptions`, `partnership_realtime_state`, sus RLS y datos durante la investigación. No reviertas la migración destructivamente en producción.
4. Si debes detener nuevas suscripciones antes del despliegue del cliente, revoca temporalmente grants de escritura de `authenticated` en `push_subscriptions` mediante una migración revisada. No desactives RLS.
5. Elimina suscripciones de prueba desde sus cuentas propietarias y cierra/finaliza vínculos de prueba mediante RPCs autorizadas. Elimina usuarios/proyecto descartable desde la consola solo cuando ya no se necesite evidencia.

Para un cierre total de acceso del navegador:

1. Cambia Cloudflare a `VITE_DATA_ADAPTER=unavailable` y despliega. Confirma que las escrituras informan indisponibilidad.
2. Ejecuta, con una conexión PostgreSQL autorizada:

   ```bash
   psql "$SUPABASE_TEST_DB_URL" -v ON_ERROR_STOP=1 \
     -f supabase/rollback/202607280003_fail_closed_authorization.sql
   ```

3. Verifica que `authenticated` ya no tenga grants de tablas ni ejecución de RPCs. Forced RLS, políticas, esquema y datos deben permanecer.
4. Investiga y corrige en un entorno descartable.
5. Para avanzar nuevamente, reaplica las nueve migraciones en orden, configura secretos/función, ejecuta SQL, smoke Realtime/RLS y matriz de navegador en vivo, y solo entonces restaura `VITE_DATA_ADAPTER=supabase`.

El rollback SQL es rerunnable y su unidad de reversión es el acceso del navegador. Un teardown destructivo pertenece únicamente a proyectos descartables y no forma parte de este runbook.

## Evidencia mínima por despliegue

Registra sin secretos:

- commit y destino;
- resultado exacto de `npm ci`, `npm test`, `npm run build` y `npm audit --omit=dev`;
- resultado estático y runtime de `npm run test:sql`;
- resultado de `npm run test:rls`, incluyendo `SKIPPED (BLOCKED)` si corresponde;
- migraciones aplicadas y reapply;
- resultado del smoke Realtime/RLS o `SKIPPED (BLOCKED)` con prerrequisitos ausentes;
- función desplegada, nombres de secretos presentes y respuesta saneada, nunca valores;
- matriz por navegador/dispositivo que separe activación, `provider acceptance` y `device display`;
- smoke check, limpieza y, si ocurrió, pasos de rollback.

La evidencia debe declarar explícitamente que no se observaron mecanismos excluidos: alertas automáticas, email, servicio push pago, jobs, prompts o notificaciones en login/app-open, ni payloads de comida, hábitos, notas privadas o vigilancia. Si una comprobación no pudo ejecutarse, su único estado válido es `SKIPPED (BLOCKED)`.
