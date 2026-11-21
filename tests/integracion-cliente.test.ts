import '../src/polyfills';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PublicKey } from '@solana/web3.js';
import type { Connection } from '@solana/web3.js';
import { address, createNoopSigner } from '@solana/kit';
import {
  getRegistrarMovimientoInstruction, getRegistrarMovimientoInstructionDataDecoder,
  getCorregirCantidadInstruction, getCrearAlmacenInstruction, getMovimientoDecoder,
  TipoMovimiento, BITACORA_INVENTARIO_PROGRAM_ADDRESS,
} from '../clients/js/src/generated';
import { pdaAlmacen, pdaArticulo, pdaMovimiento } from '../src/solana/pdas';
import { s } from '../src/solana/seeds';
import { aWeb3, confirmarEnvio, ErrorTransaccion, ErrorConfirmacionPendiente, traducir } from '../src/solana/tx';
import { comprobarDevnet, DEVNET_GENESIS } from '../src/solana/seguridad';
import { cantidadValida, folioValido, nombreValido, unidadValida, idValido, motivoValido } from '../src/solana/validaciones';
import idl from '../idl.json';
import { validarIdl, prepararIdl, REFERENCIA_ID } from '../scripts/contrato-idl.mjs';

// Direccion publica de fixture. No se crean wallets ni se envian transacciones.
const owner = address(new PublicKey(new Uint8Array(32).fill(7)).toBase58());

test('las semillas u16 conservan dos bytes little-endian y sus limites', () => {
  assert.deepEqual([...s.u16(256)], [0, 1]);
  assert.deepEqual([...s.u16(65_535)], [255, 255]);
  assert.throws(() => s.u16(65_536));
  assert.throws(() => s.u16(1.5));
});

test('Almacen, Articulo y Movimiento coinciden con las semillas del programa Rust', () => {
  const programa = new PublicKey(BITACORA_INVENTARIO_PROGRAM_ADDRESS);
  const [almacen] = PublicKey.findProgramAddressSync([Buffer.from('almacen'), Buffer.from('Almacen Central'), new PublicKey(owner).toBuffer()], programa);
  const id = Buffer.alloc(2); id.writeUInt16LE(256);
  const [articulo] = PublicKey.findProgramAddressSync([Buffer.from('articulo'), almacen.toBuffer(), id], programa);
  const [movimiento] = PublicKey.findProgramAddressSync([Buffer.from('movimiento'), articulo.toBuffer(), Buffer.from('E-0001')], programa);
  assert.equal(pdaAlmacen('Almacen Central', owner), almacen.toBase58());
  assert.equal(pdaArticulo(address(almacen.toBase58()), 256), articulo.toBase58());
  assert.equal(pdaMovimiento(address(articulo.toBase58()), 'E-0001'), movimiento.toBase58());
});

test('las semillas del cliente siguen escritas igual en programa/src/lib.rs', () => {
  const rust = readFileSync(new URL('../programa/src/lib.rs', import.meta.url), 'utf8');
  assert.match(rust, /seeds = \[b"almacen", nombre_almacen\.as_bytes\(\), owner\.key\(\)\.as_ref\(\)\]/);
  assert.match(rust, /seeds = \[b"articulo", almacen\.key\(\)\.as_ref\(\), id_articulo\.to_le_bytes\(\)\.as_ref\(\)\]/);
  assert.match(rust, /seeds = \[b"movimiento", articulo\.key\(\)\.as_ref\(\), folio\.as_bytes\(\)\]/);
  assert.match(rust, /pub mod bitacora_inventario/);
});

test('Codama serializa la instruccion y el puente conserva datos, orden y roles', () => {
  const almacen = pdaAlmacen('Almacen', owner), articulo = pdaArticulo(almacen, 1), movimiento = pdaMovimiento(articulo, 'E-0001');
  const ix = getRegistrarMovimientoInstruction({ owner: createNoopSigner(owner), almacen, articulo, movimiento, idArticulo: 1, folio: 'E-0001', tipo: TipoMovimiento.Salida, motivo: 'Venta mostrador', cantidad: 25 });
  const esperado = createHash('sha256').update('global:registrar_movimiento').digest().subarray(0, 8);
  assert.deepEqual(Buffer.from(ix.data.subarray(0, 8)), esperado);
  const decodificada = getRegistrarMovimientoInstructionDataDecoder().decode(ix.data);
  assert.equal(decodificada.cantidad, 25);
  assert.equal(decodificada.tipo, TipoMovimiento.Salida);
  assert.equal(decodificada.folio, 'E-0001');
  const convertida = aWeb3(ix);
  assert.equal(convertida.programId.toBase58(), BITACORA_INVENTARIO_PROGRAM_ADDRESS);
  assert.deepEqual(convertida.data, Buffer.from(ix.data));
  // owner, almacen, articulo, movimiento, system_program
  assert.deepEqual(convertida.keys.map((cuenta) => [cuenta.isSigner, cuenta.isWritable]), [[true, true], [false, false], [false, true], [false, true], [false, false]]);
  const correccion = aWeb3(getCorregirCantidadInstruction({ owner: createNoopSigner(owner), almacen, articulo, movimiento, idArticulo: 1, folio: 'E-0001', nuevaCantidad: 30 }));
  assert.equal(correccion.keys[0].isSigner, true);
  assert.equal(correccion.keys[0].isWritable, false);
  const alta = aWeb3(getCrearAlmacenInstruction({ owner: createNoopSigner(owner), almacen, nombreAlmacen: 'Almacen' }));
  assert.equal(alta.keys.length, 3);
});

test('la cuenta Movimiento se decodifica con el orden y los tipos del programa', () => {
  // discriminador (8) + folio + tipo (u8) + motivo + cantidad (u32) + fecha (i64)
  const texto = (valor: string) => { const b = Buffer.from(valor); const l = Buffer.alloc(4); l.writeUInt32LE(b.length); return Buffer.concat([l, b]); };
  const cantidad = Buffer.alloc(4); cantidad.writeUInt32LE(40);
  const fecha = Buffer.alloc(8); fecha.writeBigInt64LE(1_700_000_000n);
  const bytes = Buffer.concat([Buffer.alloc(8), texto('S-0002'), Buffer.from([TipoMovimiento.Salida]), texto('Merma'), cantidad, fecha]);
  const cuenta = getMovimientoDecoder().decode(bytes);
  assert.equal(cuenta.folio, 'S-0002');
  assert.equal(cuenta.tipo, TipoMovimiento.Salida);
  assert.equal(cuenta.motivo, 'Merma');
  assert.equal(cuenta.cantidad, 40);
  assert.equal(cuenta.fecha, 1_700_000_000n);
});

test('una confirmacion con error nunca produce un resultado de exito', async () => {
  const estrategia = { signature: 'firma-de-prueba', blockhash: 'blockhash-de-prueba', lastValidBlockHeight: 123 };
  const connection = { confirmTransaction: async () => ({ context: { slot: 1 }, value: { err: { InstructionError: [0, { Custom: 6000 }] } } }) } as unknown as Pick<Connection, 'confirmTransaction'>;
  await assert.rejects(confirmarEnvio(connection, estrategia), (error: unknown) => error instanceof ErrorTransaccion && error.firma === estrategia.signature);
  const correcta = { confirmTransaction: async (_datos: unknown, commitment: string) => { assert.equal(commitment, 'confirmed'); return { context: { slot: 1 }, value: { err: null } }; } } as unknown as Pick<Connection, 'confirmTransaction'>;
  assert.equal(await confirmarEnvio(correcta, estrategia), estrategia.signature);
});

test('se exige el genesis completo de Devnet para escribir', async () => {
  await comprobarDevnet({ getGenesisHash: async () => DEVNET_GENESIS });
  await assert.rejects(comprobarDevnet({ getGenesisHash: async () => '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d' }), /solo permite escribir en Devnet/);
  await assert.rejects(comprobarDevnet({ getGenesisHash: async () => DEVNET_GENESIS.slice(0, 32) }));
});

test('una interrupcion del RPC conserva la firma y no afirma que la transaccion fallo', async () => {
  const estrategia = { signature: 'firma-ya-enviada', blockhash: 'blockhash', lastValidBlockHeight: 123 };
  const connection = { confirmTransaction: async () => { throw new Error('RPC timeout'); } } as unknown as Pick<Connection, 'confirmTransaction'>;
  await assert.rejects(confirmarEnvio(connection, estrategia), (error: unknown) => error instanceof ErrorConfirmacionPendiente && error.firma === estrategia.signature && /antes de repetirla/.test(error.message));
});

test('validaciones de UI comprueban bytes UTF-8 y enteros positivos', () => {
  assert.equal(folioValido('E-0001'), 'E-0001');
  assert.throws(() => folioValido('E-0000001'), /8 bytes/);
  assert.throws(() => folioValido('Fol☕☕'));
  assert.equal(nombreValido(' Tornillo '), 'Tornillo');
  assert.equal(unidadValida('pza'), 'pza');
  assert.throws(() => unidadValida('cajas grandes'));
  assert.throws(() => motivoValido('x'.repeat(51)));
  for (const invalido of [0, -1, 1.5, NaN, 4_294_967_296]) assert.throws(() => cantidadValida(invalido));
  assert.equal(cantidadValida(4_294_967_295), 4_294_967_295);
  assert.throws(() => idValido(65_536));
});

test('los errores distinguen cancelacion, autoridad, stock, semillas y RPC', () => {
  assert.match(traducir(new Error('User rejected the request')), /cancelada/);
  assert.match(traducir(new Error('custom program error: 0x1770')), /NoOwner/);
  assert.match(traducir(new Error('custom program error: 0x1773')), /StockInsuficiente/);
  assert.match(traducir(new Error('custom program error: 0x7d6')), /ConstraintSeeds/);
  assert.match(traducir(new Error('429 Too Many Requests')), /RPC/);
});

// Las pruebas del contrato no dependen de la direccion que traiga idl.json: despues de importar
// tu IDL real esa direccion cambia, asi que cada prueba parte de una copia con la direccion marcador.
const idlMarcador = () => {
  const copia = structuredClone(idl) as typeof idl & { address: string };
  copia.address = REFERENCIA_ID;
  return copia;
};

test('la direccion marcador bloquea escrituras y cualquier otra direccion valida las habilita', () => {
  assert.equal(validarIdl(idlMarcador()).esReferencia, true);
  const real = idlMarcador();
  real.address = new PublicKey(new Uint8Array(32).fill(5)).toBase58();
  assert.equal(validarIdl(real).esReferencia, false);
  assert.throws(() => validarIdl({ ...real, address: '11111111111111111111111111111111' }), /System Program/);
});

test('se valida el contrato IDL y la normalizacion no cambia el orden ni tipos', () => {
  const copia = idlMarcador();
  const ix = copia.instructions.find((item) => item.name.toLowerCase().replace(/_/g, '') === 'registrarmovimiento')!;
  ix.args[0].name = '_id_articulo';
  assert.equal(validarIdl(copia).programId, REFERENCIA_ID);
  const normalizada = prepararIdl(copia, REFERENCIA_ID);
  assert.equal(normalizada.instructions.find((item: { name: string }) => item.name === ix.name).args[0].name, 'id_articulo');
  assert.equal(ix.args[0].name, '_id_articulo');
  const invalida = structuredClone(copia); invalida.instructions = [];
  assert.throws(() => validarIdl(invalida), /Falta la instruccion/);
  const otroTipo = structuredClone(copia);
  otroTipo.instructions[0].args[0].type = 'u64';
  assert.throws(() => validarIdl(otroTipo), /tipos de los argumentos/);
  const otraCuenta = structuredClone(copia) as unknown as { accounts: { name: string; type?: { fields: unknown[] } }[]; types?: { name: string; type: { fields: unknown[] } }[] };
  const cuenta = otraCuenta.accounts[0];
  const esquema = cuenta.type ?? otraCuenta.types?.find((item) => item.name === cuenta.name)?.type;
  esquema!.fields.reverse();
  assert.throws(() => validarIdl(otraCuenta), /campos de la cuenta/);
  assert.throws(() => validarIdl(copia, new PublicKey(new Uint8Array(32).fill(9)).toBase58()), /no coinciden/);
});

test('el validador acepta el tipo enum tanto en formato moderno como en legacy', () => {
  const legacy = idlMarcador() as unknown as Record<string, any>;
  const ix = legacy.instructions.find((item: { name: string }) => item.name === 'registrar_movimiento');
  ix.args[2].type = { defined: 'TipoMovimiento' }; // Anchor 0.29 y anteriores
  const movimiento = legacy.types.find((item: { name: string }) => item.name === 'Movimiento');
  movimiento.type.fields[1].type = { defined: 'TipoMovimiento' };
  assert.equal(validarIdl(legacy).programId, REFERENCIA_ID);
  ix.args[2].type = 'u8';
  assert.throws(() => validarIdl(legacy), /tipos de los argumentos/);
});

test('un IDL con otro nombre de programa se rechaza con un mensaje claro', () => {
  const ajeno = idlMarcador();
  ajeno.metadata.name = 'registro';
  assert.throws(() => validarIdl(ajeno), /bitacora_inventario/);
});
