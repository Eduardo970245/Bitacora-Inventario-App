import { createHash } from 'node:crypto';
import { PublicKey } from '@solana/web3.js';

// Direccion marcador: es la que trae el IDL de ejemplo del repositorio. No es un despliegue real,
// asi que mientras el IDL la use las operaciones de escritura permanecen bloqueadas.
export const REFERENCIA_ID = '4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi';
export const NOMBRE_PROGRAMA = 'bitacorainventario';
const normalizar = (valor) => String(valor).replace(/_/g, '').toLowerCase();
const requeridas = {
  crearalmacen: ['nombrealmacen'],
  creararticulo: ['nombre', 'unidad'],
  registrarmovimiento: ['idarticulo', 'folio', 'tipo', 'motivo', 'cantidad'],
  corregircantidad: ['idarticulo', 'folio', 'nuevacantidad'],
  anularmovimiento: ['idarticulo', 'folio'],
};
const tiposArgumentos = {
  crearalmacen: ['string'], creararticulo: ['string', 'string'],
  registrarmovimiento: ['u16', 'string', 'defined:tipomovimiento', 'string', 'u32'],
  corregircantidad: ['u16', 'string', 'u32'], anularmovimiento: ['u16', 'string'],
};
const camposEsperados = {
  almacen: [['owner', 'pubkey'], ['nombrealmacen', 'string'], ['articulos', 'vec:pubkey'], ['idcounter', 'u16']],
  articulo: [['idarticulo', 'u16'], ['nombre', 'string'], ['unidad', 'string'], ['stock', 'u32'], ['movimientos', 'vec:pubkey']],
  movimiento: [['folio', 'string'], ['tipo', 'defined:tipomovimiento'], ['motivo', 'string'], ['cantidad', 'u32'], ['fecha', 'i64']],
};
// Anchor legacy escribe { defined: 'Nombre' }; el formato moderno escribe { defined: { name: 'Nombre' } }.
const tipo = (valor) => {
  if (typeof valor === 'string') return valor === 'publicKey' ? 'pubkey' : valor;
  if (valor?.vec) return 'vec:' + tipo(valor.vec);
  if (valor?.defined) return 'defined:' + normalizar(typeof valor.defined === 'string' ? valor.defined : valor.defined.name);
  return JSON.stringify(valor);
};

export function validarIdl(idl, programIdOpcional) {
  if (!idl || typeof idl !== 'object' || !Array.isArray(idl.instructions)) {
    throw new Error('El archivo no tiene la estructura de un IDL de Anchor.');
  }
  const nombres = idl.name ?? idl.metadata?.name;
  if (normalizar(nombres) !== NOMBRE_PROGRAMA) {
    throw new Error('Este frontend espera el programa bitacora_inventario. Revisa el nombre del modulo #[program] en lib.rs.');
  }
  for (const [nombre, argumentos] of Object.entries(requeridas)) {
    const instruccion = idl.instructions.find((item) => normalizar(item.name) === nombre);
    if (!instruccion || !Array.isArray(instruccion.args)) throw new Error('Falta la instruccion ' + nombre);
    const recibidos = instruccion.args.map((item) => normalizar(item.name));
    if (JSON.stringify(recibidos) !== JSON.stringify(argumentos)) {
      throw new Error('Los argumentos de ' + nombre + ' no coinciden con el programa de la bitacora.');
    }
    if (JSON.stringify(instruccion.args.map((item) => tipo(item.type))) !== JSON.stringify(tiposArgumentos[nombre])) {
      throw new Error('Los tipos de los argumentos de ' + nombre + ' no coinciden con el programa de la bitacora.');
    }
  }
  for (const cuenta of ['almacen', 'articulo', 'movimiento']) {
    if (!idl.accounts?.some((item) => normalizar(item.name) === cuenta)) {
      throw new Error('Falta el tipo de cuenta ' + cuenta);
    }
    const definicion = idl.accounts.find((item) => normalizar(item.name) === cuenta).type
      ?? idl.types?.find((item) => normalizar(item.name) === cuenta)?.type;
    const campos = definicion?.fields?.map((item) => [normalizar(item.name), tipo(item.type)]);
    if (definicion?.kind !== 'struct' || JSON.stringify(campos) !== JSON.stringify(camposEsperados[cuenta])) {
      throw new Error('Los campos de la cuenta ' + cuenta + ' no coinciden con el programa de la bitacora.');
    }
  }
  const direccion = programIdOpcional ?? idl.address ?? idl.metadata?.address;
  if (!direccion) throw new Error('El IDL no incluye direccion. Agrega --program-id TU_PROGRAM_ID.');
  let programId;
  try { programId = new PublicKey(direccion).toBase58(); }
  catch { throw new Error('El Program ID no es una direccion valida de Solana.'); }
  if (programId === '11111111111111111111111111111111') {
    throw new Error('El System Program no es el programa de la bitacora. Usa el ID de tu despliegue.');
  }
  if (programIdOpcional && (idl.address ?? idl.metadata?.address) && programId !== (idl.address ?? idl.metadata?.address)) {
    throw new Error('El --program-id y la direccion del IDL no coinciden. Exporta el IDL correcto.');
  }
  return { programId, esReferencia: programId === REFERENCIA_ID };
}

export function prepararIdl(idl, programId) {
  const copia = structuredClone(idl);
  if (copia.address) copia.address = programId;
  else copia.metadata = { ...copia.metadata, address: programId };
  // El guion bajo de un argumento Rust no cambia sus bytes ni su posicion.
  // Normalizamos solo esos nombres para mantener idArticulo en el cliente TS.
  for (const instruccion of copia.instructions) {
    for (const argumento of instruccion.args ?? []) argumento.name = argumento.name.replace(/^_+/, '');
  }
  return copia;
}

export function huellaIdl(idl) {
  return createHash('sha256').update(JSON.stringify(idl)).digest('hex');
}
