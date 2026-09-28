"""Shared Windows Credential Manager adapter; no UI or product imports."""
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
        return None
    try:
        size = credential.contents.blob_size
        if size == 0:
            return ""
        return ctypes.string_at(credential.contents.blob, size).decode("utf-16-le")
    except (UnicodeDecodeError, ValueError):
        return None
    finally:
        api.CredFree(credential)


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
    return bool(write(ctypes.byref(credential), 0))


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
    return ctypes.get_last_error() == 1168  # ERROR_NOT_FOUND
