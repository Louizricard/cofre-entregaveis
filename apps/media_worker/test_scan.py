import hashlib
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
import zipfile
import scan
import sandbox


class DefinitionsTests(unittest.TestCase):
    def test_missing_or_stale_official_databases_fail_closed(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            with self.assertRaises(ValueError): scan.definitions(folder)
            for name in ('main', 'daily', 'bytecode'):
                (folder / (name + '.cvd')).write_text('ClamAV-VDB:date:1:1:90:md5:signature:builder:' + str(int(time.time()) - 4 * 86400))
            with self.assertRaises(ValueError): scan.definitions(folder)


@unittest.skipUnless(os.name == 'nt' and os.environ.get('CLAMAV_SCAN') and os.environ.get('CLAMAV_DATABASE'), 'Configure o scanner LTS e a base oficial para testes reais')
class ScannerTests(unittest.TestCase):
    def test_official_database_scans_clean_file_inside_appcontainer(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp); source = folder / 'input'; source.write_text('cofre benign synthetic file')
            output = folder / 'out'; output.mkdir()
            result = scan.scan(source, output)
            self.assertEqual(result['state'], 'CLEAN')
            self.assertTrue(result['definitions'].isdigit())

    def test_engine_detects_benign_custom_signature_inside_zip(self):
        # Test signature for harmless generated content; never disables the host antivirus.
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp); content = b'cofre benign custom archive signature 2026'
            database = folder / 'test.hdb'
            database.write_text(f'{hashlib.md5(content).hexdigest()}:{len(content)}:Test.Cofre.Isolation-1\n')
            source = folder / 'input.zip'
            with zipfile.ZipFile(source, 'w') as archive: archive.writestr('test.txt', content)
            before = source.read_bytes(); output = folder / 'out'; output.mkdir()
            executable = Path(os.environ['CLAMAV_SCAN'])
            result = sandbox.run(executable, ['--database=' + str(database), '--tempdir=' + str(output),
                                 '--log=' + str(output / 'scan.log'), str(source)], [executable.parent], [database, source], output,
                                 memory=3 * 1024**3, processes=1)
            self.assertEqual(result, 1)
            self.assertIn('Test.Cofre.Isolation', (output / 'scan.log').read_text())
            self.assertEqual(source.read_bytes(), before)


if __name__ == '__main__': unittest.main()
