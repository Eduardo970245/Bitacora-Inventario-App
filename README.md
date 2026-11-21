# Bitácora de Inventario · App

Frontend con **TypeScript y React** y programa **Anchor** en **Solana Devnet** para llevar una bitácora de inventario: qué artículos hay en un almacén, cuánto stock tiene cada uno y qué entradas y salidas lo explican.

> ℹ️ Es un proyecto educativo para **Devnet**. No mueve SOL ni tokens: las cantidades son datos de inventario.

## Modelo: tres cuentas

**Almacén → Artículos → Movimientos**

| Cuenta | Qué guarda |
| --- | --- |
| `Almacen` | Autoridad (wallet), nombre, direcciones de sus artículos y contador de IDs. |
| `Articulo` | ID, nombre, unidad (pza, kg…), **stock** y direcciones de sus movimientos. |
| `Movimiento` | Folio, tipo (entrada o salida), motivo, cantidad y fecha de la red. |

El stock **lo calcula el programa**: una entrada suma, una salida resta y se rechaza si dejaría el stock en negativo. Cada cuenta se deriva de su padre mediante PDAs (`programa/README.md` tiene las seeds).

## ¿Qué puedes hacer con la app?

- Conectar una wallet de navegador (Phantom, Solflare, Backpack…) y consultar saldos de Devnet.
- Consultar un almacén, sus artículos, su stock y la bitácora de movimientos.
- Crear almacenes y artículos, registrar entradas y salidas, corregir una cantidad y anular un movimiento.
- Revisar solicitudes de firma, confirmaciones y errores de las transacciones.

## Puesta en marcha

Requiere **Node.js 22.12 o superior de la rama 22** y npm.

```bash
git clone https://github.com/Eduardo970245/Bitacora-Inventario-App.git
cd Bitacora-Inventario-App
npm install
npm run cliente
npm run dev
```

Al inicio la app trae un **IDL de ejemplo con una dirección marcador**: puedes conectar la wallet y ver saldos, pero las operaciones del almacén permanecen bloqueadas hasta importar el IDL de **tu** programa desplegado. El recorrido completo (Playground, wallet, IDL, despliegue) está en **[`docs/GUIA-DESPLIEGUE.md`](./docs/GUIA-DESPLIEGUE.md)**.

Resumen:

1. Pega `programa/src/lib.rs` en un proyecto Anchor de [Solana Playground](https://beta.solpg.io), cambia a Devnet, **Build** y **Deploy**.
2. Exporta el IDL generado y ejecuta `npm run configurar:idl -- ./tmp-idl/bitacora.json`.
3. `npm run dev`, abre `http://localhost:5173` en el navegador con tu wallet en Devnet.

> 🔐 La app nunca contiene ni pide claves privadas. La wallet que conectes será la autoridad de los almacenes que crees. Usa una wallet solo para pruebas.

## ¿Dónde está cada cosa?

| Ruta | Qué encontrarás |
| --- | --- |
| `programa/src/lib.rs` | Programa Rust + Anchor (cuentas, instrucciones, errores). |
| `programa/client/client.ts` | Script de prueba para pegar en Playground. |
| `src/components/Bitacora.tsx` | Pantalla principal: consulta y formularios. |
| `src/solana/acciones.ts` | Funciones que conectan los formularios con las instrucciones. |
| `src/solana/lecturas.ts` | Lectura de Almacén, Artículos y Movimientos. |
| `src/solana/pdas.ts`, `seeds.ts` | Derivación de las direcciones (deben coincidir con `lib.rs`). |
| `src/solana/validaciones.ts` | Límites de texto y números (mismos máximos que el programa). |
| `src/solana/tx.ts` | Preparación, envío, confirmación y traducción de errores. |
| `src/config/interfaz.ts` | Título y valores iniciales. |
| `idl.json`, `clients/js/src/generated/` | IDL y cliente generado con Codama (**no se edita a mano**). |
| `docs/` | Guía de despliegue, pruebas manuales y límites del diseño. |

Si cambias `idl.json`, ejecuta `npm run cliente`. Conserva juntos `idl.json`, `src/config/programa.json` y `clients/js/`.

## Probar tus cambios

```bash
npm run verificar
```

Ejecuta TypeScript, las pruebas automatizadas y el build. Las pruebas **no envían transacciones**: completa el recorrido de [pruebas manuales](./docs/PRUEBAS-MANUALES.md) y ejecuta `programa/client/client.ts` en Playground.

## Si algo no funciona

| Situación | Qué revisar |
| --- | --- |
| La wallet no aparece | Abre la app en una pestaña normal con la extensión instalada. |
| Falta SOL de prueba | [Solana Faucet](https://faucet.solana.com/), red Devnet. |
| No aparece tu almacén | Nombre exacto y dirección de la autoridad: ambos forman la PDA. |
| No puedes repetir un folio | Cada artículo admite un solo movimiento activo por folio. |
| RPC con límite de uso | Espera, o configura otro endpoint de Devnet en `.env.local` (ver `.env.example`). |
| Cambiaste el IDL y falla la comprobación | `npm run cliente` y reinicia el servidor. |

Revisa [seguridad y alcance](./docs/SEGURIDAD-Y-ALCANCE.md) para conocer los límites del diseño.

## Origen

Parte de la estructura (frontend, scripts de IDL y cliente) proviene de la base educativa «Registro de Ventas» de WayLearn, adaptada aquí a un modelo de inventario.
