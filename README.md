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

Las variables `VITE_*` son visibles en el navegador. Usá únicamente URL, clave publicable y `VITE_VAPID_PUBLIC_KEY`; nunca agregues `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, claves `service_role`, credenciales de pruebas ni otros secretos. El adaptador Supabase integra Auth, datos privados, preferencias, vínculo y apoyo; la base de datos conserva la autoridad mediante RLS y RPCs restringidas.

Las notificaciones de apoyo se habilitan únicamente mediante una acción explícita en `/partnership/support`: no se solicita permiso al iniciar sesión ni al abrir la aplicación. Realtime solo invalida cachés autorizadas; no convierte payloads de eventos en estado de interfaz ni prueba autorización o entrega. La migración hospedada, los secretos VAPID, el despliegue de la función y la matriz de validación están en el [runbook de Supabase](docs/supabase-deployment-security.md).

## Verificación

```bash
npm test
npm run typecheck
npm run build
npm run validate:pwa
npm run test:e2e
npm run test:sql
npm run test:rls
```

`test:sql` ejecuta validaciones estáticas, incluida la seguridad documental de VAPID, y, con `SUPABASE_TEST_DB_URL` y `psql`, reaplica migraciones y prueba RLS contra una base descartable. `test:rls` requiere URL, clave publicable y credenciales de tres usuarios descartables. Si faltan requisitos, ambos comandos informan `SKIPPED (BLOCKED)` y no presentan la cobertura en vivo como aprobada. Ningún gate local demuestra Realtime hospedado, permiso de navegador, aceptación del proveedor, visualización en dispositivo ni entrega real.

Las pruebas Vitest/jsdom cubren rutas privadas, creación por teclado, anuncios accesibles, reintento y estados de servicio no disponible. Playwright ejecuta Chromium de escritorio y compacto contra un build fixture explícito servido con `vite preview`; valida rutas, privacidad, enlaces directos, controles, overflow y artefactos PWA. Esa evidencia local no demuestra Safari, iPhone físico, Cloudflare Pages, tecnologías de asistencia reales ni una ejecución de GitHub Actions.

La configuración, el smoke HTTPS, la decisión observada sobre fallback SPA, la matriz de evidencia y el inventario de auditoría revisado están en [`docs/browser-deployment.md`](docs/browser-deployment.md). Cada resultado usa una clase independiente (`local`, `ci-browser`, `hosted-https`, `physical-iphone`, `provider-acceptance` o `device-display`) y un estado exacto: `PASS`, `FAIL` o `SKIPPED (BLOCKED)`.

## Flujo disponible

- `/sign-in` y `/register`: autenticación de desarrollo.
- `/habits/new`: ruta protegida para crear, listar, editar y eliminar hábitos privados.
- `/progress`: ruta protegida para progreso personal basado solamente en datos persistidos por el adaptador activo.
- `/partnership`: invitación, aceptación o rechazo explícitos, cancelación, pausa y finalización del vínculo.
- `/partnership/preferences`: preferencias propias; nunca permite consultar las de otra persona.
- `/partnership/support`: solicitud, reconocimiento y cierre explícitos, disponible solamente mientras el vínculo está activo.
- Sin sesión, las rutas privadas redirigen a `/sign-in`.

El modo fixture conserva usuarios y datos únicamente en memoria durante la ejecución. Recargar la aplicación elimina ese estado. El límite Supabase permite registro, confirmación por correo, inicio/cierre y recuperación de sesión, y usa repositorios que dependen de RLS para aislar los datos privados. Las mutaciones de vínculo y apoyo pasan por RPCs con identidad derivada de la sesión. Realtime mantiene frescas las vistas autorizadas y el Web Push opcional usa un payload fijo de solicitud de apoyo sin detalles privados. Cuando el servicio configurado falla, la interfaz informa que no se guardaron cambios, conserva los valores seguros y permite reintentar donde corresponde.

La arquitectura y los límites de reemplazo de adaptadores se documentan en [`docs/first-vertical-slice.md`](docs/first-vertical-slice.md). La preparación de Supabase Free, pruebas en vivo, migraciones y rollback seguro se describe en [`docs/supabase-deployment-security.md`](docs/supabase-deployment-security.md); el despliegue del cliente en Cloudflare Pages se detalla en [`docs/browser-deployment.md`](docs/browser-deployment.md).

El build de producción se genera en `dist/`.

## Demo original

La demo estática anterior se conserva sin cambios en `reference/demo-original/`. Puede servirse desde esa carpeta mediante HTTP para consultar el diseño de referencia; no representa la implementación React actual.

## Alcance

Los contratos no aceptan notas privadas ni incluyen comida, hábitos, notas privadas, vigilancia, resúmenes o campos arbitrarios en payloads de vínculo, preferencias o apoyo. No se envían alertas automáticas: Realtime solo refresca datos y Push ocurre tras una solicitud explícita; no hay correo, servicios push pagos, jobs ni notificaciones al iniciar sesión o abrir la app. La expansión de resúmenes compartidos sigue fuera del alcance. La existencia del harness E2E no demuestra una ejecución hospedada: cada resultado debe registrar comandos ejecutados, evidencia saneada y bloqueos sin exponer credenciales.
