export function csvCell(value: unknown) {
  let cell = String(value ?? '');
  if (/^[\s]*[=+@\-]/.test(cell)) cell = "'" + cell;
  return '"' + cell.replaceAll('"', '""') + '"';
}
