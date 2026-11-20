"""Ruta por mar entre dos puntos, evitando la tierra: traducción a Python de build/ruta_mar.js (módulo Ruta de MeteoIA).

Mismo método que la página: si el tramo cruza tierra (o se exige un margen a la costa), la zona se divide en celdas de mar y
tierra con la costa incorporada (data/geo/land.json), se busca el camino con A* (las celdas cerca de la costa cuestan más) y se
endereza uniendo los puntos que se ven entre sí. Diferencia: para que responda rápido sin numpy, la grilla se limita primero a
400 000 celdas; si así no encuentra paso (tramos muy largos que cruzan canales), repite con hasta 2 millones, como la página.
No considera profundidades ni dispositivos de tráfico. Solo biblioteca estándar.
"""
import heapq
import math
from array import array

RAD = math.pi / 180
MAX_CELDAS = 400_000
BANDA = 0.1   # grados de latitud por banda del índice de bordes


def decodificar(s, prec=6):
    """Polyline codificada (precisión 6) → lista de [lat, lon]."""
    f = 10 ** prec
    out, i, la, lo = [], 0, 0, 0
    while i < len(s):
        for k in range(2):
            r = sh = 0
            while True:
                b = ord(s[i]) - 63
                i += 1
                r |= (b & 0x1F) << sh
                sh += 5
                if b < 0x20:
                    break
            d = ~(r >> 1) if r & 1 else r >> 1
            if k == 0:
                la += d
            else:
                lo += d
        out.append((la / f, lo / f))
    return out


class Costa:
    def __init__(self, land):
        self.anillos = []
        for c in land:
            for poly in c.get("p", []):
                r = decodificar(poly[0])
                if len(r) < 3:
                    continue
                a = min(p[0] for p in r); b = max(p[0] for p in r)
                cc = min(p[1] for p in r); d = max(p[1] for p in r)
                # índice: bandas de latitud → bordes que las atraviesan (acelera el punto-en-polígono)
                idx = {}
                n = len(r)
                for i in range(n):
                    y1, x1 = r[i - 1]; y2, x2 = r[i]
                    if y1 == y2:
                        continue
                    for bnd in range(int(math.floor(min(y1, y2) / BANDA)), int(math.floor(max(y1, y2) / BANDA)) + 1):
                        idx.setdefault(bnd, []).append((y1, x1, y2, x2))
                self.anillos.append({"r": r, "a": a, "b": b, "cc": cc, "d": d, "idx": idx})

    def en_tierra(self, la, lo):
        bnd = int(math.floor(la / BANDA))
        for g in self.anillos:
            if la < g["a"] or la > g["b"] or lo < g["cc"] or lo > g["d"]:
                continue
            dentro = False
            for y1, x1, y2, x2 in g["idx"].get(bnd, ()):
                if (y1 > la) != (y2 > la) and lo < (x2 - x1) * (la - y1) / (y2 - y1) + x1:
                    dentro = not dentro
            if dentro:
                return True
        return False


def mn(p, q):
    c = math.cos((p[0] + q[0]) / 2 * RAD)
    return math.hypot((q[0] - p[0]) * 60, (q[1] - p[1]) * 60 * c)


def cruza_tierra(costa, p, q, paso=0.5):
    n = max(2, math.ceil(mn(p, q) / paso))
    for k in range(1, n):
        f = k / n
        if costa.en_tierra(p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f):
            return True
    return False


def al_mar(costa, p):
    """Punto marcado sobre tierra: se lleva al punto de costa más cercano y luego un poco mar adentro."""
    if not costa.en_tierra(p[0], p[1]):
        return list(p)
    c = math.cos(p[0] * RAD)
    mejor = None
    for g in costa.anillos:
        if p[0] < g["a"] - 1 or p[0] > g["b"] + 1 or p[1] < g["cc"] - 1.5 or p[1] > g["d"] + 1.5:
            continue
        r = g["r"]
        for i in range(len(r)):
            ax = (r[i - 1][1] - p[1]) * c; ay = r[i - 1][0] - p[0]
            bx = (r[i][1] - p[1]) * c; by = r[i][0] - p[0]
            dx, dy = bx - ax, by - ay
            l2 = dx * dx + dy * dy
            t = max(0, min(1, -(ax * dx + ay * dy) / l2)) if l2 else 0
            x, y = ax + t * dx, ay + t * dy
            d2 = x * x + y * y
            if mejor is None or d2 < mejor[0]:
                mejor = (d2, x, y, -dy, dx)
    if not mejor:
        return list(p)
    _, mx, my, nx_, ny_ = mejor
    ux, uy = mx, my
    l = math.hypot(ux, uy)
    if l < 1e-6:
        ux, uy = nx_, ny_
        l = math.hypot(ux, uy) or 1
    ux /= l; uy /= l
    for m in (0.25, 0.5, 1, 2):
        for s in (1, -1):
            q = [round(p[0] + my + s * uy * m / 60, 4), round(p[1] + (mx + s * ux * m / 60) / c, 4)]
            if not costa.en_tierra(q[0], q[1]):
                return q
    return list(p)


class Grilla:
    def __init__(self, costa, la1, la2, lo1, lo2, res):
        self.la1, self.lo1, self.res = la1, lo1, res
        self.dlat = res / 60
        self.dlon = res / 60 / math.cos((la1 + la2) / 2 * RAD)
        self.ny = math.ceil((la2 - la1) / self.dlat)
        self.nx = math.ceil((lo2 - lo1) / self.dlon)
        nx, ny = self.nx, self.ny
        T = bytearray(nx * ny)
        for g in costa.anillos:
            if g["b"] < la1 or g["a"] > la2 or g["d"] < lo1 or g["cc"] > lo2:
                continue
            r = g["r"]
            filas = {}
            for i in range(len(r)):
                y1, x1 = r[i - 1]; y2, x2 = r[i]
                if y1 == y2:
                    continue
                ymin, ymax = min(y1, y2), max(y1, y2)
                ja = max(0, math.ceil((ymin - la1) / self.dlat - 0.5))
                jb = min(ny - 1, math.floor((ymax - la1) / self.dlat - 0.5))
                for j in range(ja, jb + 1):
                    yc = la1 + (j + 0.5) * self.dlat
                    if yc < ymin or yc >= ymax:
                        continue
                    filas.setdefault(j, []).append(x1 + (yc - y1) * (x2 - x1) / (y2 - y1))
            for j, xs in filas.items():
                xs.sort()
                base = j * nx
                for q in range(0, len(xs) - 1, 2):
                    ia = max(0, math.ceil((xs[q] - lo1) / self.dlon - 0.5))
                    ib = min(nx - 1, math.floor((xs[q + 1] - lo1) / self.dlon - 0.5))
                    if ib >= ia:
                        T[base + ia: base + ib + 1] = b"\x01" * (ib - ia + 1)
        self.T = T
        self.D = self._dist_costa()

    def _dist_costa(self):
        T, nx, ny = self.T, self.nx, self.ny
        INF, SQ = 1e9, math.sqrt(2)
        D = array("d", (0.0 if t else INF for t in T))
        for j in range(ny):
            b = j * nx
            for i in range(nx):
                k = b + i
                v = D[k]
                if not v:
                    continue
                if i > 0 and D[k - 1] + 1 < v: v = D[k - 1] + 1
                if j > 0:
                    u = D[k - nx] + 1
                    if u < v: v = u
                    if i > 0 and D[k - nx - 1] + SQ < v: v = D[k - nx - 1] + SQ
                    if i < nx - 1 and D[k - nx + 1] + SQ < v: v = D[k - nx + 1] + SQ
                D[k] = v
        for j in range(ny - 1, -1, -1):
            b = j * nx
            for i in range(nx - 1, -1, -1):
                k = b + i
                v = D[k]
                if not v:
                    continue
                if i < nx - 1 and D[k + 1] + 1 < v: v = D[k + 1] + 1
                if j < ny - 1:
                    u = D[k + nx] + 1
                    if u < v: v = u
                    if i < nx - 1 and D[k + nx + 1] + SQ < v: v = D[k + nx + 1] + SQ
                    if i > 0 and D[k + nx - 1] + SQ < v: v = D[k + nx - 1] + SQ
                D[k] = v
        res = self.res
        for k in range(len(D)):
            D[k] = 9999.0 if D[k] >= INF else D[k] * res
        return D

    def celda(self, p):
        j = min(self.ny - 1, max(0, int(math.floor((p[0] - self.la1) / self.dlat))))
        i = min(self.nx - 1, max(0, int(math.floor((p[1] - self.lo1) / self.dlon))))
        return j * self.nx + i

    def centro(self, k):
        return [self.la1 + (k // self.nx + 0.5) * self.dlat, self.lo1 + (k % self.nx + 0.5) * self.dlon]

    def mar_cercano(self, k0):
        if not self.T[k0]:
            return k0
        nx, ny, T = self.nx, self.ny, self.T
        vis = bytearray(nx * ny)
        vis[k0] = 1
        cola = [k0]
        h = 0
        while h < len(cola):
            k = cola[h]; h += 1
            i, j = k % nx, k // nx
            for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                x, y = i + di, j + dj
                if x < 0 or y < 0 or x >= nx or y >= ny:
                    continue
                q = y * nx + x
                if vis[q]:
                    continue
                if not T[q]:
                    return q
                vis[q] = 1
                cola.append(q)
        return -1

    def astar(self, s, t, margen):
        nx, ny, T, D = self.nx, self.ny, self.T, self.D
        SQ = math.sqrt(2)
        m = margen + self.res if margen else self.res * 1.5
        tx, ty = t % nx, t // nx
        g = {s: 0.0}
        prev = {}
        cerr = bytearray(nx * ny)
        def h(k):
            dx, dy = abs(k % nx - tx), abs(k // nx - ty)
            return dx + dy + (SQ - 2) * min(dx, dy)
        heap = [(h(s), s)]
        V = ((1, 0, 1), (-1, 0, 1), (0, 1, 1), (0, -1, 1), (1, 1, SQ), (1, -1, SQ), (-1, 1, SQ), (-1, -1, SQ))
        while heap:
            _, k = heapq.heappop(heap)
            if cerr[k]:
                continue
            cerr[k] = 1
            if k == t:
                break
            i, j = k % nx, k // nx
            gk = g[k]
            for di, dj, c in V:
                x, y = i + di, j + dj
                if x < 0 or y < 0 or x >= nx or y >= ny:
                    continue
                q = y * nx + x
                if T[q] or cerr[q]:
                    continue
                if di and dj and (T[j * nx + x] or T[y * nx + i]):
                    continue
                d = D[q]
                v = gk + c * (1 if d >= m else 1 + 8 * (1 - d / m))
                if v < g.get(q, math.inf):
                    g[q] = v
                    prev[q] = k
                    heapq.heappush(heap, (v + h(q), q))
        if not cerr[t]:
            return None
        cam = [t]
        while cam[-1] != s:
            cam.append(prev[cam[-1]])
        return cam[::-1]

    def ve(self, p, q, req=None):
        n = max(2, math.ceil(mn(p, q) / (self.res * 0.35)))
        for k in range(n + 1):
            f = k / n
            la = p[0] + (q[0] - p[0]) * f
            lo = p[1] + (q[1] - p[1]) * f
            i = int(math.floor((lo - self.lo1) / self.dlon))
            j = int(math.floor((la - self.la1) / self.dlat))
            if i < 0 or j < 0 or i >= self.nx or j >= self.ny:
                continue
            c = j * self.nx + i
            if self.T[c]:
                return False
            if req and self.D[c] < req(la, lo) - self.res * 0.05:
                return False
        return True


def por_mar(costa, a, b, margen=0, prof=0, max_celdas=MAX_CELDAS):
    """Tramo a→b por mar, a "margen" mn o más de la costa salvo al acercarse al zarpe o a la recalada. None si no hay paso."""
    a, b = list(a), list(b)
    cruza = cruza_tierra(costa, a, b)
    if not cruza and not margen:
        return [a, b]
    cLat = math.cos((a[0] + b[0]) / 2 * RAD)
    sLat, sLon = abs(a[0] - b[0]), abs(a[1] - b[1])
    mLat = max(0.6, 0.35 * max(sLat, sLon * cLat)) + 2 * margen / 60
    mLon = mLat / cLat
    la1, la2 = min(a[0], b[0]) - mLat, max(a[0], b[0]) + mLat
    lo1, lo2 = min(a[1], b[1]) - mLon, max(a[1], b[1]) + mLon
    area = (la2 - la1) * 60 * (lo2 - lo1) * 60 * cLat
    res = min(3, max(0.25, math.sqrt(area / 1.2e6)))
    if margen:
        res = max(math.sqrt(area / 2e6), min(res, max(0.25, margen / 3)))
    res = max(res, math.sqrt(area / max_celdas))   # límite de celdas para Python puro
    req = (lambda la, lo: min(margen, mn([la, lo], a), mn([la, lo], b))) if margen else None
    for _ in range(2):
        G = Grilla(costa, la1, la2, lo1, lo2, res)
        reqG = (lambda la, lo: (lambda r: r + 0.7 * G.res if r > 0 else 0)(req(la, lo))) if req else None
        if not cruza and G.ve(a, b, reqG):
            return [a, b]
        s, t = G.mar_cercano(G.celda(a)), G.mar_cercano(G.celda(b))
        if s >= 0 and t >= 0:
            cam = G.astar(s, t, margen)
            if cam:
                P = [a] + [G.centro(k) for k in cam] + [b]
                DEF = [0 if k == 0 or k == len(P) - 1 or not reqG else max(0, reqG(q[0], q[1]) - G.D[cam[k - 1]])
                       for k, q in enumerate(P)]
                out, i = [a], 0
                while i < len(P) - 1:
                    j, dfc = i + 1, 0
                    while j + 1 < len(P):
                        d = max(dfc, DEF[j], DEF[j + 1])
                        rq = (lambda la, lo, d=d: reqG(la, lo) - d) if reqG else None
                        if not G.ve(P[i], P[j + 1], rq):
                            break
                        dfc = d
                        j += 1
                    out.append(P[j])
                    i = j
                fin = [a]
                for q in out[1:]:
                    p = fin[-1]
                    sub = por_mar(costa, p, q, 0, prof + 1) if prof < 2 and cruza_tierra(costa, p, q, 0.25) else None
                    fin.extend(sub[1:] if sub else [q])
                return [[round(p[0], 4), round(p[1], 4)] for p in fin]
        res = max(0.2, res / 2)
        if (la2 - la1) / (res / 60) * (lo2 - lo1) / (res / 60 / cLat) > max_celdas * 2:
            break
    if prof == 0 and max_celdas < 2_000_000:   # tramos muy largos: segundo intento con la grilla fina de la página (más lento)
        return por_mar(costa, a, b, margen, prof, 2_000_000)
    return None
