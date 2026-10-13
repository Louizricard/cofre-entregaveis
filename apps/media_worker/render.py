"""Untrusted parsers run here, without database/R2 credentials. No shell input.

OS resource limits are mandatory, applied before importing native parsers.
This is resource containment, not a full filesystem/network security sandbox.
"""
import ctypes
from contextlib import closing
import json
import math
import os
from pathlib import Path
import sys
import subprocess
import warnings

JOB = None


def limit_resources(children=False):
    global JOB
    if os.name == 'nt':
        from ctypes import wintypes as w

        class BASIC(ctypes.Structure):
            _fields_ = [('process_time', ctypes.c_int64), ('job_time', ctypes.c_int64),
                        ('flags', w.DWORD), ('min_ws', ctypes.c_size_t), ('max_ws', ctypes.c_size_t),
                        ('active', w.DWORD), ('affinity', ctypes.c_size_t), ('priority', w.DWORD), ('scheduling', w.DWORD)]

        class IO(ctypes.Structure):
            _fields_ = [(name, ctypes.c_uint64) for name in ['ro', 'wo', 'oo', 'rb', 'wb', 'ob']]

        class EXTENDED(ctypes.Structure):
            _fields_ = [('basic', BASIC), ('io', IO), ('process_memory', ctypes.c_size_t),
                        ('job_memory', ctypes.c_size_t), ('peak_process', ctypes.c_size_t), ('peak_job', ctypes.c_size_t)]

        k = ctypes.WinDLL('kernel32', use_last_error=True)
        k.CreateJobObjectW.argtypes = [ctypes.c_void_p, w.LPCWSTR]
        k.CreateJobObjectW.restype = w.HANDLE
        k.SetInformationJobObject.argtypes = [w.HANDLE, ctypes.c_int, ctypes.c_void_p, w.DWORD]
        k.AssignProcessToJobObject.argtypes = [w.HANDLE, w.HANDLE]
        k.GetCurrentProcess.restype = w.HANDLE
        JOB = k.CreateJobObjectW(None, None)
        limits = EXTENDED()
        limits.basic.flags = 0x2 | 0x4 | 0x8 | 0x100 | 0x200 | 0x2000
        limits.basic.process_time = 90 * 10_000_000
        limits.basic.job_time = 90 * 10_000_000
        limits.basic.active = 2 if children else 1
        limits.process_memory = 768 * 1024 * 1024
        limits.job_memory = 768 * 1024 * 1024
        if not JOB or not k.SetInformationJobObject(JOB, 9, ctypes.byref(limits), ctypes.sizeof(limits)):
            raise RuntimeError('RESOURCE_LIMITS_UNAVAILABLE')
        if not k.AssignProcessToJobObject(JOB, k.GetCurrentProcess()):
            raise RuntimeError('RESOURCE_LIMITS_UNAVAILABLE')
    elif sys.platform == 'linux':
        import resource
        resource.setrlimit(resource.RLIMIT_AS, (768 * 1024 * 1024,) * 2)
        resource.setrlimit(resource.RLIMIT_CPU, (90, 90))
        resource.setrlimit(resource.RLIMIT_FSIZE, (32 * 1024 * 1024,) * 2)
        resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
    else:
        raise RuntimeError('RESOURCE_LIMITS_UNAVAILABLE')


def tool(executable, args, timeout, capture=False):
    if not executable or not Path(executable).is_absolute() or not Path(executable).is_file():
        raise ValueError('MEDIA_TOOL_UNAVAILABLE')
    result = subprocess.run([executable, *args], shell=False, stdin=subprocess.DEVNULL,
                            stdout=subprocess.PIPE if capture else subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                            timeout=timeout, creationflags=0x08000000 if os.name == 'nt' else 0)
    if result.returncode != 0 or (capture and len(result.stdout) > 32768):
        raise ValueError('MEDIA_TOOL_FAILED')
    return result.stdout


def probe(source, demuxer):
    return json.loads(tool(os.environ.get('MEDIA_FFPROBE', ''), ['-v', 'error', '-max_alloc', '134217728',
                     '-protocol_whitelist', 'file', '-f', demuxer, '-show_entries',
                     'format=duration:stream=codec_type,width,height', '-of', 'json', str(source)], 15, True))


def render_temporal(source, mime, output):
    demuxer = {'video/mp4': 'mov', 'audio/mpeg': 'mp3', 'audio/wav': 'wav'}[mime]
    info = probe(source, demuxer)
    duration = float(info.get('format', {}).get('duration', 0))
    streams = info.get('streams', [])
    if not math.isfinite(duration) or not 0 < duration <= 1800 or len(streams) > 20:
        raise ValueError('DURATION_LIMIT')
    video = mime == 'video/mp4'
    wanted = [s for s in streams if s.get('codec_type') == ('video' if video else 'audio')]
    if not wanted:
        raise ValueError('MISSING_STREAM')
    if video and (not 1 <= wanted[0].get('width', 0) <= 7680 or not 1 <= wanted[0].get('height', 0) <= 4320):
        raise ValueError('VIDEO_DIMENSION_LIMIT')
    name = 'preview.mp4' if video else 'preview.m4a'
    args = ['-nostdin', '-v', 'error', '-y', '-max_alloc', '134217728', '-threads', '2',
            '-protocol_whitelist', 'file', '-f', demuxer]
    if video:
        args += ['-enable_drefs', '0']
    args += ['-i', str(source)]
    if video:
        from PIL import Image, ImageDraw, ImageFont
        watermark = Image.new('RGBA', (1280, 720), (0, 0, 0, 0))
        draw = ImageDraw.Draw(watermark)
        font = ImageFont.load_default(size=28)
        for y in (30, 330, 630):
            for x in (25, 675):
                draw.text((x, y), 'COFRE - PREVIA', font=font, fill='white', stroke_width=2, stroke_fill='black')
        watermark.save(output / 'watermark.png')
        args += ['-protocol_whitelist', 'file', '-i', str(output / 'watermark.png'), '-filter_complex_threads', '1',
                 '-filter_complex', '[0:v:0]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1[v];[v][1:v]overlay=0:0:format=auto[out]',
                 '-map', '[out]', '-map', '0:a:0?', '-c:v', 'libx264', '-threads', '2', '-preset', 'veryfast',
                 '-pix_fmt', 'yuv420p', '-profile:v', 'baseline', '-level:v', '3.1', '-r', '24', '-g', '48',
                 '-b:v', '1600k', '-maxrate', '1800k', '-bufsize', '3600k']
    else:
        args += ['-map', '0:a:0', '-vn']
    args += ['-t', str(min(duration, 59.9)), '-c:a', 'aac', '-ac', '2', '-ar', '44100', '-b:a', '96k',
             '-map_metadata', '-1', '-map_chapters', '-1', '-movflags', '+faststart', '-fs', '33554432', str(output / name)]
    tool(os.environ.get('MEDIA_FFMPEG', ''), args, 120)
    result = probe(output / name, 'mov')
    real_duration = float(result.get('format', {}).get('duration', 0))
    size = (output / name).stat().st_size
    if not math.isfinite(real_duration) or not 0 < real_duration <= 60 or not 0 < size <= 32 * 1024 * 1024:
        raise ValueError('PREVIEW_LIMIT')
    return [dict(file=name, size=size, width=1280 if video else 0, height=720 if video else 0,
                 kind='VIDEO' if video else 'AUDIO', mime='video/mp4' if video else 'audio/mp4', durationMs=math.ceil(real_duration * 1000))]


def render(source, mime, output):
    temporal = mime in ('video/mp4', 'audio/mpeg', 'audio/wav')
    limit_resources(children=temporal)
    if temporal:
        pages = render_temporal(source, mime, output)
        (output / 'manifest.json').write_text(json.dumps(pages), encoding='utf-8')
        return
    from PIL import Image, ImageDraw, ImageFont, ImageOps
    Image.MAX_IMAGE_PIXELS = 40_000_000
    warnings.simplefilter('error', Image.DecompressionBombWarning)
    pages = []
    total = 0

    def save(image):
        nonlocal total
        image = image.convert('RGB')
        image.thumbnail((1600, 1600))
        # Burn watermark into pixels; never deliver a removable overlay as protection.
        overlay = ImageDraw.Draw(image)
        font = ImageFont.load_default(size=max(16, min(image.size) // 25))
        for y in range(24, image.height, max(100, image.height // 4)):
            for x in range(12, image.width, max(240, image.width // 2)):
                overlay.text((x, y), 'COFRE - PREVIA', font=font, fill=(255, 255, 255), stroke_width=2, stroke_fill=(70, 70, 70))
        name = f'page-{len(pages) + 1}.jpg'
        dest = output / name
        image.save(dest, 'JPEG', quality=72, optimize=False)  # no source EXIF/metadata
        size = dest.stat().st_size
        total += size
        if total > 32 * 1024 * 1024:
            raise ValueError('PREVIEW_TOO_LARGE')
        pages.append(dict(file=name, width=image.width, height=image.height, size=size))
        image.close()

    if mime == 'application/pdf':
        import pypdfium2 as pdfium
        with pdfium.PdfDocument(source) as doc:
            if not 1 <= len(doc) <= 100:
                raise ValueError('PAGE_LIMIT')
            for number in range(len(doc)):
                with closing(doc[number]) as page:
                    width, height = page.get_size()
                    if not all(math.isfinite(v) and 0 < v < 100_000 for v in (width, height)):
                        raise ValueError('INVALID_PAGE')
                    with closing(page.render(scale=min(2, 1600 / max(width, height)), may_draw_forms=False)) as bitmap:
                        save(bitmap.to_pil())
    else:
        with Image.open(source) as image:
            if image.format not in ('PNG', 'JPEG', 'WEBP') or getattr(image, 'n_frames', 1) != 1:
                raise ValueError('IMAGE_NOT_SUPPORTED')
            if image.width * image.height > 40_000_000:
                raise ValueError('PIXEL_LIMIT')
            save(ImageOps.exif_transpose(image))
    (output / 'manifest.json').write_text(json.dumps(pages), encoding='utf-8')


if __name__ == '__main__':
    try:
        render(sys.argv[1], sys.argv[2], Path(sys.argv[3]))
    except Exception:
        # Parser errors can contain source paths/content. Parent reports only a fixed code.
        sys.exit(1)
