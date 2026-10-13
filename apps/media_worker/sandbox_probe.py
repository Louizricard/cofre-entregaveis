"""Synthetic negative test payload; never receives user secrets."""
import ctypes as c
from ctypes import wintypes as w
import json
from pathlib import Path
import socket
import sys

output, source, outside, port = sys.argv[1:5]
result = {}
k = c.WinDLL('kernel32'); a = c.WinDLL('advapi32')
k.GetCurrentProcess.restype = w.HANDLE
a.OpenProcessToken.argtypes = [w.HANDLE, w.DWORD, c.POINTER(w.HANDLE)]
a.GetTokenInformation.argtypes = [w.HANDLE, c.c_int, c.c_void_p, w.DWORD, c.POINTER(w.DWORD)]
token = w.HANDLE(); value = w.DWORD(); size = w.DWORD()
result['appcontainer'] = bool(a.OpenProcessToken(k.GetCurrentProcess(), 8, c.byref(token)) and
    a.GetTokenInformation(token, 29, c.byref(value), c.sizeof(value), c.byref(size)) and value.value == 1)
for name, action in [
    ('input_read', lambda: Path(source).read_bytes()),
    ('input_write', lambda: Path(source).write_text('unexpected write')),
    ('outside_read', lambda: Path(outside).read_bytes()),
    ('runtime_write', lambda: Path(sys.executable).with_name('unexpected-write.txt').write_text('bad')),
    ('network', lambda: socket.create_connection(('127.0.0.1', int(port)), timeout=1)),
]:
    try:
        action(); result[name] = True
    except (OSError, PermissionError):
        result[name] = False
Path(output, 'probe.json').write_text(json.dumps(result))
