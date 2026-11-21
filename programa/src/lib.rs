use anchor_lang::prelude::*;

// En Solana Playground este valor se reemplaza solo al hacer "Build" (ver docs/GUIA-DESPLIEGUE.md).
// Si trabajas fuera de Playground, pega aqui el Program ID publico de tu despliegue.
declare_id!("11111111111111111111111111111111");

#[program]
pub mod bitacora_inventario {
    use super::*;

    /////////////////////////// INSTRUCCIONES ///////////////////////////

    /////////////////////////// Crear Almacen ///////////////////////////
    pub fn crear_almacen(context: Context<NuevoAlmacen>, nombre_almacen: String) -> Result<()> {
        context.accounts.almacen.set_inner(Almacen {
            owner: context.accounts.owner.key(), // wallet que firma: sera la autoridad del almacen
            nombre_almacen: nombre_almacen.clone(),
            articulos: Vec::new(), // Guarda las PDAs de los articulos, no los articulos completos
            id_counter: 0,         // Contador incremental: asigna el id de cada articulo
        });

        msg!("Almacen: {} creado exitosamente!", nombre_almacen);
        Ok(())
    }

    /////////////////////////// Crear Articulo ///////////////////////////
    pub fn crear_articulo(
        context: Context<NuevoArticulo>,
        nombre: String,
        unidad: String,
    ) -> Result<()> {
        let articulo_key = context.accounts.articulo.key(); // Se lee ANTES del &mut

        let almacen = &mut context.accounts.almacen;
        require!(
            almacen.articulos.len() < MAX_ARTICULOS,
            Errores::LimiteArticulos
        );

        let id_articulo = almacen.id_counter + 1;
        almacen.id_counter = id_articulo;
        almacen.articulos.push(articulo_key);

        context.accounts.articulo.set_inner(Articulo {
            id_articulo,
            nombre: nombre.clone(),
            unidad,
            stock: 0, // Todo articulo nace en cero: el stock solo cambia con movimientos
            movimientos: Vec::new(),
        });

        msg!("Articulo {} creado con id: {}", nombre, id_articulo);
        Ok(())
    }

    /////////////////////////// Registrar Movimiento ///////////////////////////
    // id_articulo y folio no se usan en el cuerpo: viajan al contexto para derivar y validar las cuentas.
    #[allow(unused_variables)]
    pub fn registrar_movimiento(
        context: Context<NuevoMovimiento>,
        id_articulo: u16,
        folio: String,
        tipo: TipoMovimiento,
        motivo: String,
        cantidad: u32,
    ) -> Result<()> {
        require!(cantidad > 0, Errores::CantidadInvalida);

        let movimiento_key = context.accounts.movimiento.key(); // Se lee ANTES del &mut
        let articulo = &mut context.accounts.articulo;
        require!(
            articulo.movimientos.len() < MAX_MOVIMIENTOS,
            Errores::LimiteMovimientos
        );

        // El stock se calcula aqui, en el programa: ningun cliente puede escribirlo directamente.
        articulo.stock = match tipo {
            TipoMovimiento::Entrada => articulo
                .stock
                .checked_add(cantidad)
                .ok_or(Errores::Desbordamiento)?,
            TipoMovimiento::Salida => articulo
                .stock
                .checked_sub(cantidad)
                .ok_or(Errores::StockInsuficiente)?,
        };
        articulo.movimientos.push(movimiento_key);

        context.accounts.movimiento.set_inner(Movimiento {
            folio,
            tipo,
            motivo,
            cantidad,
            fecha: Clock::get()?.unix_timestamp, // Hora de la red, no la del cliente
        });

        msg!(
            "Movimiento registrado para el articulo {}. Stock actual: {}",
            articulo.id_articulo,
            articulo.stock
        );
        Ok(())
    }

    /////////////////////////// Corregir Cantidad ///////////////////////////
    // Corrige un movimiento capturado con una cantidad equivocada y ajusta el stock en consecuencia.
    #[allow(unused_variables)]
    pub fn corregir_cantidad(
        context: Context<ModificarMovimiento>,
        id_articulo: u16,
        folio: String,
        nueva_cantidad: u32,
    ) -> Result<()> {
        require!(nueva_cantidad > 0, Errores::CantidadInvalida);

        let articulo = &mut context.accounts.articulo;
        let movimiento = &mut context.accounts.movimiento;
        let anterior = movimiento.cantidad;

        // Se deshace el efecto anterior y se aplica el nuevo, siempre con aritmetica verificada.
        articulo.stock = match movimiento.tipo {
            TipoMovimiento::Entrada => articulo
                .stock
                .checked_sub(anterior)
                .ok_or(Errores::StockInsuficiente)?
                .checked_add(nueva_cantidad)
                .ok_or(Errores::Desbordamiento)?,
            TipoMovimiento::Salida => articulo
                .stock
                .checked_add(anterior)
                .ok_or(Errores::Desbordamiento)?
                .checked_sub(nueva_cantidad)
                .ok_or(Errores::StockInsuficiente)?,
        };
        movimiento.cantidad = nueva_cantidad;

        msg!(
            "Cantidad del movimiento {} paso de {} a {}. Stock actual: {}",
            movimiento.folio,
            anterior,
            nueva_cantidad,
            articulo.stock
        );
        Ok(())
    }

    /////////////////////////// Anular Movimiento ///////////////////////////
    // El contexto lleva "close = owner": la cuenta del movimiento se cierra y su renta regresa al owner.
    #[allow(unused_variables)]
    pub fn anular_movimiento(
        context: Context<EliminarMovimiento>,
        id_articulo: u16,
        folio: String,
    ) -> Result<()> {
        let movimiento_key = context.accounts.movimiento.key(); // Se lee ANTES del &mut
        let articulo = &mut context.accounts.articulo;
        require!(
            articulo.movimientos.contains(&movimiento_key),
            Errores::MovimientoNoRegistrado
        );

        // Anular es deshacer el efecto del movimiento sobre el stock.
        let cantidad = context.accounts.movimiento.cantidad;
        articulo.stock = match context.accounts.movimiento.tipo {
            TipoMovimiento::Entrada => articulo
                .stock
                .checked_sub(cantidad)
                .ok_or(Errores::StockInsuficiente)?,
            TipoMovimiento::Salida => articulo
                .stock
                .checked_add(cantidad)
                .ok_or(Errores::Desbordamiento)?,
        };
        articulo.movimientos.retain(|&k| k != movimiento_key);

        msg!(
            "Movimiento anulado en el articulo {}. Stock actual: {}",
            articulo.id_articulo,
            articulo.stock
        );
        Ok(())
    }
}

/////////////////////////// Constantes ///////////////////////////
// Deben coincidir con los #[max_len] de las cuentas: definen el espacio reservado.
pub const MAX_ARTICULOS: usize = 10;
pub const MAX_MOVIMIENTOS: usize = 10;

/////////////////////////// Codigos de Error ///////////////////////////
#[error_code]
pub enum Errores {
    #[msg("Error, no eres el owner del almacen")]
    NoOwner,
    #[msg("Error, el movimiento no esta en la bitacora del articulo")]
    MovimientoNoRegistrado,
    #[msg("Error, la cantidad debe ser mayor a cero")]
    CantidadInvalida,
    #[msg("Error, stock insuficiente para realizar la operacion")]
    StockInsuficiente,
    #[msg("Error, la cantidad desborda el limite del stock")]
    Desbordamiento,
    #[msg("Error, el almacen alcanzo el limite de articulos")]
    LimiteArticulos,
    #[msg("Error, el articulo alcanzo el limite de movimientos activos")]
    LimiteMovimientos,
}

/////////////////////////// CUENTAS ///////////////////////////

/// Tipo de movimiento: una entrada suma al stock y una salida resta.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum TipoMovimiento {
    Entrada,
    Salida,
}

#[account]
#[derive(InitSpace)]
pub struct Almacen {
    pub owner: Pubkey,

    #[max_len(30)]
    pub nombre_almacen: String,

    #[max_len(10)] // Guarda PDAs (32 bytes c/u), no structs completos
    pub articulos: Vec<Pubkey>,

    pub id_counter: u16,
}

#[account]
#[derive(InitSpace)]
pub struct Articulo {
    pub id_articulo: u16,

    #[max_len(30)]
    pub nombre: String,

    #[max_len(10)]
    pub unidad: String, // pza, kg, caja...

    pub stock: u32,

    #[max_len(10)]
    pub movimientos: Vec<Pubkey>,
}

#[account]
#[derive(InitSpace)]
pub struct Movimiento {
    #[max_len(8)]
    pub folio: String,

    pub tipo: TipoMovimiento,

    #[max_len(50)]
    pub motivo: String,

    pub cantidad: u32,

    pub fecha: i64, // unix timestamp (segundos) tomado del Clock de la red
}

/////////////////////////// CONTEXTOS ///////////////////////////
/*
La jerarquia del modelo vive en las seeds:

    almacen    <- [b"almacen",    nombre_almacen, owner]
    articulo   <- [b"articulo",   almacen,  id_articulo]
    movimiento <- [b"movimiento", articulo, folio]

Cada cuenta se deriva de su padre, asi que la pertenencia queda garantizada por construccion.
"has_one = owner" cierra la cadena por arriba: quien firma debe ser el owner del almacen.
*/

/////////////////////////// Nuevo Almacen ///////////////////////////
#[derive(Accounts)]
#[instruction(nombre_almacen: String)]
pub struct NuevoAlmacen<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = Almacen::INIT_SPACE + 8,
        seeds = [b"almacen", nombre_almacen.as_bytes(), owner.key().as_ref()],
        bump
    )]
    pub almacen: Account<'info, Almacen>,

    pub system_program: Program<'info, System>,
}

/////////////////////////// Nuevo Articulo ///////////////////////////
#[derive(Accounts)]
pub struct NuevoArticulo<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(mut, has_one = owner @ Errores::NoOwner)]
    pub almacen: Account<'info, Almacen>,

    #[account(
        init,
        payer = owner,
        space = Articulo::INIT_SPACE + 8,
        // El id sale del contador del almacen: lo asigna el programa, nadie lo envia.
        seeds = [b"articulo", almacen.key().as_ref(), (almacen.id_counter + 1).to_le_bytes().as_ref()],
        bump
    )]
    pub articulo: Account<'info, Articulo>,

    pub system_program: Program<'info, System>,
}

/////////////////////////// Nuevo Movimiento ///////////////////////////
#[derive(Accounts)]
#[instruction(id_articulo: u16, folio: String)]
pub struct NuevoMovimiento<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(has_one = owner @ Errores::NoOwner)]
    pub almacen: Account<'info, Almacen>, // Sin mut: solo se lee para derivar el articulo

    #[account(
        mut,
        seeds = [b"articulo", almacen.key().as_ref(), id_articulo.to_le_bytes().as_ref()],
        bump
    )]
    pub articulo: Account<'info, Articulo>,

    #[account(
        init,
        payer = owner,
        space = Movimiento::INIT_SPACE + 8,
        // El folio entra en las seeds: un articulo no puede repetir el mismo folio
        seeds = [b"movimiento", articulo.key().as_ref(), folio.as_bytes()],
        bump
    )]
    pub movimiento: Account<'info, Movimiento>,

    pub system_program: Program<'info, System>,
}

/////////////////////////// Modificar Movimiento ///////////////////////////
#[derive(Accounts)]
#[instruction(id_articulo: u16, folio: String)]
pub struct ModificarMovimiento<'info> {
    pub owner: Signer<'info>,

    #[account(has_one = owner @ Errores::NoOwner)]
    pub almacen: Account<'info, Almacen>,

    #[account(
        mut, // el stock cambia al corregir la cantidad
        seeds = [b"articulo", almacen.key().as_ref(), id_articulo.to_le_bytes().as_ref()],
        bump
    )]
    pub articulo: Account<'info, Articulo>,

    #[account(
        mut,
        seeds = [b"movimiento", articulo.key().as_ref(), folio.as_bytes()],
        bump
    )]
    pub movimiento: Account<'info, Movimiento>,
}

/////////////////////////// Eliminar Movimiento ///////////////////////////
#[derive(Accounts)]
#[instruction(id_articulo: u16, folio: String)]
pub struct EliminarMovimiento<'info> {
    #[account(mut)]
    pub owner: Signer<'info>, // mut: recibe la renta de la cuenta cerrada

    #[account(has_one = owner @ Errores::NoOwner)]
    pub almacen: Account<'info, Almacen>,

    #[account(
        mut,
        seeds = [b"articulo", almacen.key().as_ref(), id_articulo.to_le_bytes().as_ref()],
        bump
    )]
    pub articulo: Account<'info, Articulo>,

    #[account(
        mut,
        close = owner,
        seeds = [b"movimiento", articulo.key().as_ref(), folio.as_bytes()],
        bump
    )]
    pub movimiento: Account<'info, Movimiento>,
}
