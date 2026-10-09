"""Fetch selected entries of the public CC0 system pack using HTTP ranges."""
import io
import json
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
URL = 'https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip'


class PublicArchive(io.RawIOBase):
    def __init__(self):
        with urllib.request.urlopen(urllib.request.Request(URL, method='HEAD'), timeout=40) as response:
            self.length = int(response.headers['Content-Length'])
        self.position = 0
        self.transferred = 0

    def seek(self, offset, whence=0):
        self.position = offset if whence == 0 else self.position + offset if whence == 1 else self.length + offset
        return self.position

    def tell(self):
        return self.position

    def seekable(self):
        return True

    def read(self, count=-1):
        if count < 0:
            count = self.length - self.position
        count = min(count, self.length - self.position)
        if not count:
            return b''
        if count > 40_000_000 or self.transferred + count > 100_000_000:
            raise RuntimeError('Selective asset download exceeded its bounded transfer size.')
        request = urllib.request.Request(URL, headers={
            'Range': f'bytes={self.position}-{self.position + count - 1}',
            'User-Agent': 'Local-character-preparation/1.0'})
        with urllib.request.urlopen(request, timeout=40) as response:
            if response.status != 206:
                raise RuntimeError('Server did not honor the requested public byte range.')
            data = response.read(count + 1)
        if len(data) != count:
            raise RuntimeError('Unexpected archive byte-range length.')
        self.position += count
        self.transferred += count
        return data


stream = PublicArchive()
with zipfile.ZipFile(stream) as archive:
    entries = [{'name': i.filename, 'bytes': i.file_size, 'compressedBytes': i.compress_size}
               for i in archive.infolist()]
    (ROOT / 'system-asset-manifest.json').write_text(json.dumps(entries, indent=2))
    prefixes = sys.argv[1:]
    for info in archive.infolist():
        if info.is_dir() or not any(info.filename.startswith(prefix) for prefix in prefixes):
            continue
        destination = (ROOT / 'system' / info.filename).resolve()
        if not destination.is_relative_to((ROOT / 'system').resolve()):
            raise RuntimeError('Archive member escapes the intended source directory.')
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(archive.read(info))
        print(info.filename)
print('Transferred bytes:', stream.transferred)
