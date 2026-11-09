import asyncio
import os
import subprocess
import threading
import uuid
from typing import Dict, Any, Optional

from fastapi import FastAPI, HTTPException, BackgroundTasks, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .downloader import inspect_url, download_media, resolve_downloads_dir

app = FastAPI(title="Media Downloader", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(STATIC_DIR, exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

jobs_lock = threading.Lock()
jobs: Dict[str, Dict[str, Any]] = {}


class InspectRequest(BaseModel):
    url: str
    cookies_path: Optional[str] = None


class DownloadRequest(BaseModel):
    url: str
    mode: str = "video"  # "video" | "audio"
    quality: str = "best"
    download_type: str = "single"  # "single" | "playlist"
    playlist_range: Optional[str] = None
    output_dir: Optional[str] = None
    cookies_path: Optional[str] = None


class OpenFolderRequest(BaseModel):
    path: Optional[str] = None


@app.get("/", response_class=HTMLResponse)
async def serve_index():
    index_file = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return HTMLResponse("<h1>Media Downloader Loading...</h1>")


@app.post("/api/inspect")
async def api_inspect(req: InspectRequest):
    if not req.url or not req.url.strip():
        raise HTTPException(status_code=400, detail="URL cannot be empty")
    try:
        loop = asyncio.get_event_loop()
        data = await loop.run_in_executor(None, inspect_url, req.url.strip(), req.cookies_path)
        return {"success": True, "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def run_download_job(job_id: str, req: DownloadRequest):
    def update_progress(data: Dict[str, Any]):
        with jobs_lock:
            if job_id in jobs:
                jobs[job_id].update(data)

    try:
        with jobs_lock:
            jobs[job_id]["status"] = "starting"
            jobs[job_id]["percent"] = 2.0
            jobs[job_id]["speed"] = "Connecting..."
            jobs[job_id]["eta"] = "..."

        download_media(
            url=req.url.strip(),
            mode=req.mode,
            quality=req.quality,
            download_type=req.download_type,
            playlist_range=req.playlist_range,
            output_dir=req.output_dir,
            cookies_path=req.cookies_path,
            progress_callback=update_progress,
        )
    except Exception as e:
        with jobs_lock:
            if job_id in jobs:
                jobs[job_id]["status"] = "error"
                jobs[job_id]["error"] = str(e)


@app.post("/api/download")
async def api_download(req: DownloadRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    save_dir = resolve_downloads_dir(req.output_dir)

    with jobs_lock:
        jobs[job_id] = {
            "id": job_id,
            "url": req.url,
            "mode": req.mode,
            "quality": req.quality,
            "download_type": req.download_type,
            "save_path": save_dir,
            "status": "queued",
            "percent": 0.0,
            "speed": "0 MB/s",
            "eta": "Calculating...",
            "title": "Pending...",
            "filename": "",
            "error": None,
        }

    thread = threading.Thread(target=run_download_job, args=(job_id, req), daemon=True)
    thread.start()

    return {"success": True, "job_id": job_id, "save_path": save_dir}


@app.get("/api/progress/{job_id}")
async def api_progress(job_id: str):
    with jobs_lock:
        job = jobs.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        return job


@app.get("/api/downloads")
async def api_list_downloads(dir: Optional[str] = Query(None)):
    target_dir = resolve_downloads_dir(dir)
    files = []
    if os.path.exists(target_dir):
        for entry in os.scandir(target_dir):
            if entry.is_file():
                size_mb = round(entry.stat().st_size / (1024 * 1024), 2)
                files.append({
                    "name": entry.name,
                    "size_mb": size_mb,
                    "modified": int(entry.stat().st_mtime),
                })
    files.sort(key=lambda x: x["modified"], reverse=True)
    return {"files": files[:20], "downloads_dir": target_dir}


@app.post("/api/open-folder")
async def api_open_folder(req: OpenFolderRequest):
    target = resolve_downloads_dir(req.path)
    try:
        subprocess.Popen(["xdg-open", target])
        return {"success": True, "path": target}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
