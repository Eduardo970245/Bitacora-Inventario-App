import { address, type Address } from "@solana/kit";
import { PublicKey } from "@solana/web3.js";

import { BITACORA_INVENTARIO_PROGRAM_ADDRESS } from "../../clients/js/src/generated";
import { s } from "./seeds";

/*
DERIVACION DE PDAs

El Program ID sale del cliente generado, que a su vez lo saco de TU idl.json.
No hay ninguna direccion escrita a mano en el proyecto.

findProgramAddressSync devuelve un PublicKey (web3.js) y el cliente de Codama
espera un Address (@solana/kit). derivar() hace esa conversion en un solo lugar.
*/
const PROGRAM_ID = new PublicKey(BITACORA_INVENTARIO_PROGRAM_ADDRESS);

function derivar(semillas: Buffer[]): Address {
  const [pda] = PublicKey.findProgramAddressSync(semillas, PROGRAM_ID);
  return address(pda.toBase58());
}

// Rust: seeds = [b"almacen", nombre_almacen.as_bytes(), owner.key().as_ref()]
export function pdaAlmacen(nombreAlmacen: string, owner: Address) {
  return derivar([s.texto("almacen"), s.texto(nombreAlmacen), s.cuenta(owner)]);
}

// Rust: seeds = [b"articulo", almacen.key().as_ref(), id_articulo.to_le_bytes()]
export function pdaArticulo(almacen: Address, idArticulo: number) {
  return derivar([s.texto("articulo"), s.cuenta(almacen), s.u16(idArticulo)]);
}

// Rust: seeds = [b"movimiento", articulo.key().as_ref(), folio.as_bytes()]
export function pdaMovimiento(articulo: Address, folio: string) {
  return derivar([s.texto("movimiento"), s.cuenta(articulo), s.texto(folio)]);
}

/*
Las instrucciones de movimiento necesitan las tres cuentas, porque el programa
valida la cadena completa en el contexto. Derivarlas de una vez evita repetir
el mismo bloque.
*/
export function cadena(
  nombreAlmacen: string,
  owner: Address,
  idArticulo: number,
  folio: string
) {
  const almacen = pdaAlmacen(nombreAlmacen, owner);
  const articulo = pdaArticulo(almacen, idArticulo);
  const movimiento = pdaMovimiento(articulo, folio);
  return { almacen, articulo, movimiento };
}
