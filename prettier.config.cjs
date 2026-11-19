// @ts-check
// Hereda todas las reglas de @ionic/prettier-config y solo añade el parser de Angular para las plantillas
// (necesario para sangrar correctamente @for / @if / @empty).
const ionic = require('@ionic/prettier-config');

/** @type {import('prettier').Config} */
module.exports = {
  ...ionic,
  overrides: [...(ionic.overrides ?? []), { files: '*.html', options: { parser: 'angular' } }],
};
