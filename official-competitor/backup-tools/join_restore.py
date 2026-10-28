"""Join and verify encrypted parts, then authenticate and restore the backup."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import tempfile
from restore_backup import restore


def join_restore(manifest_path, key_file, output):
    manifest_path = Path(manifest_path)
    manifest = json.loads(manifest_path.read_text())
    root = manifest_path.parent.resolve()
    with tempfile.TemporaryDirectory() as folder:
        archive = Path(folder)/'backup.ozonenc'
        digest = hashlib.sha256()
        with archive.open('wb') as stream:
            for item in manifest['parts']:
                relative = PurePosixPath(item['path'])
                if relative.is_absolute() or '..' in relative.parts:
                    raise ValueError('Unsafe part path')
                source = (root/str(relative)).resolve()
                if not source.is_relative_to(root):
                    raise ValueError('Part escapes backup directory')
                raw = source.read_bytes()
                if len(raw) != item['bytes'] or hashlib.sha256(raw).hexdigest() != item['sha256']:
                    raise ValueError('Incomplete or modified encrypted part: '+str(relative))
                digest.update(raw)
                stream.write(raw)
        if digest.hexdigest() != manifest['encrypted_sha256']:
            raise ValueError('Encrypted archive checksum mismatch')
        return restore(archive, key_file, output)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--key-file', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    print('Restored and verified', join_restore(args.manifest, args.key_file, args.output), 'files')
