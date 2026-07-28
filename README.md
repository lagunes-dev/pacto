# Pacto

Aplicación React, TypeScript y Vite en desarrollo. El estado actual incluye la base visual y las rutas iniciales; todavía no implementa autenticación ni persistencia de hábitos.

## Requisitos

- Node.js y npm compatibles con las versiones declaradas en `package.json`.

## Desarrollo

```bash
npm ci
npm run dev
```

Vite mostrará en la terminal la URL local de desarrollo.

## Verificación

```bash
npm test
npm run build
```

El build de producción se genera en `dist/`.

## Demo original

La demo estática anterior se conserva sin cambios en `reference/demo-original/`. Puede servirse desde esa carpeta mediante HTTP para consultar el diseño de referencia; no representa la implementación React actual.

## Cambios principales

- Check-in con tres estados semánticos: cumplido, hubo evento y sin registrar.
- Captura contextual de detonantes sin contar calorías ni exigir fotografías.
- Intervención inmediata cuando el antojo llega a 4 o 5.
- Planes “si–entonces” y flujo de recuperación.
- Solicitudes de apoyo que especifican lo que la persona necesita.
- Sin porcentaje visible de la pareja ni promedio conjunto.
- Metas compartidas basadas en cooperación.
- Insights accionables y efectividad de alternativas.
- Permisos de privacidad y límites de comunicación configurables.
- Pausa del seguimiento compartido sin borrar historial personal.
- Onboarding de vinculación consensuada.
- Persistencia local para probar flujos.
- Manifest, service worker e iconos para instalación como PWA.
- Esquema Supabase con RLS en `supabase-schema.sql`.

## Alcance

La implementación React actual es una base visual. La autenticación, la persistencia de hábitos, el progreso, la integración con Supabase y las capacidades PWA todavía no están implementadas ni verificadas.
