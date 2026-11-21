export function texto(valor: string, etiqueta: string, maxBytes: number): string {
  const limpio = valor.trim();
  if (!limpio) throw new Error(etiqueta + ' es obligatorio.');
  if (new TextEncoder().encode(limpio).length > maxBytes) {
    throw new Error(etiqueta + ' admite hasta ' + maxBytes + ' bytes UTF-8.');
  }
  return limpio;
}

export function entero(valor: number, etiqueta: string, maximo: number): number {
  if (!Number.isSafeInteger(valor) || valor < 1 || valor > maximo) {
    throw new Error(etiqueta + ' debe ser un entero entre 1 y ' + maximo + '.');
  }
  return valor;
}

// Los maximos coinciden con los #[max_len] de programa/src/lib.rs.
export const almacenValido = (valor: string) => texto(valor, 'El nombre del almacén', 30);
export const nombreValido = (valor: string) => texto(valor, 'El nombre del artículo', 30);
export const unidadValida = (valor: string) => texto(valor, 'La unidad', 10);
export const folioValido = (valor: string) => texto(valor, 'El folio', 8);
export const motivoValido = (valor: string) => texto(valor, 'El motivo', 50);
export const idValido = (valor: number) => entero(valor, 'El identificador', 65_535);
export const cantidadValida = (valor: number) => entero(valor, 'La cantidad', 4_294_967_295);
