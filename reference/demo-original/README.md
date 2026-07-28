# Pacto · Demo conductual v2

Prototipo autónomo y responsive para seguimiento de hábitos en pareja, diseñado alrededor de autonomía, recuperación y apoyo explícito.

## Abrir la demo

- Apertura rápida: `index.html`.
- PWA completa: servir la carpeta mediante HTTP, por ejemplo `python -m http.server 8080`, y abrir `http://localhost:8080`.

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

La interfaz es funcional y guarda datos localmente. Las notificaciones, autenticación y sincronización entre dos dispositivos son simuladas. Para producción se debe conectar Supabase Auth, Realtime y las políticas RLS incluidas.
