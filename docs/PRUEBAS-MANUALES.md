# Pruebas manuales en Devnet

Requisitos: programa desplegado, IDL importado (`docs/GUIA-DESPLIEGUE.md`), `npm run verificar` en verde, wallet del navegador en Devnet con SOL de prueba y la app abierta en una pestaña normal.

Usa un **nombre de almacén nuevo** (hasta 30 bytes UTF-8) para cada recorrido completo.

| Caso | Resultado esperado |
| --- | --- |
| Consultar saldo sin conectar wallet | Lectura pública; ninguna firma. |
| Pegar una dirección inválida | Error comprensible; la página sigue operativa. |
| Crear almacén | Confirmación; «Consultar almacén» lo muestra con 0 artículos. |
| Crear artículo «Tornillo 1/4», unidad pza | Artículo #1 con stock 0. |
| Entrada E-0001 de 100 | Stock 100; movimiento visible con fecha. |
| Salida S-0001 de 30 | Stock 70. |
| Salida S-0002 de 1000 | Rechazo `StockInsuficiente`; el stock no cambia. |
| Repetir el folio E-0001 | Rechazo (la cuenta ya existe); no se duplica el movimiento. |
| Corregir S-0001 a 40 | Stock 60; mismo folio y misma cuenta. |
| Corregir S-0001 a 500 | Rechazo `StockInsuficiente`. |
| Cancelar una solicitud en la wallet | Aviso de cancelación; no se anuncia éxito. |
| Anular S-0001 | Stock 100; el movimiento desaparece de la lista. |
| Anular E-0001 con stock en 100 y sin otras salidas | Stock 0; la entrada desaparece. |
| Registrar S-0001 otra vez | Se puede crear de nuevo porque la cuenta anterior se cerró. |
| Crear 11 artículos | El undécimo se rechaza: la app avisa antes de firmar y el programa responde `LimiteArticulos` si se le llama directo. |
| Registrar un 11.º movimiento activo en un artículo | Se rechaza (`LimiteMovimientos`). |
| Consultar otra autoridad | Lectura permitida; formularios de escritura deshabilitados. |

El bloqueo visual de otra autoridad no demuestra el control onchain. Para comprobarlo, ejecuta en Playground una instrucción firmada por una wallet que no sea la autoridad y verifica que el programa responda `NoOwner`.

## Estados de error que conviene entender

- Un fallo de preflight puede detectarse antes de enviar la transacción: no siempre habrá una transacción fallida en Explorer.
- Una firma enviada no equivale a ejecución exitosa; la confirmación incluye `err`.
- Si se pierde la confirmación, revisa la firma en Explorer antes de repetir la operación.
- Un fallo de lectura después de confirmar no revierte la operación.

## Evidencia

Guarda el Program ID, las direcciones públicas de las cuentas, las firmas de las transacciones y el resultado esperado frente al observado. No incluyas claves privadas ni frases de recuperación.
