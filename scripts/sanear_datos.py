"""Repara los archivos de datos que un conflicto de git pudo dejar inservibles.

Un `git pull --rebase --autostash` que falla al reponer los cambios locales deja marcas de
conflicto dentro del archivo. Si eso pasa con data/estaciones.json, la construcción del sitio
aborta y no se publica nada. Aquí se revisa cada archivo que el sitio incrusta o copia: el que
no sea JSON válido se repone desde la última versión confirmada en git, que sí lo es.
"""
import json
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
# Archivos sin los cuales el sitio sale mal; se revisan siempre.
CLAVE = ["data/estaciones.json", "data/avisos.json", "data/estado.json", "data/seguimiento.json",
         "data/derrotero_lugares.json", "data/clima_derrotero.json", "data/geo/sar.json",
         "data/geo/limites.json", "data/geo/land.json", "data/geo/metarea.json",
         "data/geo/valparaiso.geojson", "data/geo/valparaiso_limites.json",
         "data/geo/talcahuano.geojson", "data/geo/talcahuano_fondeos.geojson"]


def valido(p: Path):
    try:
        json.loads(p.read_text(encoding="utf-8"))
        return True
    except Exception as e:
        return str(e)


def main():
    malos, perdidos = [], []
    for rel in CLAVE:
        p = RAIZ / rel
        if not p.exists():
            continue
        v = valido(p)
        if v is True:
            continue
        marcas = p.read_text(encoding="utf-8", errors="replace").lstrip().startswith(("<<<<<<<", "=======", ">>>>>>>"))
        print(f"Saneado: {rel} no es JSON válido ({'marcas de conflicto de git' if marcas else v}).")
        try:
            txt = subprocess.run(["git", "show", f"HEAD:{rel}"], cwd=RAIZ, check=True,
                                 capture_output=True).stdout.decode("utf-8")
            json.loads(txt)
        except Exception as e:
            perdidos.append(rel)
            print(f"  No se pudo reponer desde git: {e}")
            continue
        p.write_text(txt, encoding="utf-8")
        malos.append(rel)
        print(f"  Repuesto desde la última versión confirmada ({len(txt)} bytes).")
    if perdidos:
        print("Archivos clave inservibles y sin copia en git: " + ", ".join(perdidos))
        return 1
    if not malos:
        print("Datos sanos: nada que reponer.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
