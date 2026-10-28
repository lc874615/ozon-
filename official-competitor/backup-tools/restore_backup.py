"""Restore an authenticated encrypted backup; key is supplied separately, never in Git."""
import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import stat
import zipfile

MAGIC = b'OZONBKP1\n'
AAD = b'ozon-workspace-backup-v1'


def restore(archive, key_file, output):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    raw = Path(archive).read_bytes()
    if not raw.startswith(MAGIC) or len(raw) < len(MAGIC) + 28:
        raise ValueError('Unsupported or incomplete backup')
    key = bytes.fromhex(Path(key_file).read_text().strip())
    if len(key) != 32:
        raise ValueError('Recovery key must contain 64 hexadecimal characters')
    nonce = raw[len(MAGIC):len(MAGIC)+12]
    data = AESGCM(key).decrypt(nonce, raw[len(MAGIC)+12:], AAD)
    destination = Path(output)
    if destination.exists():
        raise ValueError('Output already exists; choose a new directory')
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        infos = z.infolist()
        if len(infos) > 20000 or sum(i.file_size for i in infos) > 500*1024*1024:
            raise ValueError('Archive size limit exceeded')
        for info in infos:
            path = PurePosixPath(info.filename)
            if path.is_absolute() or '..' in path.parts or '\\' in info.filename or stat.S_ISLNK(info.external_attr >> 16):
                raise ValueError('Unsafe archive entry')
        manifest = json.loads(z.read('RESTORE-MANIFEST.json'))
        expected = {f['path']: f for f in manifest['files']}
        actual = {i.filename for i in infos if not i.is_dir() and i.filename != 'RESTORE-MANIFEST.json'}
        if actual != set(expected):
            raise ValueError('Manifest/file list mismatch')
        for name, item in expected.items():
            content = z.read(name)
            if len(content) != item['bytes'] or hashlib.sha256(content).hexdigest() != item['sha256']:
                raise ValueError('Integrity check failed: '+name)
        destination.mkdir(parents=True)
        z.extractall(destination)
    return len(expected)


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--archive', required=True)
    p.add_argument('--key-file', required=True)
    p.add_argument('--output', required=True)
    a = p.parse_args()
    count = restore(a.archive, a.key_file, a.output)
    print('Restored and verified', count, 'files')
