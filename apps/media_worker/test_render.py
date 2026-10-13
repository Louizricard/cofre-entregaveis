import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import os
import wave
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


@unittest.skipUnless(os.environ.get('MEDIA_FFMPEG') and os.environ.get('MEDIA_FFPROBE'), 'Configure FFmpeg/FFprobe para os testes temporais')
class TemporalTests(unittest.TestCase):
    setUp = RenderTests.setUp
    tearDown = RenderTests.tearDown
    run_render = RenderTests.run_render

    def generate(self, args, file):
        subprocess.run([os.environ['MEDIA_FFMPEG'], '-v', 'error', '-y', *args, str(file)], check=True, timeout=30,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def metadata(self, file):
        return json.loads(subprocess.check_output([os.environ['MEDIA_FFPROBE'], '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(file)]))

    def test_video_without_audio_is_watermarked_h264(self):
        file = self.root / 'input.mp4'
        self.generate(['-f', 'lavfi', '-i', 'color=c=blue:s=320x240:r=24', '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p'], file)
        self.assertEqual(self.run_render(file, 'video/mp4'), 0)
        manifest = json.loads((self.output / 'manifest.json').read_text())[0]
        self.assertEqual((manifest['kind'], manifest['width'], manifest['height']), ('VIDEO', 1280, 720))
        info = self.metadata(self.output / 'preview.mp4')
        self.assertEqual(info['streams'][0]['codec_name'], 'h264')
        frame = self.root / 'frame.png'
        self.generate(['-i', str(self.output / 'preview.mp4'), '-frames:v', '1'], frame)
        with Image.open(frame) as image:
            self.assertGreater(image.crop((25, 30, 350, 70)).getextrema()[0][1], 200)

    def test_wav_longer_than_preview_is_limited_and_aac(self):
        file = self.root / 'input.wav'
        self.generate(['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-t', '65'], file)
        self.assertEqual(self.run_render(file, 'audio/wav'), 0)
        manifest = json.loads((self.output / 'manifest.json').read_text())[0]
        self.assertEqual(manifest['kind'], 'AUDIO')
        self.assertTrue(59000 <= manifest['durationMs'] <= 60000)
        self.assertEqual(self.metadata(self.output / 'preview.m4a')['streams'][0]['codec_name'], 'aac')

    def test_mp3_produces_audio_only(self):
        file = self.root / 'input.mp3'
        self.generate(['-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=44100', '-t', '3', '-c:a', 'libmp3lame'], file)
        self.assertEqual(self.run_render(file, 'audio/mpeg'), 0)
        self.assertEqual([s['codec_type'] for s in self.metadata(self.output / 'preview.m4a')['streams']], ['audio'])

    def test_duration_above_30_minutes_is_rejected(self):
        file = self.root / 'long.wav'
        with wave.open(str(file), 'wb') as output:
            output.setnchannels(1); output.setsampwidth(2); output.setframerate(8000)
            output.writeframes(b'\0\0' * (8000 * 1801))
        self.assertNotEqual(self.run_render(file, 'audio/wav'), 0)
        self.assertFalse((self.output / 'manifest.json').exists())

    def test_playlist_disguised_as_mp4_is_rejected(self):
        file = self.root / 'fake.mp4'
        file.write_text('#EXTM3U\nhttp://127.0.0.1:9999/private\n')
        self.assertNotEqual(self.run_render(file, 'video/mp4'), 0)
        self.assertFalse((self.output / 'manifest.json').exists())


if __name__ == '__main__':
    unittest.main()
