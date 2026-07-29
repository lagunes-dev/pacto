# Pacto

Aplicación React, TypeScript y Vite en desarrollo. Incluye sesión, hábitos privados, progreso personal y un fixture local de dos personas para consentimiento, preferencias propias y solicitudes explícitas de apoyo.

## Requisitos

- Node.js y npm compatibles con las versiones declaradas en `package.json`.

## Desarrollo

```bash
npm ci
npm run dev
```

Vite mostrará en la terminal la URL local de desarrollo.

Copiá `.env.example` a `.env.local` para elegir el adaptador. `VITE_DATA_ADAPTER=fixture` funciona únicamente en desarrollo y debe seleccionarse de forma explícita. `VITE_DATA_ADAPTER=supabase` habilita el límite público de autenticación solamente cuando `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` están completas; una configuración incompleta falla cerrada y no usa fixtures como reemplazo.

Las variables `VITE_*` son visibles en el navegador. Usá únicamente URL y clave publicable; nunca agregues claves `service_role`, VAPID, credenciales de pruebas ni otros secretos. El adaptador Supabase integra Auth, datos privados, preferencias, vínculo y apoyo; la base de datos conserva la autoridad mediante RLS y RPCs restringidas.

## Verificación

```bash
npm test
npm run build
npm run test:sql
npm run test:rls
```

`test:sql` ejecuta validaciones estáticas siempre y, con `SUPABASE_TEST_DB_URL` y `psql`, reaplica migraciones y prueba RLS contra una base descartable. `test:rls` requiere URL, clave publicable y credenciales de tres usuarios descartables. Si faltan requisitos, ambos comandos informan `SKIPPED (BLOCKED)` y no presentan la cobertura en vivo como aprobada.

Las pruebas actuales se ejecutan con Vitest/jsdom e incluyen el flujo completo de rutas privadas, creación por teclado, anuncios accesibles, reintento y estados de servicio no disponible. No hay un navegador E2E configurado: `tests/e2e/private-habit-flow.spec.ts` queda pendiente hasta incorporar ese tooling, por lo que estas pruebas no constituyen evidencia visual ni de tecnologías de asistencia reales.

## Flujo disponible

- `/sign-in` y `/register`: autenticación de desarrollo.
- `/habits/new`: ruta protegida para crear, listar, editar y eliminar hábitos privados.
- `/progress`: ruta protegida para progreso personal basado solamente en datos persistidos por el adaptador activo.
- `/partnership`: invitación, aceptación o rechazo explícitos, cancelación, pausa y finalización del vínculo.
- `/partnership/preferences`: preferencias propias; nunca permite consultar las de otra persona.
- `/partnership/support`: solicitud, reconocimiento y cierre explícitos, disponible solamente mientras el vínculo está activo.
- Sin sesión, las rutas privadas redirigen a `/sign-in`.

El modo fixture conserva usuarios y datos únicamente en memoria durante la ejecución. Recargar la aplicación elimina ese estado. El límite Supabase permite registro, confirmación por correo, inicio/cierre y recuperación de sesión, y usa repositorios que dependen de RLS para aislar los datos privados. Las mutaciones de vínculo y apoyo pasan por RPCs con identidad derivada de la sesión. Cuando el servicio configurado falla, la interfaz informa que no se guardaron cambios, conserva los valores seguros y permite reintentar donde corresponde.

La arquitectura y los límites de reemplazo de adaptadores se documentan en [`docs/first-vertical-slice.md`](docs/first-vertical-slice.md). La preparación de Supabase Free, Cloudflare Pages, pruebas en vivo, migraciones y rollback seguro se describe en [`docs/supabase-deployment-security.md`](docs/supabase-deployment-security.md).

El build de producción se genera en `dist/`.

## Demo original

La demo estática anterior se conserva sin cambios en `reference/demo-original/`. Puede servirse desde esa carpeta mediante HTTP para consultar el diseño de referencia; no representa la implementación React actual.

## Alcance

Los contratos no aceptan notas privadas ni incluyen detalles de hábitos, resúmenes o campos arbitrarios en payloads de vínculo, preferencias o apoyo. No se envían alertas automáticas: no hay Realtime, Push, correo ni jobs. PWA/offline, navegador E2E y expansión de resúmenes compartidos siguen fuera del alcance. La existencia del harness no demuestra una ejecución hospedada: cada resultado debe registrar si las credenciales estuvieron disponibles y qué comandos se ejecutaron.
