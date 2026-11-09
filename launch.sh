#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

PORT=8765
URL="http://127.0.0.1:${PORT}"

# Ensure virtual environment exists
if [ ! -d ".venv" ]; then
    echo "[*] Creating virtual environment..."
    python3 -m venv .venv
    .venv/bin/pip install --upgrade pip
    .venv/bin/pip install yt-dlp fastapi uvicorn
fi

# Ensure downloads directory exists
mkdir -p downloads

# Stop any outdated instance running on port 8765
OLD_PID=$(fuser "${PORT}/tcp" 2>/dev/null || true)
if [ -n "$OLD_PID" ]; then
    echo "[*] Updating server on port $PORT (stopping PID $OLD_PID)..."
    kill -9 $OLD_PID 2>/dev/null || true
    sleep 0.5
fi

echo "[*] Launching Media Downloader Web Service on port $PORT..."
nohup .venv/bin/python -m uvicorn app.server:app --host 127.0.0.1 --port "$PORT" </dev/null > server.log 2>&1 &
SERVER_PID=$!
disown "$SERVER_PID" 2>/dev/null || true

echo "[+] Server running in background (PID: $SERVER_PID)."

# Wait briefly for server startup
for i in {1..15}; do
    if curl -s "$URL" >/dev/null 2>&1; then
        echo "[✓] Ready! Launching browser at $URL..."
        xdg-open "$URL" >/dev/null 2>&1 &
        exit 0
    fi
    sleep 0.3
done

echo "[!] Server started. Open $URL in your browser."
