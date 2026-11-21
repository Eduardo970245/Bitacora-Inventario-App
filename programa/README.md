# Programa `bitacora_inventario` (Anchor)

- `src/lib.rs`: programa para pegar en Solana Playground. Tres cuentas (Almacén, Artículo, Movimiento) y cinco instrucciones.
- `client/client.ts`: script de prueba para el Playground. Recorre todo el flujo, incluidos los casos que deben rechazarse.

Esta carpeta no es un workspace Anchor CLI completo. `declare_id!` trae el marcador `1111…` que Playground reemplaza por el Program ID real al compilar (ver `docs/GUIA-DESPLIEGUE.md`).

## Modelo

| Cuenta | Seeds | Campos |
| --- | --- | --- |
| `Almacen` | `["almacen", nombre, owner]` | owner, nombre_almacen, articulos (PDAs), id_counter |
| `Articulo` | `["articulo", almacen, id_articulo u16 LE]` | id_articulo, nombre, unidad, stock, movimientos (PDAs) |
| `Movimiento` | `["movimiento", articulo, folio]` | folio, tipo (Entrada/Salida), motivo, cantidad, fecha |

| Instrucción | Efecto |
| --- | --- |
| `crear_almacen(nombre_almacen)` | Crea el almacén; quien firma es el owner. |
| `crear_articulo(nombre, unidad)` | Crea un artículo con stock 0 y asigna su id. |
| `registrar_movimiento(id_articulo, folio, tipo, motivo, cantidad)` | Crea el movimiento y suma o resta el stock. |
| `corregir_cantidad(id_articulo, folio, nueva_cantidad)` | Cambia la cantidad y recalcula el stock. |
| `anular_movimiento(id_articulo, folio)` | Revierte el efecto en el stock y cierra la cuenta del movimiento. |

Reglas que impone el programa (no solo el frontend): solo el owner opera su almacén; la cantidad debe ser mayor que cero; una salida o corrección no puede dejar el stock en negativo; el stock usa aritmética verificada; máximo 10 artículos por almacén y 10 movimientos activos por artículo.
