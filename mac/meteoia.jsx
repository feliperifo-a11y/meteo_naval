// MeteoIA · widget de escritorio para macOS (Übersicht)
// Pronóstico WRF + IA de 3 días y observación actual de la bahía elegida. Se actualiza cada 10 minutos.
// Clic en el widget: abre el pronóstico completo en meteoia.cl.
import { React, run } from "uebersicht";

// ---- Configuración ----
const BAHIA = "VALPARAISO_centro_d08";   // código del meteograma (ver meteoia.cl/ia.html)
const ESTACION = "VALPARAISO";           // código de la estación de observación
const NOMBRE = "Valparaíso";
const SITIO = "https://meteoia.cl";

export const command = `curl -fsS --max-time 20 "${SITIO}/data/wrf_ia.json?t=$(date +%s)"; echo "@@SEP@@"; curl -fsS --max-time 20 "${SITIO}/data/estaciones.json?t=$(date +%s)"`;
export const refreshFrequency = 10 * 60 * 1000;
export const className = `
  top: 44px; left: 20px;
  font-family: -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif;
  color: #fff; user-select: none;
`;

const SOL = '<circle cx="12" cy="12" r="5" fill="#f2b705"/><g stroke="#f2b705" stroke-width="2" stroke-linecap="round"><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></g>';
const ICO = {
  Despejado: SOL,
  Parcial: '<circle cx="9" cy="9" r="4.5" fill="#f2b705"/><path d="M8 20h10a4 4 0 0 0 .5-8 5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 8 20Z" fill="#dfe5ea"/>',
  Nublado: '<path d="M6 19h12a4.5 4.5 0 0 0 .6-9 6 6 0 0 0-11.5 1.6A3.8 3.8 0 0 0 6 19Z" fill="#cfd8e3"/>',
  Cubierto: '<path d="M4 15h10a3.5 3.5 0 0 0 .4-7 4.7 4.7 0 0 0-9 1.3A2.9 2.9 0 0 0 4 15Z" fill="#a9b3bd"/><path d="M8 21h11a4 4 0 0 0 .5-8 5.3 5.3 0 0 0-10.2 1.4A3.3 3.3 0 0 0 8 21Z" fill="#8a96a3"/>',
};
const Icono = ({ n }) => <svg width="30" height="30" viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: ICO[n] || ICO.Nublado }} />;

const hoyChile = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
const sumar = (f, n) => { const d = new Date(f + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const etiqueta = (f, i) => i === 0 ? "Hoy" : new Date(f + "T12:00:00").toLocaleDateString("es-CL", { weekday: "short" }).replace(".", "").replace(/^\w/, c => c.toUpperCase());
const vientoCorto = t => { const s = String(t || ""), m = s.match(/[NSEW]{1,3}(?:\/[NSEW]{1,3})?\s*\d+(?:\/\d+)?\s*kt/i); return m ? m[0] : (/calma/i.test(s) ? "Calma" : s.split(",")[0].slice(0, 16) || "–"); };
const nf = (v, d = 1) => v == null || v === "" || isNaN(+v) ? "–" : (+v).toLocaleString("es-CL", { minimumFractionDigits: d, maximumFractionDigits: d });
const cardinal = g => ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"][Math.round(((+g % 360) + 360) % 360 / 22.5) % 16];

const datos = output => {
  const [a, b] = String(output || "").split("@@SEP@@");
  const ia = JSON.parse(a), est = JSON.parse(b);
  const bahia = (ia.bahias || []).find(x => x.codigo === BAHIA) || {};
  const p = bahia.pronostico || {}, hoy = hoyChile();
  const dias = [0, 1, 2].map(i => { const f = sumar(hoy, i); return { f, i, d: (p.dias || []).find(x => x.fecha === f) }; });
  const obs = (est.datos || est || []).find(x => x.codigo === ESTACION) || null;
  const m = String(p.inicializacion_utc || "").match(/(\d{4})-(\d{2})-(\d{2})T?(\d{2})/);
  return { dias, obs, corrida: m ? `${m[3]}/${m[2]} ${m[4]}Z` : "" };
};

const abrir = () => run(`open "${SITIO}/ia.html?bahia=${BAHIA}"`);

const tarjeta = {
  width: 364, height: 170, color: "#fff", boxSizing: "border-box", padding: "14px 16px", borderRadius: 22, cursor: "pointer",
  background: "linear-gradient(165deg, rgba(23,58,99,.92), rgba(15,42,68,.92))",
  boxShadow: "0 10px 30px rgba(0,0,0,.35)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
};
const sub = { fontSize: 11.5, opacity: 0.8 };
const mn = { color: "#9fc9ff", fontWeight: 600 }, mx = { color: "#ffb4a6", fontWeight: 600 };

export const render = ({ output, error }) => {
  let v = null;
  try { if (!error) v = datos(output); } catch (e) { v = null; }
  if (!v) return <div style={tarjeta} onClick={abrir}><b>MeteoIA</b><div style={Object.assign({}, sub, { marginTop: 8 })}>Sin conexión con meteoia.cl. Se reintenta en 10 minutos.</div></div>;
  const o = v.obs;
  const ahora = o ? `Ahora: ${o.viento != null && o.direccionViento !== "---" ? `${cardinal(o.viento)} ${nf(o.velocidadDelViento)} kt · ` : ""}${nf(o.temperatura)} °C · ${String(o.fecha || "").slice(11, 16)}` : "";
  return (
    <div style={tarjeta} onClick={abrir} title="Abrir pronóstico completo en meteoia.cl">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, opacity: 0.9 }}>
          <img src={`${SITIO}/app/ic-192.png`} style={{ width: 16, height: 16, borderRadius: 4 }} />MeteoIA · WRF + IA
        </div>
        <div style={sub}>{v.corrida && `corrida ${v.corrida}`}</div>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, marginTop: 3 }}>{NOMBRE}</div>
      <div style={sub}>{ahora}</div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        {v.dias.map(({ f, i, d }) => (
          <div key={f} style={{ width: "31%", textAlign: "center", fontSize: 12 }}>
            <b style={{ display: "block", fontSize: 12.5, marginBottom: 1 }}>{etiqueta(f, i)}</b>
            {d ? <div>
              <Icono n={d.nubosidad} />
              <div><span style={mn}>{d.temp_min != null ? Math.round(d.temp_min) + "°" : "–"}</span> / <span style={mx}>{d.temp_max != null ? Math.round(d.temp_max) + "°" : "–"}</span></div>
              <div style={sub}>{vientoCorto(d.viento)}</div>
            </div> : <div style={Object.assign({}, sub, { marginTop: 10 })}>sin datos</div>}
          </div>
        ))}
      </div>
    </div>
  );
};
