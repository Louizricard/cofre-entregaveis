import json
import os
from pathlib import Path
import socket
import sys
import tempfile
import subprocess
import unittest
import sandbox


@unittest.skipUnless(os.name == 'nt', 'AppContainer validado somente no Windows')
class SandboxTests(unittest.TestCase):
    def test_capability_network_and_filesystem_boundaries(self):
        with tempfile.TemporaryDirectory() as temp, socket.socket() as listener:
            root = Path(temp); output = root / 'out'; output.mkdir()
            source = root / 'input'; source.write_bytes(b'synthetic allowed input')
            outside = root / 'outside'; outside.write_bytes(b'synthetic forbidden input')
            script = Path(__file__).with_name('sandbox_probe.py').resolve()
            listener.bind(('127.0.0.1', 0)); listener.listen(1)
            code = sandbox.run(sys.executable, ['-I', '-B', str(script), str(output), str(source), str(outside), str(listener.getsockname()[1])],
                               [Path(sys.executable).parent], [script, source], output, timeout=15)
            self.assertEqual(code, 0)
            result = json.loads((output / 'probe.json').read_text())
            self.assertEqual(result, {'appcontainer': True, 'input_read': True, 'input_write': False,
                                     'outside_read': False, 'runtime_write': False, 'network': False})

    def test_image_parser_runs_inside_appcontainer(self):
        from PIL import Image
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); output = root / 'out'; output.mkdir()
            source = root / 'input.png'; Image.new('RGB', (800, 600), 'blue').save(source)
            script = Path(__file__).with_name('render.py').resolve()
            code = sandbox.run(sys.executable, ['-I', '-B', str(script), str(source), 'image/png', str(output)],
                               [Path(sys.executable).parent], [script, source], output, timeout=30)
            self.assertEqual(code, 0)
            self.assertTrue((output / 'manifest.json').exists())

    def test_pdf_parser_runs_inside_appcontainer(self):
        from PIL import Image
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); output = root / 'out'; output.mkdir()
            source = root / 'input.pdf'; Image.new('RGB', (300, 200), 'blue').save(source, 'PDF')
            script = Path(__file__).with_name('render.py').resolve()
            code = sandbox.run(sys.executable, ['-I', '-B', str(script), str(source), 'application/pdf', str(output)],
                               [Path(sys.executable).parent], [script, source], output, timeout=30)
            self.assertEqual(code, 0)
            self.assertTrue((output / 'manifest.json').exists())

    @unittest.skipUnless(os.environ.get('MEDIA_FFMPEG') and os.environ.get('MEDIA_FFPROBE'), 'Configure FFmpeg para testar isolamento temporal')
    def test_ffmpeg_child_runs_within_appcontainer(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); output = root / 'out'; output.mkdir(); source = root / 'input.mp4'
            subprocess.run([os.environ['MEDIA_FFMPEG'], '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=320x240:r=24',
                            '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', str(source)], check=True, timeout=30)
            script = Path(__file__).with_name('render.py').resolve()
            code = sandbox.run(sys.executable, ['-I', '-B', str(script), str(source), 'video/mp4', str(output)],
                               [Path(sys.executable).parent, Path(os.environ['MEDIA_FFMPEG']).parent, Path(os.environ['MEDIA_FFPROBE']).parent],
                               [script, source], output, timeout=30)
            self.assertEqual(code, 0)
            self.assertTrue((output / 'preview.mp4').exists())

    def test_timeout_is_fail_closed(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaisesRegex(RuntimeError, 'SANDBOX_TIMEOUT'):
                sandbox.run(sys.executable, ['-I', '-c', 'import time; time.sleep(20)'], [Path(sys.executable).parent], [], Path(temp), timeout=1)


if __name__ == '__main__':
    unittest.main()
