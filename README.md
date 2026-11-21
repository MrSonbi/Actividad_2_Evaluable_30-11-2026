# LogiTrack Express

Aplicación web/móvil de **recepción e inspección de paquetes** para los operarios de almacén de LogiTrack Express.
El operario ve la cola de paquetes recibidos (primero los pendientes, ordenados por prioridad y hora de llegada),
los filtra por prioridad, los busca por código de seguimiento (`LTK-1042-ES`) y marca cada uno como
**inspeccionado** o **rechazado**, con los botones de la tarjeta o deslizando la fila.

Proyecto de la Actividad 2 de Desarrollo de Interfaces (UDIT, curso 2026-2027). Los datos son simulados
(`src/app/data/packages.mock.ts`): no hay backend.

## Stack

| Tecnología | Versión |
|---|---|
| Ionic (`@ionic/angular`) | 9.0.12 |
| Angular (standalone, sin NgModules, zoneless) | 22.2.6 |
| TypeScript (`strict` y `strictTemplates`) | 6.0.3 |
| RxJS | 7.8.2 |
| Ionicons | 8.1.0 |
| Vitest (tests unitarios, con jsdom) | 5.1.1 |
| Playwright (test e2e) | 1.65.1 |
| Node.js | 24.21.0 |

## Requisitos previos

- **Node.js 24 LTS** (probado con 24.21.0) y npm.
- Para el test e2e, los navegadores de Playwright (`npx playwright install`).

## Instalación y scripts

```bash
npm ci            # instala las versiones exactas de package-lock.json
```

| Script | Qué hace |
|---|---|
| `npm start` | Servidor de desarrollo de Angular (`ng serve`). Con Ionic CLI también vale `ionic serve`. |
| `npm run build` | Build de producción en `www/`. |
| `npm run lint` | ESLint (`--max-warnings 0`), comprobación de tipos de `e2e/` y Prettier en modo `--check`. |
| `npm run test:unit` | Tests unitarios con Vitest (`ng test --no-watch`). |
| `npm test` | **Ojo:** ejecuta `test:unit` **y además** `test:e2e` (Playwright), que necesita los navegadores instalados. |

## Estructura de carpetas

```text
src/
├── app/
│   ├── models/        Tipos e interfaces (WarehousePackage, PackageStatus, StatusChangeEvent…)
│   ├── services/      Estado con Signals: paquetes (PackageService), turno claro/oscuro (ThemeService), movimiento (MotionService)
│   ├── components/    Componentes presentacionales: package-card, shift-toggle y atmosphere (fondo WebGL)
│   ├── home/          Página principal: ViewModel que conecta servicios y componentes
│   ├── shared/        Textos, colores e iconos de cada estado y prioridad; criterios de orden
│   └── data/          Datos simulados (12 paquetes)
├── theme/             Tokens de color de los turnos de día y de noche
├── assets/            Favicon y recursos estáticos
├── environments/      Configuración por entorno
└── global.scss        Estilos globales: foco visible, tipografía, fondo y microinteracciones
e2e/                   Test end-to-end con Playwright
```

## Decisiones de arquitectura

- **MVVM.** `PackageService` es la fuente única de verdad: guarda los paquetes en un `signal` privado, los expone en solo
  lectura y los actualiza de forma inmutable (array y objeto nuevos). `HomePage` actúa como ViewModel: prepara con
  `computed` lo que la plantilla muestra (orden, filtros, recuentos) y es el único punto que escribe en el servicio. Las
  plantillas no contienen lógica de negocio.
- **Componentes presentacionales.** `PackageCardComponent` no inyecta servicios: recibe el paquete con
  `input.required<WarehousePackage>()` y comunica la intención del operario con `output<StatusChangeEvent>()`
  (`{ id, newStatus }`). Lo mismo con el selector de turno y la atmósfera.
- **Signals + RxJS en la búsqueda.** El texto del buscador es un signal que se convierte en observable
  (`toObservable`) y pasa por `debounceTime(300)`, `distinctUntilChanged()` y `switchMap()` hacia una búsqueda simulada;
  el resultado vuelve a ser un signal con `toSignal`, que gestiona la suscripción y la libera al destruir la página. No
  hay ningún `subscribe()` manual en el código de producción. La búsqueda solo devuelve ids, que se cruzan con los
  paquetes en vivo, así que un cambio de estado nunca queda oculto tras un resultado antiguo.
- **Tipado estricto.** Sin `any`; prioridades, estados y códigos de seguimiento son tipos literales.

## Accesibilidad

- Objetivo **WCAG 2.1 AA**. Correcciones aplicadas: zoom permitido, `lang="es"`, título descriptivo, un único `h1`,
  estructura de lista válida en el estado vacío, foco de teclado visible con contraste suficiente, nombre accesible en
  español para el buscador, objetivos táctiles de 44 px y un único anuncio del recuento por búsqueda (`role="status"`).
- **Lighthouse 13.5.0: 100 en Accesibilidad**, medido en navegación y en capturas del modo claro, modo oscuro, estado
  vacío y tras un cambio de estado (informes del 20 y 21 de noviembre de 2026, antes de los últimos retoques de la
  validación final).
- **Modo claro / oscuro** («turno de día / de noche»): sigue `prefers-color-scheme` hasta que el operario elige, y
  entonces recuerda su elección. Los dos modos se diseñaron con contraste AA.
- **Reduced motion:** con `prefers-reduced-motion: reduce` el fondo queda quieto, el cambio de modo es instantáneo y se
  desactivan las microinteracciones.
- **Pausa del fondo (WCAG 2.2.2):** el fondo animado se puede detener con el botón «Pausar fondo» / «Reanudar fondo»,
  y la elección se recuerda.

## Rama `ia/original`

La rama `ia/original` conserva el experimento de la Tarea 5: el código de búsqueda reactiva generado por una IA,
integrado **sin auditar**, junto con tests de comportamiento escritos para evaluarlo. Sirve como punto de comparación
con la versión revisada de `main` (`git diff ia/original main`), donde se corrigieron, entre otros, los datos
desactualizados tras un cambio de estado y la espera del debounce en el primer render.

## Créditos

- Inspiración visual: MotionSites, «Lumen Roof».
- Tipografía: [Instrument Sans](https://github.com/Instrument/instrument-sans), licencia SIL Open Font License 1.1
  (OFL-1.1), autoalojada mediante `@fontsource-variable/instrument-sans`.
- Iconos: [Ionicons](https://ionic.io/ionicons) (MIT).
