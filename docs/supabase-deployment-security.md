# Despliegue y seguridad de Supabase

Este runbook cubre el límite actual: Auth pública, datos privados protegidos por RLS y mutaciones de vínculo/apoyo mediante RPCs. No habilita Realtime, Push, Edge Functions, PWA/offline, pruebas E2E de navegador ni nuevos datos compartidos.

## Límites de confianza

| Valor | Ubicación permitida | ¿Secreto? |
| --- | --- | --- |
| URL de Supabase | Cloudflare `VITE_SUPABASE_URL`, entorno local | No |
| Clave publicable/anon | Cloudflare `VITE_SUPABASE_PUBLISHABLE_KEY`, entorno local | No; sigue siendo pública |
| Contraseñas de usuarios de prueba | Gestor de secretos o entorno efímero de CI | Sí |
| URL de conexión PostgreSQL | Gestor de secretos o entorno efímero de CI | Sí |
| `service_role`, claves privadas, tokens de gestión | Solo backend/operación que realmente los requiera | Sí; PROHIBIDOS en esta aplicación |

Toda variable `VITE_*` queda incorporada al JavaScript del navegador. Nunca uses ese prefijo para contraseñas, `SUPABASE_TEST_DB_URL`, `service_role` u otros secretos. No agregues archivos `.env*` al repositorio; `.env.example` contiene solamente nombres y valores públicos vacíos.

## Preparar un proyecto Supabase Free

1. Crea un proyecto separado para desarrollo o validación. Selecciona una región cercana y guarda la contraseña de base en un gestor de secretos.
2. En Auth, habilita Email/Password. Conserva confirmación de correo para usuarios reales según la política del producto.
3. Para el harness, crea manualmente tres usuarios **descartables y confirmados**: User A, User B e intruder. Deben tener correos distintos y no compartir contraseñas.
4. Verifica que los tres perfiles se inicializaron. La migración de esquema instala el trigger correspondiente y también converge usuarios preexistentes.
5. Obtén la URL del proyecto y su clave publicable desde la configuración de API. No copies `service_role`.
6. Obtén una cadena PostgreSQL compatible con `psql` para la base descartable. Prefiere la conexión/pooler recomendado por el panel para tu red y cliente.

El plan Free puede pausar proyectos inactivos y sus cuotas cambian con el tiempo. Consulta el panel y la documentación vigente antes de asumir disponibilidad, retención o capacidad de producción.

## Aplicar y validar migraciones

Las migraciones se aplican en orden y son rerunnable:

```text
supabase/migrations/202607280001_authorization_schema.sql
supabase/migrations/202607280002_rls_policies.sql
supabase/migrations/202607280003_lifecycle_rpcs.sql
```

Antes de producción:

1. Toma un respaldo verificable según la política del entorno.
2. Prueba primero en un proyecto descartable con el mismo nivel de migraciones.
3. Expone `SUPABASE_TEST_DB_URL` solo al proceso actual y confirma que `psql` esté en `PATH`.
4. Ejecuta `npm ci`, `npm run test:sql` y `npm run test:rls`.
5. Revisa el resultado: un `SKIPPED (BLOCKED)` NO es evidencia aprobada.
6. Aplica los mismos archivos, en el mismo orden, al destino autorizado.
7. Repite las pruebas contra el destino de validación posterior al despliegue.

`npm run test:sql` aplica las tres migraciones dos veces antes de ejecutar las aserciones SQL. Esto verifica convergencia, forced RLS, grants y restricciones. La URL de conexión permite migrar y por eso nunca debe llegar al navegador.

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

## Configurar Cloudflare Pages

1. Conecta el repositorio y selecciona la rama autorizada.
2. Usa `npm run build` como comando y `dist` como directorio de salida.
3. Configura por entorno:
   - `VITE_DATA_ADAPTER=supabase`
   - `VITE_SUPABASE_URL=<URL pública>`
   - `VITE_SUPABASE_PUBLISHABLE_KEY=<clave publicable>`
4. No configures contraseñas de prueba, URL PostgreSQL ni `service_role` como variables `VITE_*`.
5. Ejecuta los gates antes del despliegue; Cloudflare construye el cliente, pero no aplica migraciones.
6. Después del despliegue, valida inicio de sesión y estados de error. Esto es un smoke check, no reemplaza el harness de autorización ni constituye E2E de navegador.

Una configuración incompleta o `VITE_DATA_ADAPTER=unavailable` selecciona el adaptador no disponible y falla cerrada. El fixture nunca es un fallback de producción.

## Rollback fail-closed

No desactives RLS, no restaures políticas permisivas y no borres datos para recuperar disponibilidad.

1. Cambia Cloudflare a `VITE_DATA_ADAPTER=unavailable` y despliega. Confirma que las escrituras informan indisponibilidad.
2. Ejecuta, con una conexión PostgreSQL autorizada:

   ```bash
   psql "$SUPABASE_TEST_DB_URL" -v ON_ERROR_STOP=1 \
     -f supabase/rollback/202607280003_fail_closed_authorization.sql
   ```

3. Verifica que `authenticated` ya no tenga grants de tablas ni ejecución de RPCs. Forced RLS, políticas, esquema y datos deben permanecer.
4. Investiga y corrige en un entorno descartable.
5. Para avanzar nuevamente, reaplica las tres migraciones en orden, ejecuta SQL y harness en vivo, y solo entonces restaura `VITE_DATA_ADAPTER=supabase`.

El rollback SQL es rerunnable y su unidad de reversión es el acceso del navegador. Un teardown destructivo pertenece únicamente a proyectos descartables y no forma parte de este runbook.

## Evidencia mínima por despliegue

Registra sin secretos:

- commit y destino;
- resultado exacto de `npm ci`, `npm test`, `npm run build` y `npm audit --omit=dev`;
- resultado estático y runtime de `npm run test:sql`;
- resultado de `npm run test:rls`, incluyendo `SKIPPED (BLOCKED)` si corresponde;
- migraciones aplicadas y reapply;
- smoke check y, si ocurrió, pasos de rollback.
