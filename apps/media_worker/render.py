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
import warnings

JOB = None


def limit_resources():
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
        limits.basic.flags = 0x2 | 0x8 | 0x100 | 0x2000  # CPU, active process, memory, kill on close
        limits.basic.process_time = 90 * 10_000_000
        limits.basic.active = 1
        limits.process_memory = 768 * 1024 * 1024
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


def render(source, mime, output):
    limit_resources()
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
