# LogiTrack Express — reglas del proyecto

## Stack (fijo)

- Ionic 9.0.12, Angular 22.2.6 standalone (sin NgModules), zoneless.
- TypeScript 6.0.3 con `strict` y `strictTemplates`; rxjs 7.8; Vitest para tests unitarios; Node 24.21.0.
- Prohibido cambiar versiones o añadir dependencias (`npm install`, `npm update`…) sin autorización expresa.
- Navegadores: sin `.browserslistrc`; se usa la política por defecto de Angular 22 (Baseline "widely available" 2026-05-07). No volver a crearlo sin autorización.

## Git

- PROHIBIDO `git commit`, `git push`, `git add`, `git rebase`, `git reset` o cualquier comando que modifique el índice o el historial.
- Solo comandos de lectura: `git status`, `git diff`, `git log`. Los commits los hace el usuario.

## Verificación

- `npm run build`, `npm run lint`, `npm run test:unit`.
- No usar `npm test` (incluye e2e con Playwright). No lanzar `ionic serve` (lo hace el usuario).

## Arquitectura

- `models/`: tipos e interfaces.
- `services/`: estado con Signals y actualizaciones inmutables (nunca mutar arrays u objetos del estado).
- `components/`: presentacionales; no inyectan servicios; se comunican solo con `input()` / `output()`.
- Páginas: actúan como ViewModel (conectan servicios y componentes).
- Sin lógica de negocio en las plantillas. Prohibido `any`.

## Convenciones

- Identificadores en inglés; textos de la interfaz en español.
- Los nombres de archivo exigidos por el enunciado son obligatorios (`package.model.ts`, `package.service.ts`…).
- Los generadores de Angular 20+ omiten el sufijo `.service` / `.component`: verificar o fijar los nombres a mano tras generar.

## Calidad

- Inspeccionar antes de modificar.
- No desactivar reglas de lint ni de TypeScript (ni `eslint-disable`, ni `@ts-ignore`, ni relajar `tsconfig`) para que algo pase.
- Informar siempre de cualquier prueba o verificación no ejecutada.
