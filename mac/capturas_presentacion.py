#!/usr/bin/env python3
"""Capturas reales de meteoia.cl para la presentación al MRCC → ~/Desktop/capturas_meteoia.zip

Uso (Mac, entorno ~/meteoia-ml con Playwright ya instalado):
  ~/meteoia-ml/bin/python capturas_presentacion.py [clave_de_desarrollo]
Solo lee el sitio: no modifica nada. El caso SAR de ejemplo queda solo en el navegador temporal de la captura.
"""
import json
import sys
import zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright

import os
BASE = os.environ.get("MN_BASE", "https://meteoia.cl/")
OUT = Path.home() / "meteoia-ml" / "presentacion"
OUT.mkdir(parents=True, exist_ok=True)
for f in OUT.glob("*"):
    if f.is_file():
        f.unlink()
CLAVE = sys.argv[1] if len(sys.argv) > 1 else None
log, cajas = [], {}


def paso(n, f):
    try:
        f(); log.append("ok " + n); print("ok", n, flush=True)
    except Exception as e:  # noqa: BLE001
        log.append(f"error {n}: {e!r}"[:300]); print("error", n, repr(e)[:200], flush=True)


def caja(pg, sel):
    return pg.evaluate("s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + scrollX, r.y + scrollY, r.width, r.height]; }", sel)


def desbloquear(pg):
    """Si Desarrollo pide clave (StatiCrypt), la ingresa."""
    if pg.locator("#staticrypt-password, input[type=password]").count():
        if not CLAVE:
            raise RuntimeError("Desarrollo pide clave: ejecuta el comando con la clave como argumento")
        pg.fill("#staticrypt-password, input[type=password]", CLAVE)
        pg.keyboard.press("Enter")
        pg.wait_for_timeout(5000)


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1920, "height": 1080}, device_scale_factor=2, locale="es-CL", timezone_id="America/Santiago")
    pg = ctx.new_page()
    J = lambda n, **k: pg.screenshot(path=str(OUT / n), type="jpeg", quality=90, **k)

    # ---------------- Portada
    paso("portada carga", lambda: (pg.goto(BASE + "?sinvideo", wait_until="networkidle", timeout=90000), pg.wait_for_timeout(10000)))
    paso("01_portada", lambda: J("01_portada.jpg"))

    def capas():
        pg.click("#btnCapas"); pg.wait_for_timeout(1200); J("02_capas.jpg")
        cajas["capasPop"] = caja(pg, "#capasPop"); pg.click("#btnCapas"); pg.wait_for_timeout(600)
    paso("02_capas", capas)

    def mapa_centro():
        pg.evaluate("map.setView([-34, -73.5], 6)"); pg.wait_for_timeout(8000); J("03_mapa_centro.jpg")
        pg.evaluate("map.setView([-40, -76], 4.6)"); pg.wait_for_timeout(8000); J("04_mapa_general.jpg")
    paso("03_mapa", mapa_centro)

    def paneles():
        pg.goto(BASE + "?sinvideo", wait_until="networkidle", timeout=90000); pg.wait_for_timeout(9000)
        for k, s in (("alertas", "#alertas"), ("puertos", "#estadoPuertos"), ("estaciones", "#estaciones"), ("condiciones", "#cond"), ("pronostico", "#pronostico")):
            try:
                loc = pg.locator(s).first
                anc = loc.locator("xpath=ancestor-or-self::section[1]")
                if anc.count():
                    loc = anc.first
                loc.scroll_into_view_if_needed(); pg.wait_for_timeout(1200)
                loc.screenshot(path=str(OUT / f"sec_{k}.jpg"), type="jpeg", quality=90); log.append("ok sec_" + k)
            except Exception as e:  # noqa: BLE001
                log.append(f"error sec_{k}: {e!r}"[:200])
        pg.evaluate("scrollTo(0, 0)"); pg.wait_for_timeout(1000)
        J("05_portada_completa.jpg", full_page=True)
    paso("paneles", paneles)

    # ---------------- WRF + IA por bahía (con verificación)
    def wrfia():
        pg.goto(BASE + "wrfia.html", wait_until="networkidle", timeout=90000); pg.wait_for_timeout(8000)
        try:
            pg.locator("button", has_text="Valparaíso").first.click(); pg.wait_for_timeout(2500)
        except Exception:  # noqa: BLE001
            pass
        J("06_wrfia.jpg")
    paso("06_wrfia", wrfia)

    # ---------------- Desarrollo: control de calidad y caso SAR
    ctx2 = b.new_context(viewport={"width": 1920, "height": 1080}, device_scale_factor=2, locale="es-CL", timezone_id="America/Santiago")
    pd = ctx2.new_page()
    K = lambda n, **k: pd.screenshot(path=str(OUT / n), type="jpeg", quality=90, **k)

    def desarrollo():
        pd.goto(BASE + "dashboard.html", wait_until="networkidle", timeout=90000); pd.wait_for_timeout(3000)
        desbloquear(pd); pd.wait_for_timeout(6000)
    paso("desarrollo carga", desarrollo)

    def qc():
        pd.click("#btnQC"); pd.wait_for_timeout(4000); K("07_control_calidad.jpg")
        pd.locator("#qcEstaciones .mar-cerrar").click(); pd.wait_for_timeout(800)
    paso("07_control_calidad", qc)

    def sar():
        pd.click("#btnCasoSAR"); pd.wait_for_timeout(1500)
        card = pd.locator(".sar-form").locator("xpath=ancestor::section[1]")
        if pd.locator(".sar-aviso-mapa:not([hidden])").count():
            pd.keyboard.press("Escape"); pd.wait_for_timeout(500)
        pd.fill(".sar-nombre", "Ejemplo: persona en el agua")
        pd.locator(".sar-fases button", has_text="Alerta").first.click()
        pd.fill(".sar-notas", "Caso de ejemplo para presentación: persona en el agua frente a Valparaíso, avistada por pescadores artesanales.")
        pd.fill(".sar-form input[name=lat]", "33 00,0 S")
        pd.fill(".sar-form input[name=lon]", "71 48,0 W")
        pd.locator(".sar-form button[type=submit]").click()
        pd.wait_for_timeout(15000)
        K("08_sar_mapa.jpg")
        # Ficha completa: se agranda la ventana para que quepa entera
        pd.set_viewport_size({"width": 1920, "height": 3600}); pd.wait_for_timeout(2500)
        card.screenshot(path=str(OUT / "09_sar_ficha_completa.jpg"), type="jpeg", quality=90)
        for i, h in enumerate(["Posición", "Condiciones ahora", "Avisos en la posición", "Ventanas de operación", "Supervivencia", "Deriva", "Luz natural", "Observaciones cercanas"]):
            try:
                blq = pd.locator(".sar-blq", has=pd.locator("h3", has_text=h)).first
                blq.screenshot(path=str(OUT / f"10_sar_{i}_{h.split()[0].lower()}.jpg"), type="jpeg", quality=90, timeout=8000); log.append("ok sar " + h)
            except Exception as e:  # noqa: BLE001
                log.append(f"error sar {h}: {e!r}"[:200])
        pd.set_viewport_size({"width": 1920, "height": 1080})
    paso("08_sar", sar)
    b.close()

(OUT / "registro.json").write_text(json.dumps({"log": log, "cajas": cajas}, ensure_ascii=False, indent=1))
zipf = Path.home() / "Desktop" / "capturas_meteoia.zip"
zipf.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(zipf, "w", zipfile.ZIP_DEFLATED) as z:
    for f in sorted(OUT.glob("*")):
        z.write(f, f.name)
print(f"\nListo: {len(list(OUT.glob('*.jpg')))} capturas · {zipf}")
