#!/usr/bin/env python3
"""Valida la aplicación generada sin dependencias ni acceso a internet."""
import json
import struct
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse

R = Path(__file__).resolve().parent.parent


class Etiquetas(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.items = []
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        self.items.append((tag, dict(attrs)))


def comprobar(base):
    manifest_url = urljoin(base, 'app/app.webmanifest')
    manifest = json.loads((R / 'app/app.webmanifest').read_text())
    assert manifest == json.loads((R / 'app/manifest.webmanifest').read_text()), 'Manifiestos incompatibles'
    assert manifest['name'] == 'MeteoIA' and manifest['display'] == 'standalone'
    for campo in ('id', 'start_url', 'scope'):
        assert urljoin(manifest_url, manifest[campo]) == base, campo
    for icon in manifest['icons']:
        file = R / 'app' / icon['src']
        data = file.read_bytes()
        assert data[:8] == b'\x89PNG\r\n\x1a\n', file
        w, h = struct.unpack('>II', data[16:24])
        assert f'{w}x{h}' == icon['sizes'], file
    for shortcut in manifest['shortcuts']:
        url = urljoin(manifest_url, shortcut['url'])
        assert url.startswith(base)
        assert (R / url.removeprefix(base)).is_file(), url
    for page in ('index.html', 'dashboard.html', 'ia.html', 'pronosticos.html', 'hielos.html', 'app/index.html'):
        html = (R / page).read_text()
        tags = Etiquetas(html).items
        metas = {attrs.get('name'): attrs.get('content') for tag, attrs in tags if tag == 'meta'}
        assert 'viewport-fit=cover' in metas['viewport'], page
        assert metas['apple-mobile-web-app-capable'] == 'yes', page
        manifests = [a for t, a in tags if t == 'link' and a.get('rel') == 'manifest']
        assert len(manifests) == 1, page
        assert urljoin(urljoin(base, page), manifests[0]['href']) == manifest_url, page
        assert all(token not in html for token in ('/*INSTALAR*/', '/*DATA*/', '/*LEAFLET_JS*/', '/*LEAFLET_CSS*/')), page
    assert (R / 'app/offline.html').is_file()
    assert (R / 'sw-app.js').is_file()
    # Cada ícono de Apple debe estar incorporado o existir en la publicación.
    for tag, attrs in Etiquetas((R / 'app/index.html').read_text()).items:
        if tag == 'link' and attrs.get('rel') == 'apple-touch-icon':
            assert (R / 'app' / attrs['href']).is_file()
    print(f'App validada: {urlparse(base).path}')


if __name__ == '__main__':
    comprobar('https://example.test/')
    comprobar('https://example.test/meteo_naval/')
