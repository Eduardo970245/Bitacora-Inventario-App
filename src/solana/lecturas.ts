import type { Address } from "@solana/kit";

import {
  fetchAllArticulo,
  fetchAllMovimiento,
  fetchMaybeAlmacen,
  TipoMovimiento,
} from "../../clients/js/src/generated";
import { rpc } from "./conexion";
import { pdaAlmacen } from "./pdas";

/*
LECTURAS

Leer no necesita wallet ni firma: solo el rpc. fetchX devuelve
{ address, data, lamports... } y los campos de la cuenta estan dentro de .data.
*/

export type MovimientoUI = {
  direccion: Address;
  folio: string;
  tipo: 'entrada' | 'salida';
  motivo: string;
  cantidad: number;
  fecha: Date;
};

export type ArticuloUI = {
  direccion: Address;
  idArticulo: number;
  nombre: string;
  unidad: string;
  stock: number;
  movimientos: MovimientoUI[];
};

export type AlmacenUI = {
  direccion: Address;
  nombreAlmacen: string;
  idCounter: number;
  articulos: ArticuloUI[];
};

/*
Tres niveles de cuentas, tres niveles de lectura: el almacen guarda las
direcciones de sus articulos, y cada articulo las de sus movimientos.

fetchMaybe... no lanza si la cuenta no existe: devuelve exists: false. Es lo
que quieres cuando el usuario todavia no ha creado su almacen.
*/
export async function leerAlmacen(
  nombreAlmacen: string,
  owner: Address
): Promise<AlmacenUI | null> {
  const direccion = pdaAlmacen(nombreAlmacen, owner);
  const cuenta = await fetchMaybeAlmacen(rpc, direccion);

  if (!cuenta.exists) return null;

  const articulos = await fetchAllArticulo(rpc, cuenta.data.articulos);

  const conMovimientos = await Promise.all(
    articulos.map(async (a) => {
      const movimientos = await fetchAllMovimiento(rpc, a.data.movimientos);
      return {
        direccion: a.address,
        idArticulo: a.data.idArticulo,
        nombre: a.data.nombre,
        unidad: a.data.unidad,
        stock: a.data.stock,
        movimientos: movimientos.map((m) => ({
          direccion: m.address,
          folio: m.data.folio,
          tipo: m.data.tipo === TipoMovimiento.Entrada ? ('entrada' as const) : ('salida' as const),
          motivo: m.data.motivo,
          cantidad: m.data.cantidad,
          fecha: new Date(Number(m.data.fecha) * 1000), // el programa guarda segundos
        })),
      };
    })
  );

  return {
    direccion,
    nombreAlmacen: cuenta.data.nombreAlmacen,
    idCounter: cuenta.data.idCounter,
    articulos: conMovimientos,
  };
}

/*
El id del articulo nuevo sale del contador del almacen.

El programa es quien lo asigna; esta lectura no se lo manda. Hace falta porque
el id entra en las semillas, y una transaccion de Solana declara por adelantado
todas las cuentas que va a tocar: hay que saber la direccion ANTES de firmar.
*/
export async function siguienteId(
  nombreAlmacen: string,
  owner: Address
): Promise<number> {
  const cuenta = await fetchMaybeAlmacen(rpc, pdaAlmacen(nombreAlmacen, owner));
  if (!cuenta.exists) throw new Error("Ese almacén no existe todavía.");
  if (cuenta.data.articulos.length >= 10) throw new Error("El almacén alcanzó los 10 artículos previstos.");
  if (cuenta.data.idCounter >= 65_535) throw new Error("Se agotaron los identificadores u16 del almacén.");
  return cuenta.data.idCounter + 1;
}
