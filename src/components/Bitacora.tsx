import { useEffect, useRef, useState } from 'react';
import { address } from '@solana/kit';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import programa from '../config/programa.json';
import { ALMACEN_INICIAL, UNIDAD_INICIAL } from '../config/interfaz';
import { leerAlmacen, type AlmacenUI } from '../solana/lecturas';
import { almacenValido } from '../solana/validaciones';
import { ErrorTransaccion, ErrorConfirmacionPendiente, enlaceTransaccion, traducir, type OpcionesEnvio } from '../solana/tx';
import { crearAlmacen, crearArticulo, registrarMovimiento, corregirCantidad, anularMovimiento } from '../solana/acciones';

type Operacion = 'almacen' | 'articulo' | 'movimiento' | 'correccion' | 'anulacion';
const operaciones: { id: Operacion; texto: string }[] = [
  { id: 'almacen', texto: 'Crear almacén' }, { id: 'articulo', texto: 'Crear artículo' },
  { id: 'movimiento', texto: 'Registrar movimiento' }, { id: 'correccion', texto: 'Corregir cantidad' },
  { id: 'anulacion', texto: 'Anular movimiento' },
];

export function Bitacora({ onCambio, onOcupado }: { onCambio: () => void; onOcupado: (valor: boolean) => void }) {
  const wallet = useWallet();
  const { connection } = useConnection();
  const walletDireccion = wallet.publicKey?.toBase58() ?? '';
  const [almacenNombre, setAlmacenNombre] = useState(ALMACEN_INICIAL);
  const [autoridad, setAutoridad] = useState(walletDireccion);
  const [almacen, setAlmacen] = useState<AlmacenUI | null>(null);
  const [consultado, setConsultado] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [errorLectura, setErrorLectura] = useState('');
  const [op, setOp] = useState<Operacion>('almacen');
  const [nombre, setNombre] = useState('Tornillo 1/4');
  const [unidad, setUnidad] = useState(UNIDAD_INICIAL);
  const [idArticulo, setIdArticulo] = useState('1');
  const [folio, setFolio] = useState('E-0001');
  const [tipo, setTipo] = useState<'entrada' | 'salida'>('entrada');
  const [motivo, setMotivo] = useState('Compra a proveedor');
  const [cantidad, setCantidad] = useState('100');
  const [ocupado, setOcupado] = useState(false);
  const [fase, setFase] = useState('');
  const [firma, setFirma] = useState('');
  const [firmaFallida, setFirmaFallida] = useState('');
  const [errorOperacion, setErrorOperacion] = useState('');
  const [aviso, setAviso] = useState('');
  const contexto = useRef('');
  const secuencia = useRef(0);
  contexto.current = almacenNombre + '|' + autoridad;

  useEffect(() => { setAutoridad(walletDireccion); }, [walletDireccion]);
  useEffect(() => {
    secuencia.current += 1; setAlmacen(null); setConsultado(false); setErrorLectura('');
    setLeyendo(false); setFirma(''); setFirmaFallida(''); setErrorOperacion(''); setAviso('');
  }, [almacenNombre, autoridad]);
  useEffect(() => { onOcupado(ocupado); return () => onOcupado(false); }, [ocupado, onOcupado]);

  async function cargar(nombreAlmacen = almacenNombre, owner = autoridad) {
    const clave = nombreAlmacen + '|' + owner;
    const turno = ++secuencia.current;
    setLeyendo(true); setErrorLectura('');
    try {
      const datos = await leerAlmacen(almacenValido(nombreAlmacen), address(owner.trim()));
      if (turno === secuencia.current && contexto.current === clave) { setAlmacen(datos); setConsultado(true); }
    } catch (error) {
      if (turno === secuencia.current) setErrorLectura(traducir(error));
      throw error;
    } finally { if (turno === secuencia.current) setLeyendo(false); }
  }

  async function ejecutar(evento: React.FormEvent) {
    evento.preventDefault();
    setOcupado(true); setFase('Preparando operación…'); setFirma(''); setFirmaFallida(''); setErrorOperacion(''); setAviso('');
    const nombreAlmacen = almacenNombre.trim();
    const direccionWallet = walletDireccion;
    const opciones: OpcionesEnvio = { onEstado: (estado) => setFase(estado === 'firma' ? 'Revisa la solicitud en tu wallet…' : 'Esperando confirmación de la red…') };
    try {
      const id = Number(idArticulo), unidades = Number(cantidad);
      let resultado: string;
      switch (op) {
        case 'almacen': resultado = await crearAlmacen(wallet, connection, nombreAlmacen, opciones); break;
        case 'articulo': resultado = await crearArticulo(wallet, connection, nombreAlmacen, nombre, unidad, opciones); break;
        case 'movimiento': resultado = await registrarMovimiento(wallet, connection, nombreAlmacen, id, folio, tipo, motivo, unidades, opciones); break;
        case 'correccion': resultado = await corregirCantidad(wallet, connection, nombreAlmacen, id, folio, unidades, opciones); break;
        case 'anulacion': resultado = await anularMovimiento(wallet, connection, nombreAlmacen, id, folio, opciones); break;
      }
      setFirma(resultado); setFase('Operación confirmada correctamente.'); onCambio();
      try { await cargar(nombreAlmacen, direccionWallet); }
      catch { setAviso('La operación se confirmó, pero no pudimos actualizar los datos. Pulsa Consultar almacén para volver a leerlos.'); }
    } catch (error) {
      setFase(''); setErrorOperacion(traducir(error));
      if (error instanceof ErrorTransaccion || error instanceof ErrorConfirmacionPendiente) setFirmaFallida(error.firma);
    } finally { setOcupado(false); }
  }

  const esOtraAutoridad = !!autoridad.trim() && autoridad.trim() !== walletDireccion;
  const permiteEscribir = !programa.esReferencia && !!wallet.publicKey && !esOtraAutoridad;
  const fechaCorta = (fecha: Date) => fecha.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
  return <>
    <div className="section-heading"><div><p className="eyebrow">ALMACÉN · ARTÍCULOS · MOVIMIENTOS</p><h2>Tu bitácora de inventario</h2></div><span className="tag">Cuentas independientes</span></div>
    {programa.esReferencia && <aside className="notice information"><strong>Configura tu programa para comenzar.</strong><p>La aplicación incluye un IDL de ejemplo con una dirección marcador. Despliega tu programa en Devnet e importa su IDL para consultar el almacén y realizar operaciones (consulta docs/GUIA-DESPLIEGUE.md). Las lecturas de saldo ya están disponibles en Conexión.</p></aside>}
    <section className="panel lookup-panel">
      <div className="panel-heading"><h3>Localizar el almacén</h3><span className="small-note">Lectura sin firma</span></div>
      <div className="lookup-fields"><label>Nombre exacto del almacén<input value={almacenNombre} disabled={ocupado} onChange={(e) => setAlmacenNombre(e.target.value)} placeholder="Almacen Central" /></label>
      <label>Dirección de la autoridad<input value={autoridad} disabled={ocupado} onChange={(e) => setAutoridad(e.target.value)} placeholder="Conecta tu wallet o pega una dirección pública" spellCheck={false} autoComplete="off" /></label>
      <button className="button secondary" disabled={leyendo || ocupado || programa.esReferencia || !almacenNombre.trim() || !autoridad.trim()} onClick={() => void cargar().catch(() => {})}>{leyendo ? 'Consultando…' : 'Consultar almacén'}</button></div>
      <p className="help">El nombre y la autoridad determinan la dirección del almacén. Puedes consultar otra autoridad en modo lectura.</p>
      {errorLectura && <p className="notice error" role="alert">{errorLectura}</p>}
    </section>
    <div className="workspace-grid">
      <section className="panel customers-panel"><div className="panel-heading"><h3>Artículos y movimientos</h3>{almacen && <span className="count">{almacen.articulos.length} artículos</span>}</div>
        {!almacen ? <div className="empty-state"><span className="empty-symbol">◎</span><h4>{consultado ? 'El almacén todavía no existe' : 'El almacén aparecerá aquí'}</h4><p>{consultado ? 'Comprueba el nombre y la autoridad, o crea un almacén con tu wallet conectada.' : 'Consulta el almacén para ver sus artículos, su stock y la bitácora de movimientos de cada uno.'}</p></div> : <>
          <div className="registry-summary"><div><span className="label">Almacén</span><strong>{almacen.nombreAlmacen}</strong></div><div><span className="label">Último ID asignado</span><strong>{almacen.idCounter}</strong></div></div>
          <details className="technical-details"><summary>Dirección del almacén</summary><code className="address">{almacen.direccion}</code></details>
          {almacen.articulos.length === 0 ? <p className="empty-line">Todavía no hay artículos. Puedes crear el primero desde Operaciones.</p> : almacen.articulos.map((articulo) => <article className="customer" key={articulo.direccion}>
            <header><div><strong>{articulo.nombre}</strong><span className="small-note">Artículo #{articulo.idArticulo} · Stock: {articulo.stock.toLocaleString('es-MX')} {articulo.unidad} · {articulo.movimientos.length} movimientos activos</span></div><button className="text-button" disabled={ocupado} onClick={() => { setIdArticulo(String(articulo.idArticulo)); setOp('movimiento'); }}>Seleccionar</button></header>
            {articulo.movimientos.length === 0 ? <p className="empty-line">Sin movimientos activos.</p> : <div className="table-wrap"><table><thead><tr><th>Folio</th><th>Tipo</th><th>Motivo</th><th>Fecha</th><th className="numeric">Cantidad</th></tr></thead><tbody>{articulo.movimientos.map((mov) => <tr key={mov.direccion} onClick={() => { if (!ocupado) { setIdArticulo(String(articulo.idArticulo)); setFolio(mov.folio); setCantidad(String(mov.cantidad)); setOp('correccion'); } }}><td><code>{mov.folio}</code></td><td>{mov.tipo === 'entrada' ? '▲ Entrada' : '▼ Salida'}</td><td>{mov.motivo}</td><td>{fechaCorta(mov.fecha)}</td><td className="numeric">{mov.tipo === 'entrada' ? '+' : '−'}{mov.cantidad.toLocaleString('es-MX')} <small>{articulo.unidad}</small></td></tr>)}</tbody></table></div>}
          </article>)}
        </>}
      </section>
      <section className="panel operations-panel"><div className="panel-heading"><h3>Operaciones</h3><span className="small-note">Con firma</span></div>
        <div className="operation-tabs">{operaciones.map((item) => <button key={item.id} className={op === item.id ? 'active' : ''} disabled={ocupado} onClick={() => { setOp(item.id); setFirma(''); setErrorOperacion(''); setFirmaFallida(''); setFase(''); }}>{item.texto}</button>)}</div>
        <form onSubmit={ejecutar}>
          <fieldset disabled={ocupado || !permiteEscribir}>
            {op === 'almacen' && <p className="help">Crearás el almacén <strong>{almacenNombre || 'tu almacén'}</strong> con la wallet conectada como autoridad.</p>}
            {op === 'articulo' && <div className="two-fields"><label>Nombre del artículo<input value={nombre} onChange={(e) => setNombre(e.target.value)} required /></label><label>Unidad<input value={unidad} onChange={(e) => setUnidad(e.target.value)} placeholder="pza, kg, caja" required /></label></div>}
            {op === 'articulo' && <p className="help">El artículo nace con stock 0. El stock solo cambia con movimientos.</p>}
            {(op === 'movimiento' || op === 'correccion' || op === 'anulacion') && <div className="two-fields"><label>ID del artículo<input type="number" min="1" max="65535" step="1" value={idArticulo} onChange={(e) => setIdArticulo(e.target.value)} required /></label><label>Folio<input value={folio} onChange={(e) => setFolio(e.target.value)} required /></label></div>}
            {op === 'movimiento' && <div className="two-fields"><label>Tipo<select value={tipo} onChange={(e) => setTipo(e.target.value as 'entrada' | 'salida')}><option value="entrada">Entrada (suma al stock)</option><option value="salida">Salida (resta del stock)</option></select></label><label>Cantidad<input type="number" min="1" max="4294967295" step="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} required /></label></div>}
            {op === 'movimiento' && <label>Motivo<input value={motivo} onChange={(e) => setMotivo(e.target.value)} required /></label>}
            {op === 'correccion' && <label>Nueva cantidad<input type="number" min="1" max="4294967295" step="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} required /><span className="help">El programa recalcula el stock. Se rechaza si el stock resultante sería negativo.</span></label>}
            {op === 'anulacion' && <p className="notice subtle">Esta operación revierte el efecto del movimiento sobre el stock, lo quita de la bitácora y cierra su cuenta. Se rechaza si el stock resultante sería negativo.</p>}
            <button className="button primary" type="submit" disabled={!almacenNombre.trim()}>{ocupado ? 'Operación en curso…' : operaciones.find((item) => item.id === op)!.texto}</button>
          </fieldset>
        </form>
        {!wallet.publicKey && <p className="help">Conecta tu wallet de práctica para realizar operaciones.</p>}
        {esOtraAutoridad && wallet.publicKey && <p className="notice subtle">Estás consultando otra autoridad. Para escribir, utiliza el almacén de la wallet conectada.</p>}
        {ocupado && <p className="notice information" role="status">{fase}</p>}
        {firma && <p className="notice success" role="status"><strong>Operación confirmada.</strong><br/><a href={enlaceTransaccion(firma)} target="_blank" rel="noreferrer">Ver transacción en Explorer</a></p>}
        {errorOperacion && <p className="notice error" role="alert">{errorOperacion}{firmaFallida && <><br/><a href={enlaceTransaccion(firmaFallida)} target="_blank" rel="noreferrer">Revisar transacción en Explorer</a></>}</p>}
        {aviso && <p className="notice subtle">{aviso}</p>}
      </section>
    </div>
  </>;
}
