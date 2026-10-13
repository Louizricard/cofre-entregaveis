import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from PIL import Image

SCRIPT = Path(__file__).with_name('render.py')


class RenderTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.output = self.root / 'out'
        self.output.mkdir()

    def tearDown(self):
        self.temp.cleanup()

    def run_render(self, file, mime):
        return subprocess.run([sys.executable, '-I', str(SCRIPT), str(file), mime, str(self.output)],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30).returncode

    def test_image_is_resized_watermarked_and_metadata_removed(self):
        file = self.root / 'test.png'
        Image.new('RGB', (2000, 1200), 'red').save(file)
        self.assertEqual(self.run_render(file, 'image/png'), 0)
        manifest = json.loads((self.output / 'manifest.json').read_text())
        self.assertEqual(manifest[0]['width'], 1600)
        with Image.open(self.output / 'page-1.jpg') as image:
            self.assertEqual(image.format, 'JPEG')
            self.assertGreater(len(image.getcolors(1600 * 1600)), 2)
            self.assertFalse(image.getexif())

    def test_pdf_rasterizes_each_page(self):
        file = self.root / 'test.pdf'
        a = Image.new('RGB', (300, 200), 'white')
        a.save(file, 'PDF', save_all=True, append_images=[Image.new('RGB', (200, 300), 'blue')])
        self.assertEqual(self.run_render(file, 'application/pdf'), 0)
        self.assertEqual(len(json.loads((self.output / 'manifest.json').read_text())), 2)

    def test_corrupt_pdf_has_no_preview(self):
        file = self.root / 'bad.pdf'
        file.write_bytes(b'%PDF-1.7\ninvalid')
        self.assertNotEqual(self.run_render(file, 'application/pdf'), 0)
        self.assertFalse((self.output / 'manifest.json').exists())

    def test_pdf_page_limit(self):
        file = self.root / 'large.pdf'
        image = Image.new('RGB', (10, 10), 'white')
        image.save(file, 'PDF', save_all=True, append_images=[image] * 100)
        self.assertNotEqual(self.run_render(file, 'application/pdf'), 0)

    def test_memory_limit_is_enforced_by_os(self):
        code = f"import sys; sys.path.insert(0, {str(SCRIPT.parent)!r}); import render; render.limit_resources(); bytearray(1024*1024*1024)"
        result = subprocess.run([sys.executable, '-I', '-c', code], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
        self.assertNotEqual(result.returncode, 0)


if __name__ == '__main__':
    unittest.main()
