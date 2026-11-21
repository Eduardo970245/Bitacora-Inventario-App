# Guía de despliegue paso a paso

Orden general: **Playground (compilar y desplegar) → exportar IDL → importarlo en este repositorio → ejecutar la app con tu wallet del navegador.**

## 0. Dos wallets, dos funciones

| Wallet | Para qué sirve | Dónde vive |
| --- | --- | --- |
| **Wallet de Playground** | Pagar el despliegue del programa y ser su *upgrade authority*. | En el navegador, dentro de Playground. |
| **Wallet del navegador** (Phantom, Solflare o Backpack) | Firmar las transacciones de la app: crear el almacén, artículos y movimientos. | Extensión del navegador. |

La app funciona con cualquiera de las dos familias de wallets. No necesitas Solflare en particular: sirve Phantom, Solflare o Backpack. Usa una wallet **solo para pruebas en Devnet**, con una frase de recuperación que no uses en ningún lugar con dinero real.

**Importante:** el almacén se deriva de `nombre + dirección de la wallet que lo crea`. Si lo creas desde la app, queda ligado a tu wallet del navegador, no a la de Playground. No necesitas pasar claves de una a otra.

## 1. Preparar la wallet del navegador (una sola vez)

1. Instala la extensión desde el sitio oficial (solflare.com o phantom.com). Verifica la URL: hay copias falsas.
2. Crea una wallet nueva. Anota la frase de recuperación **en papel** y no la compartas, no la pegues en ningún chat ni en el código.
3. Cambia la wallet a **Devnet** (en Solflare: Ajustes → red; en Phantom: Ajustes → Developer Settings → Testnet Mode → Solana Devnet). Los nombres exactos del menú cambian entre versiones.
4. Copia tu dirección pública y pide SOL de prueba en https://faucet.solana.com (red Devnet). Con 2–3 SOL de prueba basta para operar la app.

## 2. Compilar y desplegar en Solana Playground

1. Abre https://beta.solpg.io y crea un proyecto nuevo **Anchor (Rust)**.
2. Reemplaza todo el contenido de `src/lib.rs` por `programa/src/lib.rs` de este repositorio.
3. Crea o conecta la **wallet de Playground** (esquina inferior izquierda) y cambia el endpoint a **Devnet** (ícono de engrane → Endpoint).
4. Fondea esa wallet. En la terminal de Playground: `solana airdrop 5` (si lo limita, repite más tarde o usa https://faucet.solana.com con la dirección que muestra `solana address`). Comprueba con `solana balance`. Un despliegue de este tamaño puede costar varios SOL de Devnet.
5. Ejecuta **Build** (martillo, o `build` en la terminal). Playground reemplaza `declare_id!("1111…")` por el **Program ID** generado para tu proyecto. Ese es el ID de tu programa: no lo inventas ni lo escribes a mano.
6. Si Build da errores, cópialos completos: casi siempre son de una línea concreta.
7. Ejecuta **Deploy** (o `deploy`). Espera la confirmación.
8. Opcional pero recomendable: en el panel de Build & Deploy, abre *Program credentials* y guarda una copia de la keypair del programa **fuera del repositorio**. Los proyectos de Playground viven en el almacenamiento del navegador; si lo borras, pierdes el control del programa.
9. Prueba el programa antes de tocar el frontend: pega `programa/client/client.ts` en `client/client.ts` del proyecto de Playground y pulsa **Run**. Debes ver el stock pasar de 100 a 70, a 60 y de vuelta a 100, y tres mensajes «OK, rechazado como se esperaba».

## 3. Exportar el IDL

El IDL se genera al compilar. Búscalo en el explorador de archivos de Playground como `target/idl/bitacora_inventario.json` (o con la opción de exportar/descargar IDL del panel Build & Deploy, según la versión de la interfaz).

1. Descarga o copia su contenido a un archivo local, por ejemplo `tmp-idl/bitacora.json`, dentro de este repositorio. (`tmp-idl/` no se sube si lo agregas a `.gitignore`; el IDL tampoco es secreto.)
2. Comprueba que el nombre del programa sea `bitacora_inventario`: la app rechaza IDLs de otro programa.

## 4. Importar el IDL en este repositorio

```bash
npm install
npm run configurar:idl -- ./tmp-idl/bitacora.json
```

Si el IDL no incluye la dirección, agrégala con el Program ID que Playground muestra:

```bash
npm run configurar:idl -- ./tmp-idl/bitacora.json --program-id TU_PROGRAM_ID
```

El comando valida que el IDL tenga las 5 instrucciones y las 3 cuentas esperadas, lo guarda como `idl.json`, regenera `clients/js/` y actualiza `src/config/programa.json`. **No hay ningún lugar del código donde pegar el Program ID a mano.**

## 5. Ejecutar la app

```bash
npm run verificar   # typecheck, pruebas y build (no envían transacciones)
npm run dev         # http://localhost:5173
```

Abre la app en una pestaña normal del navegador donde tienes la extensión instalada, conecta la wallet (en Devnet) y recorre `docs/PRUEBAS-MANUALES.md`.

## 6. Qué subir a GitHub y qué no

| Sí se sube | No se sube nunca |
| --- | --- |
| `idl.json`, `src/config/programa.json`, `clients/js/` | Frase de recuperación de cualquier wallet |
| Program ID (es una dirección pública) | Archivos `*-keypair.json` (ya están en `.gitignore`) |
| Tu dirección pública, si quieres documentarla | Keypair del programa exportada de Playground |
| `.env.example` | `.env`, `.env.local` |

El código nunca contiene tu wallet: la app usa la dirección de la wallet conectada y le pide a la extensión que firme. La clave privada no pasa por el código de la app.

**Sobre el RPC:** las variables `VITE_*` terminan dentro del JavaScript público del sitio. Para Devnet basta el RPC público por defecto. Si algún día usas un RPC con clave de API (Helius, QuickNode…), guárdala solo en `.env.local` y no publiques ese build en un sitio abierto.

## 7. Si cambias el programa después

1. Edita `lib.rs` en Playground, **Build** y **Deploy** otra vez (se actualiza el mismo Program ID).
2. Exporta el IDL nuevo y repite el paso 4.
3. Si cambiaste campos de las cuentas, las cuentas ya creadas con el formato anterior dejan de ser legibles: crea un almacén nuevo con otro nombre.

## Problemas frecuentes

| Síntoma | Qué revisar |
| --- | --- |
| La app dice «Importa el IDL de tu programa» | `programa.json` sigue con la dirección marcador: ejecuta el paso 4. |
| «Este frontend espera el programa bitacora_inventario» | El módulo `#[program]` de `lib.rs` debe llamarse `bitacora_inventario`. |
| «El programa indicado no está desplegado» | Hiciste Build pero no Deploy, o la wallet/RPC de la app no está en Devnet. |
| La wallet no aparece | Abre la app en una pestaña normal, no en la vista incrustada de un editor. |
| `ConstraintSeeds` | Nombre del almacén, autoridad, ID o folio no coinciden con los usados al crear. Mayúsculas y espacios cuentan. |
| `StockInsuficiente` | Una salida, corrección o anulación dejaría el stock en negativo. |
| Playground no tiene fondos para desplegar | `solana balance`; repite el airdrop o usa faucet.solana.com. |
| RPC responde 429 | Espera unos segundos o configura otro endpoint de Devnet en `.env.local`. |
