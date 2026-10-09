"""Extract a bounded real block from retained PASDA indices, preserving source bytes.

These historical photo meshes are reference assets, not finished game architecture.
Only the required texture ZIP entries are requested; never fetch the whole archive.
"""
import argparse
import hashlib
from concurrent.futures import ThreadPoolExecutor
import importlib.util
import json
import math
from pathlib import Path, PurePosixPath
import struct
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
import zlib
from prepare_district import height_at
from geo_frame import to_unreal

ROOT = Path(__file__).resolve().parents[3]
AUDIT = ROOT / 'artifacts/city-source-audit'
OUT = ROOT / 'Unreal/Philadelphia/SourceAssets/Nearby'
URL = 'https://www.pasda.psu.edu/download/philacity/data/3D_Models/2010/ph_downtown_kml.zip'


def index():
    data = (AUDIT / 'downtown-kml-central.bin').read_bytes()
    entries = {}
    pos = 0
    while data[pos:pos+4] == b'PK\x01\x02':
        v = struct.unpack_from('<4s6H3I5H2I', data, pos)
        name_len, extra_len, comment_len = v[10:13]
        name = data[pos+46:pos+46+name_len].decode('utf-8')
        entries[name] = {'method': v[4], 'crc': v[7], 'compressed': v[8],
                         'size': v[9], 'offset': v[16]}
        pos += 46 + name_len + extra_len + comment_len
    assert len(entries) == 26388, 'Retained source central directory differs'
    return entries


def fetch_range(start, length):
    assert 0 < length < 8_000_000
    req = urllib.request.Request(URL, headers={'Range': f'bytes={start}-{start+length-1}'})
    with urllib.request.urlopen(req, timeout=45) as response:
        assert response.status == 206, 'Server did not honor bounded range'
        assert response.headers.get('Content-Range', '').startswith(f'bytes {start}-')
        data = response.read(length+1)
    assert len(data) == length, 'Source byte range length mismatch'
    return data


def original_texture(name, entry):
    header = fetch_range(entry['offset'], 30)
    assert header[:4] == b'PK\x03\x04'
    n, extra = struct.unpack_from('<HH', header, 26)
    payload = fetch_range(entry['offset']+30, n+extra+entry['compressed'])
    assert payload[:n].decode('utf-8') == name, 'ZIP filename mismatch'
    assert entry['method'] == 8 and entry['size'] < 8_000_000
    raw = zlib.decompress(payload[n+extra:], -15)
    assert len(raw) == entry['size'] and zlib.crc32(raw) == entry['crc'], 'ZIP integrity failure'
    return raw


def main():
    global OUT
    parser=argparse.ArgumentParser()
    parser.add_argument('--radius',type=float,default=70)
    parser.add_argument('--output',choices=['Nearby','DowntownExpansion'],default='Nearby')
    args=parser.parse_args()
    if not 0<args.radius<=200:raise ValueError('Source radius must be within 200m')
    OUT=ROOT/'Unreal/Philadelphia/SourceAssets'/args.output
    excluded=set()
    if args.output=='DowntownExpansion':
        existing=ROOT/'Unreal/Philadelphia/SourceAssets/Nearby/manifest.json'
        excluded={item['id'] for item in json.loads(existing.read_text())['assets']}
    spec = importlib.util.spec_from_file_location('retained_converter', ROOT/'scripts/convert-city-source.py')
    converter = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(converter)
    entries = index()
    source_zip = zipfile.ZipFile(AUDIT/'kml1to300.zip')
    rows = []
    for name in source_zip.namelist():
        if not name.endswith('.kml'):
            continue
        tags = {e.tag.split('}')[-1]: e.text for e in ET.fromstring(source_zip.read(name)).iter()}
        lon, lat = float(tags['longitude']), float(tags['latitude'])
        distance = math.hypot((lon+75.15599476)*85300, (lat-39.95493557)*111320)
        if distance <= args.radius and PurePosixPath(name).stem not in excluded:
            rows.append((distance, name, lon, lat))
    report = {'source': URL, 'classification': 'Historical reference; final art not accepted', 'assets': []}
    # Validate the complete request budget before scheduling any network traffic.
    planned = {}
    for _, name, _, _ in rows:
        folder = OUT/PurePosixPath(name).stem
        dae = ET.fromstring(source_zip.read(name.replace('.kml', '.dae')))
        for image in dae.findall('.//{*}library_images/{*}image/{*}init_from'):
            relative = PurePosixPath(image.text.replace('\\', '/'))
            assert not relative.is_absolute() and '..' not in relative.parts
            archive_name = 'kml/'+str(relative)
            if not (folder/str(relative)).exists():
                planned[archive_name] = entries[archive_name]
    assert sum(e['compressed'] for e in planned.values()) < 40_000_000
    pool = ThreadPoolExecutor(max_workers=4)
    pending = {name: pool.submit(original_texture, name, entry) for name, entry in planned.items()}
    budget = 0
    origin_height = height_at(-75.15599476,39.95493557)
    for distance, name, lon, lat in sorted(rows):
        stem = PurePosixPath(name).stem
        folder = OUT/stem
        folder.mkdir(parents=True, exist_ok=True)
        dae_name = name.replace('.kml', '.dae')
        (folder/(stem+'.kml')).write_bytes(source_zip.read(name))
        (folder/(stem+'.dae')).write_bytes(source_zip.read(dae_name))
        dae = ET.fromstring(source_zip.read(dae_name))
        images = dae.findall('.//{*}library_images/{*}image/{*}init_from')
        receipts = []
        for image in images:
            relative = PurePosixPath(image.text.replace('\\', '/'))
            assert not relative.is_absolute() and '..' not in relative.parts
            archive_name = 'kml/'+str(relative)
            entry = entries[archive_name]
            path = folder/str(relative)
            budget += entry['compressed']
            assert budget < 40_000_000, 'Bounded extraction exceeded 40 MB'
            if not path.exists():
                raw = pending[archive_name].result()
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(raw)
            raw = path.read_bytes()
            assert len(raw) == entry['size'] and zlib.crc32(raw) == entry['crc']
            receipts.append({'entry': archive_name, 'sha256': hashlib.sha256(raw).hexdigest()})
        source = converter.load_source(folder)
        payload = converter.convert(source)
        validation = converter.verify(payload, source)
        glb = folder/(stem+'-uv-corrected.glb')
        glb.write_bytes(payload)
        glb.with_suffix('.verification.json').write_text(json.dumps(validation, indent=2))
        report['assets'].append({'id': stem, 'lon': lon, 'lat': lat, 'distance_m': distance,
                                 'position_cm': to_unreal(lon, lat, height_at(lon,lat), origin_height),
                                 'glb': str(glb.relative_to(ROOT)), 'textures': receipts})
        (OUT/'manifest.json').write_text(json.dumps(report, indent=2))
        print(f'{stem}: preserved geometry/UVs and {len(receipts)} original textures', flush=True)
    print(f'Completed {len(rows)} historical references; texture payload {budget} bytes')
    pool.shutdown(wait=True)


if __name__ == '__main__':
    main()
