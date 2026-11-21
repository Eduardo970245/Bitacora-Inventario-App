import { address, createNoopSigner, type Address } from '@solana/kit';
import type { Connection } from '@solana/web3.js';
import {
  getCrearAlmacenInstruction, getCrearArticuloInstruction,
  getRegistrarMovimientoInstruction, getCorregirCantidadInstruction, getAnularMovimientoInstruction,
  TipoMovimiento,
} from '../../clients/js/src/generated';
import { cadena, pdaArticulo, pdaAlmacen } from './pdas';
import { siguienteId } from './lecturas';
import { enviar, type WalletFirma, type OpcionesEnvio } from './tx';
import { comprobarConfiguracion } from './seguridad';
import { almacenValido, nombreValido, unidadValida, folioValido, motivoValido, idValido, cantidadValida } from './validaciones';

export function direccionDe(wallet: Pick<WalletFirma, 'publicKey'>): Address {
  if (!wallet.publicKey) throw new Error('Conecta tu wallet primero.');
  return address(wallet.publicKey.toBase58());
}

function firmante(wallet: WalletFirma) {
  comprobarConfiguracion();
  // Representa la identidad que la wallet firmará después; no contiene claves.
  // La clave privada nunca pasa por este código: la wallet firma por su cuenta.
  return createNoopSigner(direccionDe(wallet));
}

/** Crea la cuenta Almacén; la wallet conectada queda como autoridad. */
export async function crearAlmacen(wallet: WalletFirma, connection: Connection, nombreAlmacen: string, opciones?: OpcionesEnvio): Promise<string> {
  nombreAlmacen = almacenValido(nombreAlmacen);
  const owner = firmante(wallet);
  const almacen = pdaAlmacen(nombreAlmacen, owner.address);
  const ix = getCrearAlmacenInstruction({ owner, almacen, nombreAlmacen });
  return enviar(ix, wallet, connection, opciones);
}

/** Crea la cuenta Artículo (stock inicial 0) y la registra en el Almacén. */
export async function crearArticulo(wallet: WalletFirma, connection: Connection, nombreAlmacen: string, nombre: string, unidad: string, opciones?: OpcionesEnvio): Promise<string> {
  nombreAlmacen = almacenValido(nombreAlmacen);
  nombre = nombreValido(nombre);
  unidad = unidadValida(unidad);
  const owner = firmante(wallet);
  const almacen = pdaAlmacen(nombreAlmacen, owner.address);
  const id = await siguienteId(nombreAlmacen, owner.address);
  const articulo = pdaArticulo(almacen, id);
  const ix = getCrearArticuloInstruction({ owner, almacen, articulo, nombre, unidad });
  return enviar(ix, wallet, connection, opciones);
}

/** Registra una entrada o salida: crea la cuenta Movimiento y actualiza el stock del Artículo. */
export async function registrarMovimiento(wallet: WalletFirma, connection: Connection, nombreAlmacen: string, idArticulo: number, folio: string, tipo: 'entrada' | 'salida', motivo: string, cantidad: number, opciones?: OpcionesEnvio): Promise<string> {
  nombreAlmacen = almacenValido(nombreAlmacen);
  idArticulo = idValido(idArticulo);
  folio = folioValido(folio);
  motivo = motivoValido(motivo);
  cantidad = cantidadValida(cantidad);
  const owner = firmante(wallet);
  const { almacen, articulo, movimiento } = cadena(nombreAlmacen, owner.address, idArticulo, folio);
  const tipoPrograma = tipo === 'entrada' ? TipoMovimiento.Entrada : TipoMovimiento.Salida;
  const ix = getRegistrarMovimientoInstruction({ owner, almacen, articulo, movimiento, idArticulo, folio, tipo: tipoPrograma, motivo, cantidad });
  return enviar(ix, wallet, connection, opciones);
}

/** Corrige la cantidad de un movimiento; el programa recalcula el stock. */
export async function corregirCantidad(wallet: WalletFirma, connection: Connection, nombreAlmacen: string, idArticulo: number, folio: string, nuevaCantidad: number, opciones?: OpcionesEnvio): Promise<string> {
  nombreAlmacen = almacenValido(nombreAlmacen);
  idArticulo = idValido(idArticulo);
  folio = folioValido(folio);
  nuevaCantidad = cantidadValida(nuevaCantidad);
  const owner = firmante(wallet);
  const { almacen, articulo, movimiento } = cadena(nombreAlmacen, owner.address, idArticulo, folio);
  const ix = getCorregirCantidadInstruction({ owner, almacen, articulo, movimiento, idArticulo, folio, nuevaCantidad });
  return enviar(ix, wallet, connection, opciones);
}

/** Anula un movimiento: revierte su efecto en el stock y cierra su cuenta. */
export async function anularMovimiento(wallet: WalletFirma, connection: Connection, nombreAlmacen: string, idArticulo: number, folio: string, opciones?: OpcionesEnvio): Promise<string> {
  nombreAlmacen = almacenValido(nombreAlmacen);
  idArticulo = idValido(idArticulo);
  folio = folioValido(folio);
  const owner = firmante(wallet);
  const { almacen, articulo, movimiento } = cadena(nombreAlmacen, owner.address, idArticulo, folio);
  const ix = getAnularMovimientoInstruction({ owner, almacen, articulo, movimiento, idArticulo, folio });
  return enviar(ix, wallet, connection, opciones);
}
