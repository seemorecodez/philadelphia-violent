"""Retain CC0 stone maps for authored native stair surfaces; no image alteration."""
import hashlib,json,urllib.request,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'Unreal/Philadelphia/SourceAssets/Museum/stone'
OUT.mkdir(parents=True,exist_ok=True)
base='https://dl.polyhaven.org/file/ph-assets/Textures/'
items=[('diff','jpg','4k'),('nor_dx','jpg','2k'),('rough','jpg','2k')]
files=[]
for kind,ext,resolution in items:
    name=f'granite_tile_04_{kind}_{resolution}.{ext}'
    url=f'{base}{ext}/{resolution}/granite_tile_04/{name}'
    target=OUT/name
    if not target.exists():
        started=time.monotonic()
        with urllib.request.urlopen(url,timeout=30) as response:
            chunks=[];total=0
            while True:
                chunk=response.read(262144)
                if not chunk:break
                chunks.append(chunk);total+=len(chunk)
                assert total<=100_000_000 and time.monotonic()-started<120
                print(name,total,flush=True)
            raw=b''.join(chunks)
        assert 1000<len(raw)<=100_000_000, (name,len(raw))
        target.write_bytes(raw)
    raw=target.read_bytes()
    files.append({'file':name,'url':url,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
    print(name,len(raw),flush=True)
(OUT/'source.json').write_text(json.dumps({'asset':'Granite Tile 04','creator':'Amal Kumar / Poly Haven','license':'CC0','source':'https://polyhaven.com/a/granite_tile_04','licenseSource':'https://polyhaven.com/license','physicalSizeMeters':2,'files':files,'scope':'Photographed material reference for authored stone; not a scan of Philadelphia Museum stairs'},indent=2))
