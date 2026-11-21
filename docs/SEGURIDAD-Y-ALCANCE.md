# Seguridad y alcance

## Controles del programa

- `Signer` exige firma y `has_one = owner` comprueba que quien firma sea la autoridad del almacén en todas las instrucciones.
- Las seeds enlazan Almacén → Artículo → Movimiento: la pertenencia queda garantizada por construcción.
- El **stock solo lo modifica el programa**, nunca un argumento del cliente. Entradas, salidas, correcciones y anulaciones usan aritmética verificada (`checked_add`/`checked_sub`) y se rechazan si el resultado sería negativo o desbordaría `u32`.
- La cantidad debe ser mayor que cero. Los límites de capacidad (10 artículos por almacén, 10 movimientos activos por artículo) devuelven errores propios.
- La fecha de cada movimiento viene del reloj de la red (`Clock`), no del cliente.
- `anular_movimiento` revierte el efecto en el stock antes de cerrar la cuenta y devuelve la renta al owner.

## Controles del frontend

- Validación de texto en bytes UTF-8 y de enteros positivos, con los mismos máximos que el programa.
- Coherencia entre IDL, Program ID y cliente generado; bloqueo de escrituras mientras el IDL tenga la dirección marcador.
- Comprobación del genesis de Devnet y de que el programa esté desplegado antes de pedir la firma.
- Bloqueo del formulario al consultar otra autoridad.
- No se guardan claves privadas ni se pide la frase de recuperación.

Un cliente distinto puede saltarse las validaciones del frontend, por eso las reglas de negocio importantes viven también en el programa.

## Límites del diseño (importante)

- **La bitácora no es un historial permanente.** `anular_movimiento` cierra la cuenta del movimiento y lo quita del índice, y cada artículo admite solo 10 movimientos activos. Para un historial ilimitado e inmutable habría que dejar de anular (registrar un movimiento contrario), usar un contador en lugar de un folio como seed y no guardar un `Vec` de movimientos, o emitir eventos con `emit!` y leerlos con un indexador.
- Una sola autoridad por almacén; no hay roles (almacenista, supervisor, auditor).
- `corregir_cantidad` permite reescribir un movimiento ya registrado: es útil para capturar errores, pero para auditoría real conviene eliminarlo y dejar solo anulaciones.
- El contador de artículos se calcula a partir del estado: dos transacciones simultáneas de creación podrían chocar (una falla).
- Sin privacidad: todo lo que se guarda en cuentas de Solana es público.
- El programa no se ha auditado ni probado con herramientas de pruebas Rust; la validación disponible es `programa/client/client.ts` en Playground y las pruebas manuales.

## Antes de producción

Cambiar de Devnet a mainnet implica dinero real: pruebas automatizadas del programa (por ejemplo con `anchor test` o LiteSVM), revisión de seguridad, decidir quién conserva la *upgrade authority* (o renunciar a ella), manejo de concurrencia y un indexador para consultas de historial.
