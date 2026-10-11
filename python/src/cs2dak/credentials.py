"""Shared OS credential adapters; no UI or product imports or raw command errors."""
import subprocess


def _macos_credential_command(operation: str, service: str, account: str, value=None):
    commands = {"READ": "find-generic-password", "WRITE": "add-generic-password",
                "DELETE": "delete-generic-password"}
    args = ["/usr/bin/security", commands[operation]]
    if operation == "WRITE":
        args.append("-U")
    args.extend(["-s", service, "-a", account])
    if operation != "DELETE":
        args.append("-w")
    if operation == "WRITE":
        args.append(value)
    # TimeoutExpired contains argv (including the secret), stdout and stderr.
    # Convert only safe OS categories and raise outside except to detach them.
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=30, check=False)
    except subprocess.TimeoutExpired:
        reason = "调用超时（30 秒），请先检查钥匙串访问提示"
    except OSError as error:
        reason = f"系统调用失败（系统错误 {error.errno}）"
    except UnicodeError:
        reason = "返回内容无法解码"
    else:
        if result.returncode == 0:
            return result
        # security returns OSStatus; process exit status retains its low byte.
        # Apple SecBase.h: errSecItemNotFound = -25300. Only read/delete allow absence.
        if operation != "WRITE" and result.returncode == (-25300 & 0xff):
            return None
        reason = f"系统拒绝操作（退出码 {result.returncode}）"
    raise RuntimeError(
        f"CREDENTIAL_{operation}：macOS 钥匙串{reason}；"
        "请在钥匙串访问中解锁登录钥匙串，确认允许本应用访问后重试"
    )


def _macos_credential_get(service: str, account: str) -> str | None:
    result = _macos_credential_command("READ", service, account)
    return result.stdout.rstrip("\r\n") if result is not None else None


def _macos_credential_set(service: str, account: str, value: str) -> bool:
    _macos_credential_command("WRITE", service, account, value)
    return True


def _macos_credential_delete(service: str, account: str) -> bool:
    _macos_credential_command("DELETE", service, account)
    return True


def _windows_credential_target(service: str, account: str) -> str:
    return f"{service}:{account}"


def _windows_credential_get(service: str, account: str) -> str | None:
    """Read a generic credential from the per-user Windows Credential Manager."""
    import ctypes
    from ctypes import wintypes

    class _FileTime(ctypes.Structure):
        _fields_ = [("low", wintypes.DWORD), ("high", wintypes.DWORD)]

    class _Credential(ctypes.Structure):
        _fields_ = [
            ("flags", wintypes.DWORD),
            ("type", wintypes.DWORD),
            ("target_name", wintypes.LPWSTR),
            ("comment", wintypes.LPWSTR),
            ("last_written", _FileTime),
            ("blob_size", wintypes.DWORD),
            ("blob", ctypes.POINTER(ctypes.c_ubyte)),
            ("persist", wintypes.DWORD),
            ("attribute_count", wintypes.DWORD),
            ("attributes", ctypes.c_void_p),
            ("target_alias", wintypes.LPWSTR),
            ("user_name", wintypes.LPWSTR),
        ]

    api = ctypes.WinDLL("Advapi32.dll", use_last_error=True)
    read = api.CredReadW
    read.argtypes = [
        wintypes.LPWSTR,
        wintypes.DWORD,
        wintypes.DWORD,
        ctypes.POINTER(ctypes.POINTER(_Credential)),
    ]
    read.restype = wintypes.BOOL
    credential = ctypes.POINTER(_Credential)()
    if not read(_windows_credential_target(service, account), 1, 0, ctypes.byref(credential)):
        code = ctypes.get_last_error()
        if code == 1168:  # ERROR_NOT_FOUND is the only absent-credential result.
            return None
        reason = {5: "访问被拒绝", 1312: "登录会话不存在"}.get(code, "系统调用失败")
        raise OSError(code, f"CREDENTIAL_READ：Windows 安全存储{reason}，请检查凭据管理器与系统权限")
    try:
        size = credential.contents.blob_size
        if size == 0:
            return ""
        return ctypes.string_at(credential.contents.blob, size).decode("utf-16-le")
    except (UnicodeDecodeError, ValueError):
        # Decode errors may include secret blob bytes; never chain or render them.
        pass
    finally:
        api.CredFree(credential)
    # Raise outside the except block, so diagnostic walkers cannot read its context.
    raise ValueError("CREDENTIAL_DECODE：Windows 凭据格式无效，请重新授权")


def _windows_credential_set(service: str, account: str, value: str) -> bool:
    """Write a generic credential to the per-user Windows Credential Manager."""
    import ctypes
    from ctypes import wintypes

    class _FileTime(ctypes.Structure):
        _fields_ = [("low", wintypes.DWORD), ("high", wintypes.DWORD)]

    class _Credential(ctypes.Structure):
        _fields_ = [
            ("flags", wintypes.DWORD),
            ("type", wintypes.DWORD),
            ("target_name", wintypes.LPWSTR),
            ("comment", wintypes.LPWSTR),
            ("last_written", _FileTime),
            ("blob_size", wintypes.DWORD),
            ("blob", ctypes.POINTER(ctypes.c_ubyte)),
            ("persist", wintypes.DWORD),
            ("attribute_count", wintypes.DWORD),
            ("attributes", ctypes.c_void_p),
            ("target_alias", wintypes.LPWSTR),
            ("user_name", wintypes.LPWSTR),
        ]

    encoded = value.encode("utf-16-le")
    blob = (ctypes.c_ubyte * len(encoded)).from_buffer_copy(encoded)
    credential = _Credential()
    credential.type = 1  # CRED_TYPE_GENERIC
    credential.target_name = _windows_credential_target(service, account)
    credential.blob_size = len(encoded)
    credential.blob = ctypes.cast(blob, ctypes.POINTER(ctypes.c_ubyte))
    credential.persist = 2  # CRED_PERSIST_LOCAL_MACHINE, encrypted per user
    credential.user_name = account

    api = ctypes.WinDLL("Advapi32.dll", use_last_error=True)
    write = api.CredWriteW
    write.argtypes = [ctypes.POINTER(_Credential), wintypes.DWORD]
    write.restype = wintypes.BOOL
    if write(ctypes.byref(credential), 0):
        return True
    code = ctypes.get_last_error()
    raise OSError(code, "CREDENTIAL_WRITE：Windows 安全存储拒绝写入，请检查凭据管理器与系统权限")


def _windows_credential_delete(service: str, account: str) -> bool:
    """Delete a generic credential from the per-user Windows Credential Manager."""
    import ctypes
    from ctypes import wintypes

    api = ctypes.WinDLL("Advapi32.dll", use_last_error=True)
    delete = api.CredDeleteW
    delete.argtypes = [wintypes.LPWSTR, wintypes.DWORD, wintypes.DWORD]
    delete.restype = wintypes.BOOL
    if delete(_windows_credential_target(service, account), 1, 0):
        return True
    # Deleting an already absent item is idempotent for disconnect/reconnect.
    code = ctypes.get_last_error()
    if code == 1168:
        return True
    raise OSError(code, "CREDENTIAL_DELETE：Windows 安全存储拒绝删除，请检查凭据管理器与系统权限")
