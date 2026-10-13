"""Windows AppContainer runner. No capabilities, explicit diagnostic handles only.

ACL grants are per-run SID and removed on exit. Only dedicated tool folders,
one input file and an output directory are exposed. No user content is parsed here.
"""
import ctypes as c
from ctypes import wintypes as w
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import uuid


class STARTUPINFO(c.Structure):
    _fields_ = [('cb', w.DWORD), ('reserved', w.LPWSTR), ('desktop', w.LPWSTR), ('title', w.LPWSTR),
                ('x', w.DWORD), ('y', w.DWORD), ('xs', w.DWORD), ('ys', w.DWORD), ('xc', w.DWORD), ('yc', w.DWORD),
                ('fill', w.DWORD), ('flags', w.DWORD), ('show', w.WORD), ('reserved2size', w.WORD),
                ('reserved2', c.c_void_p), ('stdin', w.HANDLE), ('stdout', w.HANDLE), ('stderr', w.HANDLE)]


class STARTUPINFOEX(c.Structure):
    _fields_ = [('startup', STARTUPINFO), ('attributes', c.c_void_p)]


class PROCESSINFO(c.Structure):
    _fields_ = [('process', w.HANDLE), ('thread', w.HANDLE), ('pid', w.DWORD), ('tid', w.DWORD)]


class CAPABILITIES(c.Structure):
    _fields_ = [('sid', c.c_void_p), ('capabilities', c.c_void_p), ('count', w.DWORD), ('reserved', w.DWORD)]


class BASIC(c.Structure):
    _fields_ = [('process_time', c.c_int64), ('job_time', c.c_int64), ('flags', w.DWORD),
                ('min_ws', c.c_size_t), ('max_ws', c.c_size_t), ('active', w.DWORD),
                ('affinity', c.c_size_t), ('priority', w.DWORD), ('scheduling', w.DWORD)]


class IO(c.Structure):
    _fields_ = [(name, c.c_uint64) for name in ['ro', 'wo', 'oo', 'rb', 'wb', 'ob']]


class EXTENDED(c.Structure):
    _fields_ = [('basic', BASIC), ('io', IO), ('process_memory', c.c_size_t), ('job_memory', c.c_size_t),
                ('peak_process', c.c_size_t), ('peak_job', c.c_size_t)]

class SECURITYATTR(c.Structure):
    _fields_ = [('length', w.DWORD), ('descriptor', c.c_void_p), ('inherit', w.BOOL)]


def acl(path, *args):
    result = subprocess.run([str(Path(os.environ['SYSTEMROOT']) / 'System32' / 'icacls.exe'), str(path), *args],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30, creationflags=0x08000000)
    if result.returncode:
        raise RuntimeError('SANDBOX_ACL_FAILED')


def recover(state_dir, userenv):
    # The state directory is host-owned and is never granted to an AppContainer.
    for record in list(state_dir.glob('Cofre.Media.*.json'))[:10]:
        try:
            if record.stat().st_size > 65536: continue
            data = json.loads(record.read_text())
            if data['created'] > time.time() - 3600: continue
            if data['profile'] != record.stem or not record.stem.startswith('Cofre.Media.') or len(record.stem) != 44: continue
            if not data['sid'].startswith('S-1-15-2-'): continue
            for path in reversed(data['grants']):
                if Path(path).exists(): acl(path, '/remove:g', '*' + data['sid'])
            if userenv.DeleteAppContainerProfile(data['profile']) not in (0, -2147024894): continue
            record.unlink()
        except Exception: pass


def run(executable, args, read_dirs, read_files, output, timeout=180, memory=768 * 1024 * 1024, processes=2):
    if os.name != 'nt':
        raise RuntimeError('SANDBOX_PLATFORM_UNSUPPORTED')
    executable = str(Path(executable).resolve(strict=True))
    output = Path(output).resolve(strict=True)
    k = c.WinDLL('kernel32', use_last_error=True)
    u = c.WinDLL('userenv', use_last_error=True)
    a = c.WinDLL('advapi32', use_last_error=True)
    u.CreateAppContainerProfile.argtypes = [w.LPCWSTR, w.LPCWSTR, w.LPCWSTR, c.c_void_p, w.DWORD, c.POINTER(c.c_void_p)]
    u.CreateAppContainerProfile.restype = c.c_long
    u.DeleteAppContainerProfile.argtypes = [w.LPCWSTR]
    u.DeleteAppContainerProfile.restype = c.c_long
    a.ConvertSidToStringSidW.argtypes = [c.c_void_p, c.POINTER(w.LPWSTR)]
    a.FreeSid.argtypes = [c.c_void_p]
    k.LocalFree.argtypes = [c.c_void_p]
    k.InitializeProcThreadAttributeList.argtypes = [c.c_void_p, w.DWORD, w.DWORD, c.POINTER(c.c_size_t)]
    k.UpdateProcThreadAttribute.argtypes = [c.c_void_p, w.DWORD, c.c_size_t, c.c_void_p, c.c_size_t, c.c_void_p, c.c_void_p]
    k.DeleteProcThreadAttributeList.argtypes = [c.c_void_p]
    k.CreateProcessW.argtypes = [w.LPCWSTR, w.LPWSTR, c.c_void_p, c.c_void_p, w.BOOL, w.DWORD,
                               c.c_void_p, w.LPCWSTR, c.POINTER(STARTUPINFOEX), c.POINTER(PROCESSINFO)]
    k.CreateJobObjectW.argtypes = [c.c_void_p, w.LPCWSTR]
    k.CreateJobObjectW.restype = w.HANDLE
    k.SetInformationJobObject.argtypes = [w.HANDLE, c.c_int, c.c_void_p, w.DWORD]
    k.AssignProcessToJobObject.argtypes = [w.HANDLE, w.HANDLE]
    k.ResumeThread.argtypes = [w.HANDLE]
    k.WaitForSingleObject.argtypes = [w.HANDLE, w.DWORD]
    k.GetExitCodeProcess.argtypes = [w.HANDLE, c.POINTER(w.DWORD)]
    k.TerminateJobObject.argtypes = [w.HANDLE, w.UINT]
    k.CloseHandle.argtypes = [w.HANDLE]
    k.CreateFileW.argtypes = [w.LPCWSTR, w.DWORD, w.DWORD, c.POINTER(SECURITYATTR), w.DWORD, w.DWORD, w.HANDLE]
    k.CreateFileW.restype = w.HANDLE
    state_dir = Path(os.environ.get('SANDBOX_STATE_DIR', str(Path(tempfile.gettempdir()) / 'cofre-sandbox-state')))
    state_dir.mkdir(parents=True, exist_ok=True)
    recover(state_dir, u)
    profile = 'Cofre.Media.' + uuid.uuid4().hex
    record = state_dir / (profile + '.json')
    sid = c.c_void_p(); sid_text = w.LPWSTR(); grants = []; info = PROCESSINFO(); job = None; attributes = None; handles = []
    if u.CreateAppContainerProfile(profile, 'Cofre media isolated run', 'No network capabilities', None, 0, c.byref(sid)) != 0:
        raise RuntimeError('SANDBOX_PROFILE_FAILED')
    try:
        if not a.ConvertSidToStringSidW(sid, c.byref(sid_text)):
            raise RuntimeError('SANDBOX_SID_FAILED')
        principal = '*' + sid_text.value
        def grant(path, permission):
            path = str(path)
            grants.append(path)
            record.write_text(json.dumps({'profile': profile, 'sid': sid_text.value, 'created': time.time(), 'grants': grants}))
            acl(path, '/grant', principal + permission)
        for path in dict.fromkeys(str(Path(p).resolve(strict=True)) for p in read_dirs):
            if any((Path(path) / name).exists() for name in ('.env', '.git', '.aws', '.codex')):
                raise RuntimeError('SANDBOX_TOOL_DIRECTORY_NOT_DEDICATED')
            grant(path, ':(OI)(CI)(RX)')
        for path in dict.fromkeys(str(Path(p).resolve(strict=True)) for p in read_files):
            grant(path, ':(R)')
        grant(output, ':(OI)(CI)(M)')
        acl(output, '/setintegritylevel', '(OI)(CI)L')
        length = c.c_size_t()
        k.InitializeProcThreadAttributeList(None, 2, 0, c.byref(length))
        attributes = c.create_string_buffer(length.value)
        if not k.InitializeProcThreadAttributeList(attributes, 2, 0, c.byref(length)):
            raise RuntimeError('SANDBOX_ATTRIBUTES_FAILED')
        caps = CAPABILITIES(sid, None, 0, 0)
        if not k.UpdateProcThreadAttribute(attributes, 0, 0x20009, c.byref(caps), c.sizeof(caps), None, None):
            raise RuntimeError('SANDBOX_CAPABILITIES_FAILED')
        startup = STARTUPINFOEX(); startup.startup.cb = c.sizeof(startup); startup.attributes = c.cast(attributes, c.c_void_p)
        sa = SECURITYATTR(c.sizeof(SECURITYATTR), None, True)
        null = k.CreateFileW('NUL', 0x80000000, 3, c.byref(sa), 3, 0x80, None)
        log = k.CreateFileW(str(output / 'process.log'), 0x40000000, 1, c.byref(sa), 2, 0x80, None)
        if null in (None, c.c_void_p(-1).value) or log in (None, c.c_void_p(-1).value):
            raise RuntimeError('SANDBOX_LOG_FAILED')
        handles = [null, log]
        allowed_handles = (w.HANDLE * 2)(*handles)
        if not k.UpdateProcThreadAttribute(attributes, 0, 0x20002, allowed_handles, c.sizeof(allowed_handles), None, None):
            raise RuntimeError('SANDBOX_HANDLES_FAILED')
        startup.startup.flags = 0x100
        startup.startup.stdin = null; startup.startup.stdout = log; startup.startup.stderr = log
        env = {name: os.environ[name] for name in ('SYSTEMROOT', 'WINDIR', 'SYSTEMDRIVE', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'PROGRAMDATA', 'MEDIA_FFMPEG', 'MEDIA_FFPROBE') if name in os.environ}
        env.update({'TEMP': str(output), 'TMP': str(output), 'PYTHONUTF8': '1', 'PATH': str(Path(executable).parent)})
        environment = c.create_unicode_buffer('\0'.join(f'{name}={value}' for name, value in sorted(env.items())) + '\0\0')
        command = c.create_unicode_buffer(subprocess.list2cmdline([executable, *args]))
        job = k.CreateJobObjectW(None, None)
        limits = EXTENDED(); limits.basic.flags = 0x4 | 0x8 | 0x200 | 0x2000
        limits.basic.job_time = 120 * 10_000_000; limits.basic.active = processes; limits.job_memory = memory
        if not job or not k.SetInformationJobObject(job, 9, c.byref(limits), c.sizeof(limits)):
            raise RuntimeError('SANDBOX_JOB_FAILED')
        # Suspended until assigned to the Job. Only NUL and this run's own log are inherited.
        if not k.CreateProcessW(executable, command, None, None, True, 0x80000 | 0x8000000 | 0x400 | 0x4,
                                environment, str(output), c.byref(startup), c.byref(info)):
            raise RuntimeError('SANDBOX_PROCESS_FAILED:' + str(c.get_last_error()))
        if not k.AssignProcessToJobObject(job, info.process):
            raise RuntimeError('SANDBOX_ASSIGN_FAILED')
        if k.ResumeThread(info.thread) == 0xFFFFFFFF:
            raise RuntimeError('SANDBOX_RESUME_FAILED')
        if k.WaitForSingleObject(info.process, timeout * 1000) != 0:
            k.TerminateJobObject(job, 1)
            raise RuntimeError('SANDBOX_TIMEOUT')
        code = w.DWORD()
        if not k.GetExitCodeProcess(info.process, c.byref(code)):
            raise RuntimeError('SANDBOX_EXIT_FAILED')
        return code.value
    finally:
        if job:
            k.TerminateJobObject(job, 1); k.CloseHandle(job)
        if info.thread: k.CloseHandle(info.thread)
        if info.process: k.CloseHandle(info.process)
        for handle in handles: k.CloseHandle(handle)
        if attributes is not None: k.DeleteProcThreadAttributeList(attributes)
        cleaned = True
        if sid_text:
            for path in reversed(grants):
                try: acl(path, '/remove:g', '*' + sid_text.value)
                except Exception: cleaned = False
            k.LocalFree(sid_text)
        a.FreeSid(sid)
        if u.DeleteAppContainerProfile(profile) != 0: cleaned = False
        if cleaned: record.unlink(missing_ok=True)


if __name__ == '__main__':
    try:
        source, mime, output = sys.argv[1:4]
        folders = [str(Path(sys.executable).parent)]
        if mime in ('video/mp4', 'audio/mpeg', 'audio/wav'):
            folders += [str(Path(os.environ['MEDIA_FFMPEG']).parent), str(Path(os.environ['MEDIA_FFPROBE']).parent)]
        script = Path(__file__).with_name('render.py')
        sys.exit(run(sys.executable, ['-I', '-B', str(script), source, mime, output], folders, [script, source], output))
    except Exception:
        sys.exit(1)
