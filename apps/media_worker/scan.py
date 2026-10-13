"""Trusted orchestration; all archive/content parsing occurs in AppContainer."""
import json
import os
from pathlib import Path
import sys
import time
sys.path.insert(0, str(Path(__file__).parent))
from sandbox import run


def definitions(database):
    found = {}
    for name in ('main', 'daily', 'bytecode'):
        paths = [database / (name + suffix) for suffix in ('.cld', '.cvd')]
        path = next((p for p in paths if p.is_file()), None)
        if not path:
            raise ValueError('DEFINITIONS_UNAVAILABLE')
        with path.open('rb') as file:
            header = file.read(512).decode('ascii').strip().split(':')
        if len(header) < 9 or header[0] != 'ClamAV-VDB':
            raise ValueError('DEFINITIONS_INVALID')
        found[name] = header
    age = time.time() - int(found['daily'][8])
    if not -3600 <= age <= 72 * 3600:
        raise ValueError('DEFINITIONS_EXPIRED')
    return found['daily'][2]


def scan(source, output):
    database = Path(os.environ.get('CLAMAV_DATABASE', '')).resolve(strict=True)
    executable = Path(os.environ.get('CLAMAV_SCAN', '')).resolve(strict=True)
    version = definitions(database)
    report = output / 'scan.log'
    report.unlink(missing_ok=True)
    args = ['--database=' + str(database), '--log=' + str(report), '--tempdir=' + str(output),
            '--stdout', '--alert-encrypted=yes', '--alert-exceeds-max=yes', '--max-filesize=2047M',
            '--max-scansize=2047M', '--max-recursion=16', '--max-files=10000', '--max-scantime=0',
            '--pcre-max-filesize=2047M', str(source)]
    code = run(str(executable), args, [executable.parent, database], [source], output,
               timeout=180, memory=3 * 1024 * 1024 * 1024, processes=1)
    if definitions(database) != version:
        raise ValueError('DEFINITIONS_CHANGED')
    state = 'REJECTED' if code == 1 else 'ERROR'
    if code == 0:
        text = report.read_text(encoding='utf-8', errors='replace')
        if 'Scanned files: 1' in text and 'Infected files: 0' in text and 'ERROR' not in text:
            state = 'CLEAN'
    return {'state': state, 'definitions': version}


if __name__ == '__main__':
    output = Path(sys.argv[2])
    try:
        result = scan(Path(sys.argv[1]), output)
    except Exception:
        result = {'state': 'ERROR', 'definitions': None}
    (output / 'scan-result.json').write_text(json.dumps(result), encoding='utf-8')
