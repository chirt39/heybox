"""Read-only Steam Cloud access for Elden Ring Nightreign saves.

OAuth tokens and file bytes are kept in process memory only. This module never
writes Steam credentials, cloud files, or save contents to the application DB.
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
import re
import secrets
import time
from dataclasses import dataclass, field
from urllib.parse import urlencode, urlsplit

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, ConfigDict, Field


router = APIRouter(prefix="/api/steam", tags=["Steam Cloud"])

GAME_APP_ID = 2622380
GAME_NAME = "艾尔登法环：黑夜君临"
MAX_SAVE_BYTES = 64 * 1024 * 1024
MAX_CHUNK_BYTES = 2 * 1024 * 1024
SESSION_TTL_SECONDS = 10 * 60
MAX_SESSIONS = 500
ENUMERATE_URL = "https://api.steampowered.com/ICloudService/EnumerateUserFiles/v1/"
STEAM_OAUTH_URL = "https://steamcommunity.com/oauth/login"
STEAM_CLIENT_ID = os.getenv("STEAM_OAUTH_CLIENT_ID", "").strip()
STEAM_REDIRECT_URI = os.getenv("STEAM_OAUTH_REDIRECT_URI", "").strip()

_sessions: dict[str, "SteamSession"] = {}
_sessions_lock = asyncio.Lock()
_rate_buckets: dict[tuple[str, str], list[float]] = {}
_rate_lock = asyncio.Lock()


@dataclass
class SteamSession:
    session_id: str
    state: str
    expires_at: float
    access_token: str | None = None
    error: str | None = None
    files_loaded: bool = False
    files: dict[str, dict] = field(default_factory=dict)


class StrictBody(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class OAuthCallbackBody(StrictBody):
    state: str = Field(min_length=24, max_length=128)
    access_token: str | None = Field(default=None, min_length=1, max_length=2048)
    error: str | None = Field(default=None, max_length=80)


class SessionBody(StrictBody):
    session_id: str = Field(min_length=32, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")


class DownloadBody(SessionBody):
    file_id: str = Field(min_length=1, max_length=128)


class DownloadChunkBody(DownloadBody):
    offset: int = Field(ge=0, le=MAX_SAVE_BYTES)
    length: int = Field(ge=1, le=MAX_CHUNK_BYTES)


def _configured() -> bool:
    if not STEAM_CLIENT_ID or not STEAM_REDIRECT_URI:
        return False
    try:
        uri = urlsplit(STEAM_REDIRECT_URI)
        local = uri.hostname in {"localhost", "127.0.0.1", "::1"}
        return (
            uri.scheme == ("http" if local else "https")
            and bool(uri.netloc)
            and not uri.username
            and not uri.password
            and uri.path == "/api/steam/oauth/callback"
            and not uri.query
            and not uri.fragment
        )
    except ValueError:
        return False


async def _purge_sessions() -> None:
    now = time.monotonic()
    async with _sessions_lock:
        expired = [key for key, value in _sessions.items() if value.expires_at <= now]
        for key in expired:
            session = _sessions.pop(key, None)
            if session is not None:
                session.access_token = None
                session.files.clear()
        if len(_sessions) > MAX_SESSIONS:
            oldest = sorted(_sessions, key=lambda key: _sessions[key].expires_at)
            for key in oldest[: len(_sessions) - MAX_SESSIONS]:
                session = _sessions.pop(key, None)
                if session is not None:
                    session.access_token = None
                    session.files.clear()


async def cleanup_expired_steam_sessions() -> None:
    """Periodically erase expired OAuth tokens and signed cloud URLs."""
    while True:
        await _purge_sessions()
        await asyncio.sleep(30)


async def _rate_limit(request: Request, action: str, limit: int) -> None:
    client = request.client.host if request.client else "unknown"
    now = time.monotonic()
    key = (client, action)
    async with _rate_lock:
        timestamps = [stamp for stamp in _rate_buckets.get(key, []) if now - stamp < 60]
        if len(timestamps) >= limit:
            _rate_buckets[key] = timestamps
            raise HTTPException(status_code=429, detail="Steam 云存档请求过于频繁，请稍后重试。")
        timestamps.append(now)
        _rate_buckets[key] = timestamps


def _session_not_found() -> HTTPException:
    return HTTPException(status_code=410, detail="Steam 授权会话已过期，请重新登录。")


async def _find_session(session_id: str) -> SteamSession:
    await _purge_sessions()
    async with _sessions_lock:
        session = _sessions.get(session_id)
        if session is None:
            raise _session_not_found()
        return session


@router.get("/cloud/config")
async def steam_cloud_config() -> dict:
    return {
        "enabled": _configured(),
        "game_name": GAME_NAME,
        "max_save_bytes": MAX_SAVE_BYTES,
        "message": "Steam OAuth Client ID 与回调地址尚未配置。" if not _configured() else None,
    }


@router.post("/cloud/sessions")
async def create_steam_session(request: Request) -> dict:
    if not _configured():
        raise HTTPException(status_code=503, detail="Steam 云存档服务尚未完成 Valve OAuth 配置。")
    await _rate_limit(request, "steam-session", 5)
    await _purge_sessions()

    session_id = secrets.token_urlsafe(32)
    state = secrets.token_urlsafe(32)
    session = SteamSession(
        session_id=session_id,
        state=state,
        expires_at=time.monotonic() + SESSION_TTL_SECONDS,
    )
    async with _sessions_lock:
        _sessions[session_id] = session

    authorize_url = f"{STEAM_OAUTH_URL}?{urlencode({'response_type': 'token', 'client_id': STEAM_CLIENT_ID, 'state': state, 'mobileminimal': '1'})}"
    return {
        "session_id": session_id,
        "authorize_url": authorize_url,
        "expires_in": SESSION_TTL_SECONDS,
    }


@router.get("/oauth/callback", response_class=HTMLResponse)
async def steam_oauth_callback_page() -> HTMLResponse:
    if not _configured():
        raise HTTPException(status_code=503, detail="Steam OAuth 尚未配置。")
    html = """<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Cache-Control" content="no-store"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; connect-src 'self'; style-src 'unsafe-inline'"><title>Steam 授权</title><style>body{margin:0;padding:40px 22px;background:#101820;color:#eee;font:16px/1.7 system-ui,sans-serif}main{max-width:520px;margin:10vh auto;padding:24px;border:1px solid #40515b;border-radius:16px;background:#17242b}h1{font-size:22px}p{color:#b6c3c4}</style><main><h1 id="title">正在完成 Steam 授权…</h1><p id="message">完成后返回小程序继续选择云存档。</p></main><script>
(() => {
  const title = document.getElementById('title');
  const message = document.getElementById('message');
  const params = new URLSearchParams(location.hash.slice(1));
  const state = params.get('state') || '';
  let accessToken = params.get('access_token') || '';
  const error = params.get('error') || '';
  history.replaceState(null, '', location.pathname + location.search);
  if (!state || (!accessToken && !error)) {
    title.textContent = '没有收到 Steam 授权结果';
    message.textContent = '请返回小程序，重新点击登录 Steam。';
    return;
  }
  const callbackRequest = fetch(location.pathname, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ state, access_token: accessToken || null, error: error || null })
  });
  accessToken = '';
  params.delete('access_token');
  callbackRequest.then(response => {
    if (!response.ok) throw new Error('callback');
    title.textContent = error ? '你取消了 Steam 授权' : 'Steam 授权已完成';
    message.textContent = error ? '返回小程序后可以重新尝试。' : '请返回小程序，检查授权状态并选择存档。';
  }).catch(() => {
    title.textContent = '授权确认失败';
    message.textContent = '请返回小程序重新登录；如果反复失败，请稍后再试。';
  });
})();
</script></html>"""
    return HTMLResponse(
        html,
        headers={
            "Cache-Control": "no-store, max-age=0",
            "Pragma": "no-cache",
            "Referrer-Policy": "no-referrer",
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
        },
    )


@router.post("/oauth/callback")
async def receive_steam_oauth_callback(body: OAuthCallbackBody, request: Request) -> dict:
    if not _configured():
        raise HTTPException(status_code=503, detail="Steam OAuth 尚未配置。")
    expected_origin = f"{urlsplit(STEAM_REDIRECT_URI).scheme}://{urlsplit(STEAM_REDIRECT_URI).netloc}"
    origin = request.headers.get("origin")
    if origin and origin.rstrip("/") != expected_origin.rstrip("/"):
        raise HTTPException(status_code=403, detail="Steam 授权回调来源无效。")

    await _purge_sessions()
    async with _sessions_lock:
        session = next((item for item in _sessions.values() if secrets.compare_digest(item.state, body.state)), None)
        if session is None:
            raise HTTPException(status_code=400, detail="Steam 授权状态无效或已使用。")
        session.state = "consumed"
        if body.error:
            session.error = "你取消了 Steam 授权。"
            return {"ok": True}
        token = (body.access_token or "").strip()
        if not token or any(char.isspace() for char in token):
            session.error = "Steam 没有返回有效授权。"
            raise HTTPException(status_code=400, detail=session.error)
        session.access_token = token
        session.files.clear()
        session.files_loaded = False
    return {"ok": True}


@router.post("/cloud/session")
async def get_steam_session(body: SessionBody) -> dict:
    session = await _find_session(body.session_id)
    if session.error:
        return {"status": "error", "message": session.error}
    return {"status": "authorized" if session.access_token else "pending"}


@router.post("/cloud/session/revoke")
async def revoke_steam_session(body: SessionBody) -> dict:
    async with _sessions_lock:
        session = _sessions.pop(body.session_id, None)
        if session is not None:
            session.access_token = None
            session.files.clear()
            session.state = "revoked"
    return {"ok": True}


async def _load_steam_files(session: SteamSession) -> list[dict]:
    token = session.access_token
    if not token:
        raise HTTPException(status_code=401, detail="请先完成 Steam 授权。")
    payload = {"appid": GAME_APP_ID, "extended_details": True, "count": 500, "start_index": 0}
    timeout = httpx.Timeout(connect=8.0, read=25.0, write=10.0, pool=8.0)
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
            response = await client.post(
                ENUMERATE_URL,
                data={"access_token": token, "input_json": json.dumps(payload, separators=(",", ":"))},
                headers={"Accept": "application/json"},
            )
        response.raise_for_status()
        data = response.json()
    except (httpx.HTTPError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=502, detail="暂时无法读取 Steam 云存档列表，请稍后重试。") from exc

    result = data.get("response", data) if isinstance(data, dict) else None
    if not isinstance(result, dict) or result.get("eresult", 1) not in (1, "1"):
        raise HTTPException(status_code=502, detail="Steam 未能返回云存档列表；请确认游戏云同步已开启。")
    raw_files = result.get("files", [])
    if not isinstance(raw_files, list):
        raise HTTPException(status_code=502, detail="Steam 返回的云存档清单格式无效。")

    selected: dict[str, dict] = {}
    for item in raw_files:
        if not isinstance(item, dict):
            continue
        filename = item.get("filename")
        file_url = item.get("url")
        file_id = item.get("ugcid")
        try:
            file_size = int(item.get("file_size", -1))
        except (TypeError, ValueError):
            continue
        if not isinstance(filename, str) or not filename.lower().endswith(".sl2"):
            continue
        if not isinstance(file_url, str) or not file_id or file_size < 0:
            continue
        selected[str(file_id)] = {
            "id": str(file_id),
            "name": filename,
            "size": file_size,
            "timestamp": item.get("timestamp"),
            "url": file_url,
        }

    newest_first = sorted(
        selected.values(),
        key=lambda item: int(item["timestamp"]) if str(item["timestamp"]).isdigit() else 0,
        reverse=True,
    )
    async with _sessions_lock:
        current = _sessions.get(session.session_id)
        if current is None or current.expires_at <= time.monotonic():
            raise _session_not_found()
        current.files = {item["id"]: item for item in newest_first}
        current.files_loaded = True
    return [{key: value for key, value in item.items() if key != "url"} for item in newest_first]


@router.post("/cloud/files")
async def get_steam_cloud_files(body: SessionBody, request: Request) -> dict:
    await _rate_limit(request, "steam-files", 10)
    session = await _find_session(body.session_id)
    if not session.access_token:
        if session.error:
            raise HTTPException(status_code=401, detail=session.error)
        raise HTTPException(status_code=409, detail="请先完成 Steam 授权。")
    files = await _load_steam_files(session)
    return {"files": files, "max_save_bytes": MAX_SAVE_BYTES}


def _validate_download_url(value: str) -> bool:
    try:
        parsed = urlsplit(value)
        host = parsed.hostname or ""
        return (
            parsed.scheme == "https"
            and not parsed.username
            and not parsed.password
            and parsed.port in (None, 443)
            and host.endswith(".storage.googleapis.com")
            and re.fullmatch(r"[A-Za-z0-9.-]+", host) is not None
        )
    except ValueError:
        return False


@router.post("/cloud/download-chunk")
async def download_steam_cloud_chunk(body: DownloadChunkBody, request: Request) -> dict:
    await _rate_limit(request, "steam-download-chunk", 120)
    session = await _find_session(body.session_id)
    if not session.access_token:
        raise HTTPException(status_code=401, detail="Steam 授权已失效，请重新登录。")
    if not session.files_loaded:
        raise HTTPException(status_code=409, detail="请先读取云存档列表。")
    item = session.files.get(body.file_id)
    if item is None:
        raise HTTPException(status_code=404, detail="该云存档不在当前 Steam 授权清单中，请刷新列表。")
    if item["size"] > MAX_SAVE_BYTES:
        raise HTTPException(status_code=413, detail="该云存档超过当前设备 64 MiB 的端内解析上限。")
    if body.offset >= item["size"]:
        raise HTTPException(status_code=416, detail="云存档分段位置超出文件范围。")
    expected_length = min(body.length, item["size"] - body.offset)
    end = body.offset + expected_length - 1
    file_url = item["url"]
    if not _validate_download_url(file_url):
        raise HTTPException(status_code=502, detail="Steam 返回的云存档下载地址无效。")

    timeout = httpx.Timeout(connect=8.0, read=25.0, write=10.0, pool=8.0)
    chunks: list[bytes] = []
    total = 0
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
            async with client.stream(
                "GET",
                file_url,
                headers={"Accept": "application/octet-stream", "Range": f"bytes={body.offset}-{end}"},
            ) as upstream:
                if upstream.status_code != 206:
                    raise HTTPException(status_code=502, detail="Steam 云存档下载失败，请刷新列表后重试。")
                if upstream.headers.get("content-range") != f"bytes {body.offset}-{end}/{item['size']}":
                    raise HTTPException(status_code=502, detail="Steam 返回的云存档分段位置无效。")
                async for chunk in upstream.aiter_bytes(64 * 1024):
                    total += len(chunk)
                    if total > expected_length:
                        raise HTTPException(status_code=502, detail="Steam 返回的云存档分段超过请求大小。")
                    chunks.append(chunk)
    except HTTPException:
        raise
    except (httpx.HTTPError, ValueError):
        raise HTTPException(status_code=502, detail="Steam 云存档下载中断，请重试。") from None
    if total != expected_length:
        raise HTTPException(status_code=502, detail="Steam 云存档分段未完整下载，请重试。")

    return {
        "offset": body.offset,
        "total_size": item["size"],
        "chunk_size": total,
        "data": base64.b64encode(b"".join(chunks)).decode("ascii"),
    }
