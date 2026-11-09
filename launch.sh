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

# Check if server is already running
if curl -s -o /dev/null -w "%{http_code}" "$URL" | grep -q "200"; then
    echo "[+] Server is already active at $URL. Opening browser..."
    xdg-open "$URL" >/dev/null 2>&1 &
    exit 0
fi

echo "[*] Launching Media Downloader Web Service on port $PORT..."
# Start server in background detached from subshell
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
    sleep 0.4
done

echo "[!] Server started. Open $URL in your browser."
