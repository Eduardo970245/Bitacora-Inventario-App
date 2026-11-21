//////////////////// Cliente de prueba para Solana Playground ////////////////////
/*
Pega este archivo en client/client.ts de tu proyecto de Playground y pulsa "Run"
DESPUES de hacer Build y Deploy en Devnet. Recorre todo el flujo del programa:

  crear_almacen -> crear_articulo -> entrada -> salida -> corregir -> anular

Usa la wallet de Playground (pg.wallet) y el Program ID del proyecto (pg.PROGRAM_ID).
Cada ejecucion usa un nombre de almacen nuevo para no chocar con corridas anteriores.
*/
import { PublicKey } from "@solana/web3.js";

const owner = pg.wallet.publicKey;
const nombreAlmacen = "Prueba " + Date.now().toString().slice(-6); // max 30 bytes
const folioEntrada = "E-0001"; // max 8 bytes
const folioSalida = "S-0001";

console.log("Owner:", owner.toString());
console.log("Saldo:", (await pg.connection.getBalance(owner)) / web3.LAMPORTS_PER_SOL, "SOL");

//////////////////// PDAs ////////////////////
/*
    almacen    <- ["almacen",    nombre_almacen, owner]
    articulo   <- ["articulo",   almacen, id_articulo (u16 little-endian)]
    movimiento <- ["movimiento", articulo, folio]
*/
function u16ToBytes(valor: number) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(valor, 0);
  return buffer;
}

const [pdaAlmacen] = PublicKey.findProgramAddressSync(
  [Buffer.from("almacen"), Buffer.from(nombreAlmacen), owner.toBuffer()],
  pg.PROGRAM_ID
);
const pdaArticulo = (id: number) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("articulo"), pdaAlmacen.toBuffer(), u16ToBytes(id)],
    pg.PROGRAM_ID
  )[0];
const pdaMovimiento = (articulo: PublicKey, folio: string) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("movimiento"), articulo.toBuffer(), Buffer.from(folio)],
    pg.PROGRAM_ID
  )[0];

//////////////////// Helpers ////////////////////
async function esperarCuenta(direccion: PublicKey, intentos = 40) {
  for (let i = 0; i < intentos; i++) {
    const info = await pg.connection.getAccountInfo(direccion, "confirmed");
    if (info) return;
    await pg.connection.getSlot("confirmed"); // cada consulta toma un momento y hace de pausa
  }
  throw new Error("La cuenta no apareció en la red: " + direccion.toString());
}

async function mostrarEstado(titulo: string, idArticulo: number, stockEsperado: number) {
  await esperarCuenta(pdaArticulo(idArticulo));
  let articulo = await pg.program.account.articulo.fetch(pdaArticulo(idArticulo), "confirmed");
  for (let i = 0; i < 40 && articulo.stock !== stockEsperado; i++) {
    await pg.connection.getSlot("confirmed");
    articulo = await pg.program.account.articulo.fetch(pdaArticulo(idArticulo), "confirmed");
  }
  const ok = articulo.stock === stockEsperado ? "OK" : "NO COINCIDE";
  console.log(`${titulo} -> stock: ${articulo.stock} (esperado ${stockEsperado}) ${ok}, movimientos activos: ${articulo.movimientos.length}`);
}

async function debeFallar(descripcion: string, accion: () => Promise<unknown>) {
  try {
    await accion();
    console.log(`FALLO LA PRUEBA: "${descripcion}" deberia haber sido rechazado`);
  } catch (error) {
    console.log(`OK, rechazado como se esperaba: ${descripcion}`);
  }
}

//////////////////// 1. Almacen ////////////////////
await pg.program.methods
  .crearAlmacen(nombreAlmacen)
  .accounts({ owner, almacen: pdaAlmacen })
  .rpc();
console.log("Almacen creado:", pdaAlmacen.toString());

//////////////////// 2. Articulo ////////////////////
// El id lo asigna el programa: el primero siempre es 1.
const idArticulo = 1;
console.log("PDA esperada del artículo 1:", pdaArticulo(1).toString());
await pg.program.methods
  .crearArticulo("Tornillo 1/4", "pza")
  .accounts({ owner, almacen: pdaAlmacen, articulo: pdaArticulo(idArticulo) })
  .rpc();
await mostrarEstado("Articulo creado", idArticulo, 0);

//////////////////// 3. Entrada de 100 ////////////////////
await pg.program.methods
  .registrarMovimiento(idArticulo, folioEntrada, { entrada: {} }, "Compra a proveedor", 100)
  .accounts({
    owner,
    almacen: pdaAlmacen,
    articulo: pdaArticulo(idArticulo),
    movimiento: pdaMovimiento(pdaArticulo(idArticulo), folioEntrada),
  })
  .rpc();
await mostrarEstado("Despues de entrada de 100", idArticulo, 100); // stock 100

//////////////////// 4. Salida de 30 ////////////////////
await pg.program.methods
  .registrarMovimiento(idArticulo, folioSalida, { salida: {} }, "Venta mostrador", 30)
  .accounts({
    owner,
    almacen: pdaAlmacen,
    articulo: pdaArticulo(idArticulo),
    movimiento: pdaMovimiento(pdaArticulo(idArticulo), folioSalida),
  })
  .rpc();
await mostrarEstado("Despues de salida de 30", idArticulo, 70); // stock 70

//////////////////// 5. Casos que el programa debe rechazar ////////////////////
await debeFallar("salida mayor al stock", () =>
  pg.program.methods
    .registrarMovimiento(idArticulo, "S-0002", { salida: {} }, "Demasiado", 1000)
    .accounts({
      owner,
      almacen: pdaAlmacen,
      articulo: pdaArticulo(idArticulo),
      movimiento: pdaMovimiento(pdaArticulo(idArticulo), "S-0002"),
    })
    .rpc()
);
await debeFallar("cantidad cero", () =>
  pg.program.methods
    .registrarMovimiento(idArticulo, "E-0002", { entrada: {} }, "Cero", 0)
    .accounts({
      owner,
      almacen: pdaAlmacen,
      articulo: pdaArticulo(idArticulo),
      movimiento: pdaMovimiento(pdaArticulo(idArticulo), "E-0002"),
    })
    .rpc()
);
await debeFallar("folio repetido", () =>
  pg.program.methods
    .registrarMovimiento(idArticulo, folioEntrada, { entrada: {} }, "Duplicado", 5)
    .accounts({
      owner,
      almacen: pdaAlmacen,
      articulo: pdaArticulo(idArticulo),
      movimiento: pdaMovimiento(pdaArticulo(idArticulo), folioEntrada),
    })
    .rpc()
);

//////////////////// 6. Corregir cantidad de la salida (30 -> 40) ////////////////////
await pg.program.methods
  .corregirCantidad(idArticulo, folioSalida, 40)
  .accounts({
    owner,
    almacen: pdaAlmacen,
    articulo: pdaArticulo(idArticulo),
    movimiento: pdaMovimiento(pdaArticulo(idArticulo), folioSalida),
  })
  .rpc();
await mostrarEstado("Despues de corregir salida a 40", idArticulo, 60); // stock 60

//////////////////// 7. Anular la salida ////////////////////
await pg.program.methods
  .anularMovimiento(idArticulo, folioSalida)
  .accounts({
    owner,
    almacen: pdaAlmacen,
    articulo: pdaArticulo(idArticulo),
    movimiento: pdaMovimiento(pdaArticulo(idArticulo), folioSalida),
  })
  .rpc();
await mostrarEstado("Despues de anular la salida", idArticulo, 100); // stock 100

//////////////////// 8. Resumen ////////////////////
const almacen = await pg.program.account.almacen.fetch(pdaAlmacen);
console.log("Almacen:", almacen.nombreAlmacen, "| articulos:", almacen.articulos.length);
const entrada = await pg.program.account.movimiento.fetch(
  pdaMovimiento(pdaArticulo(idArticulo), folioEntrada)
);
console.log(
  "Movimiento",
  entrada.folio,
  "| cantidad:",
  entrada.cantidad,
  "| fecha:",
  new Date(Number(entrada.fecha) * 1000).toLocaleString()
);