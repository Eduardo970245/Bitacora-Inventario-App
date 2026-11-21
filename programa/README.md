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

## Programa desplegado en Devnet

| Dato | Valor |
| --- | --- |
| **Program ID** | `2pqFML2uKMCM2VDAj1gHtLcmzEvEr7o274oEf67nrLGD` |
| Explorer | [Ver programa en Solana Explorer (Devnet)](https://explorer.solana.com/address/2pqFML2uKMCM2VDAj1gHtLcmzEvEr7o274oEf67nrLGD?cluster=devnet) |
| Nombre del programa | `bitacora_inventario` |
| Red | Solana Devnet |

El `idl.json`, `src/config/programa.json` y `clients/js/` de este repositorio ya apuntan a ese Program ID, y `declare_id!` en `programa/src/lib.rs` lo contiene.

### Evidencia on-chain

| Evidencia | Enlace o dirección |
| --- | --- |
| Transacción verificable (Devnet) | [Ver en Explorer](https://explorer.solana.com/tx/3Wh5a6ugCJw3SPkR3VhojbghxmqsZocWCyfvJLLN9pK4Zu2UUNzwBfJjXDn7e2UqA71oiem5Jh1z5H4mkPrCbxMf?cluster=devnet) |
| Cuenta `Almacen` | [`GUYAQWdQiLAR4jcAcMvV1jCqy4GnGLYZ4B4gJxd9eoE3`](https://explorer.solana.com/address/GUYAQWdQiLAR4jcAcMvV1jCqy4GnGLYZ4B4gJxd9eoE3?cluster=devnet) |
| Cuenta `Articulo` (id 1) | [`gNuHEhmVQnbbkdRmjEBp1sTEjs8d9ZWUMpEfX9SvrdZ`](https://explorer.solana.com/address/gNuHEhmVQnbbkdRmjEBp1sTEjs8d9ZWUMpEfX9SvrdZ?cluster=devnet) |
| Cuenta `Movimiento` (folio `E-0001`) | [`8CAR2PFDYwNt5t8JoGsWGNYWaGeerqLzaWmpjJ78GKm9`](https://explorer.solana.com/address/8CAR2PFDYwNt5t8JoGsWGNYWaGeerqLzaWmpjJ78GKm9?cluster=devnet) |

Las tres cuentas se derivan como PDAs de ese Program ID (ver `programa/README.md`).

## Puesta en marcha

Requiere **Node.js 22.12 o superior de la rama 22** y npm. También puedes usar GitHub Codespaces: el repositorio trae su configuración.

### Opción A: usar el programa ya desplegado (lo habitual)

```bash
git clone https://github.com/Eduardo970245/Bitacora-Inventario-App.git
cd Bitacora-Inventario-App
npm ci
npm run verificar
npm run dev
```

Abre `http://localhost:5173` en un navegador con una wallet (Phantom, Solflare o Backpack) en **Devnet** y con SOL de prueba ([faucet](https://faucet.solana.com/)). No necesitas importar ningún IDL: ya está configurado. Cada wallet que crea un almacén queda como su autoridad; nadie más puede modificarlo.

### Opción B: desplegar tu propia copia del programa

Si quieres tu propio Program ID, sigue **[`docs/GUIA-DESPLIEGUE.md`](../docs/GUIA-DESPLIEGUE.md)** (Playground → exportar IDL → `npm run configurar:idl`).

> 🔐 La app nunca contiene ni pide claves privadas. La wallet que conectes será la autoridad de los almacenes que crees. Usa una wallet solo para pruebas.

## Pruebas y evidencias

- `npm run verificar`: typecheck, 14 pruebas automatizadas (semillas, serialización, decodificación de cuentas, validaciones, manejo de errores y contrato del IDL) y build. No envían transacciones.
- `programa/client/client.ts`: recorrido completo en Playground contra el programa desplegado, incluidos tres casos que deben rechazarse (salida mayor al stock, cantidad cero y folio repetido).
- [`docs/PRUEBAS-MANUALES.md`](../docs/PRUEBAS-MANUALES.md): recorrido manual desde la app.
- Transacción y cuentas verificables en la tabla de evidencia on-chain.

## Mi aporte

La base de partida era un registro de ventas con tres cuentas (negocio, cliente y venta). Lo convertí en una **bitácora de inventario** y los cambios principales son estos:

- **Nuevo modelo de datos:** `Almacen → Articulo → Movimiento`, con PDAs jerárquicas (`["almacen", nombre, owner]`, `["articulo", almacen, id]`, `["movimiento", articulo, folio]`). La pertenencia entre cuentas queda garantizada por las seeds.
- **Stock calculado en el programa:** el cliente no puede escribir el stock; solo cambia con movimientos. Una entrada suma y una salida resta, usando aritmética verificada (`checked_add` y `checked_sub`).
- **Reglas de negocio on-chain:** se rechazan las cantidades en cero, las salidas, correcciones o anulaciones que dejarían el stock en negativo, y se imponen límites de capacidad con errores propios (`StockInsuficiente`, `CantidadInvalida`, `LimiteArticulos`, `LimiteMovimientos`, `Desbordamiento`, `NoOwner`).
- **Tipo de movimiento como `enum`** (`Entrada` o `Salida`) y fecha tomada del reloj de la red (`Clock`), no del cliente.
- **Corrección y anulación con ajuste de stock:** `corregir_cantidad` deshace el efecto anterior y aplica el nuevo; `anular_movimiento` revierte el efecto y cierra la cuenta.
- **Frontend adaptado:** nueva pantalla de bitácora (artículos, stock y tabla de movimientos), formularios, validaciones con los mismos límites que el programa y lectura de las tres cuentas.
- **Herramientas y pruebas:** validador de contrato de IDL para el nuevo modelo (acepta formato moderno y legacy), 14 pruebas automatizadas y un script de pruebas para Playground.
- **Documentación:** guía de despliegue, pruebas manuales y análisis de límites del diseño.

Límites que reconozco: la bitácora no es un historial permanente (anular cierra la cuenta y cada artículo admite 10 movimientos activos), hay una sola autoridad por almacén y el programa no está auditado. Están detallados en [`docs/SEGURIDAD-Y-ALCANCE.md`](../docs/SEGURIDAD-Y-ALCANCE.md).

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

Ejecuta TypeScript, las pruebas automatizadas y el build. Las pruebas **no envían transacciones**: completa el recorrido de [pruebas manuales](../docs/PRUEBAS-MANUALES.md) y ejecuta `programa/client/client.ts` en Playground.

## Si algo no funciona

| Situación | Qué revisar |
| --- | --- |
| La wallet no aparece | Abre la app en una pestaña normal con la extensión instalada. |
| Falta SOL de prueba | [Solana Faucet](https://faucet.solana.com/), red Devnet. |
| No aparece tu almacén | Nombre exacto y dirección de la autoridad: ambos forman la PDA. |
| No puedes repetir un folio | Cada artículo admite un solo movimiento activo por folio. |
| RPC con límite de uso | Espera, o configura otro endpoint de Devnet en `.env.local` (ver `.env.example`). |
| Cambiaste el IDL y falla la comprobación | `npm run cliente` y reinicia el servidor. |

Revisa [seguridad y alcance](../docs/SEGURIDAD-Y-ALCANCE.md) para conocer los límites del diseño.

## Origen

Parte de la estructura (frontend, scripts de IDL y cliente) proviene de la base educativa «Registro de Ventas» de WayLearn, adaptada aquí a un modelo de inventario.
