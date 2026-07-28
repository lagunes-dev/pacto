# Pacto

Aplicación React, TypeScript y Vite en desarrollo. Incluye un límite de sesión, registro e inicio/cierre de sesión con fixture local de memoria exclusivamente para desarrollo, más contratos privados de hábitos y progreso.

## Requisitos

- Node.js y npm compatibles con las versiones declaradas en `package.json`.

## Desarrollo

```bash
npm ci
npm run dev
```

Vite mostrará en la terminal la URL local de desarrollo.

Copiá `.env.example` a `.env.local` para elegir el adaptador. `VITE_DATA_ADAPTER=fixture` funciona únicamente en desarrollo. Las variables públicas de Supabase definen un límite de configuración, pero NO existe todavía una integración Supabase activa o verificada.

## Verificación

```bash
npm test
npm run build
```

Las pruebas actuales se ejecutan con Vitest/jsdom e incluyen el flujo completo de rutas privadas, creación por teclado, anuncios accesibles, reintento y estados de servicio no disponible. No hay un navegador E2E configurado: `tests/e2e/private-habit-flow.spec.ts` queda pendiente hasta incorporar ese tooling, por lo que estas pruebas no constituyen evidencia visual ni de tecnologías de asistencia reales.

## Flujo disponible

- `/sign-in` y `/register`: autenticación de desarrollo.
- `/habits/new`: ruta protegida para crear, listar, editar y eliminar hábitos privados.
- `/progress`: ruta protegida para progreso personal basado solamente en datos persistidos por el adaptador activo.
- Sin sesión, las rutas privadas redirigen a `/sign-in`.

El modo fixture conserva usuarios y datos únicamente en memoria durante la ejecución. Recargar la aplicación elimina ese estado. Cuando el servicio configurado no está implementado o falla, la interfaz informa que no se guardaron cambios, conserva los valores seguros y permite reintentar donde corresponde.

La arquitectura y los límites de reemplazo de adaptadores se documentan en [`docs/first-vertical-slice.md`](docs/first-vertical-slice.md).

El build de producción se genera en `dist/`.

## Demo original

La demo estática anterior se conserva sin cambios en `reference/demo-original/`. Puede servirse desde esa carpeta mediante HTTP para consultar el diseño de referencia; no representa la implementación React actual.

## Alcance

Los repositorios de hábitos/progreso obtienen el dueño desde la sesión: sus contratos no aceptan `ownerId` ni notas privadas. El fixture no persiste al recargar y no prueba autenticación real. Partner linking, vistas compartidas, Realtime, push, cola offline, despliegue, persistencia real, RLS, Supabase y capacidades PWA siguen fuera del alcance y no están verificadas.
