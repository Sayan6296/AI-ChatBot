import json
import os
import urllib.error
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from dotenv import load_dotenv


load_dotenv()

HOST = "0.0.0.0"
PORT = int(os.environ.get("PORT", 8000))
DISPLAY_HOST = os.environ.get("APP_HOST", "127.0.0.1")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "openai/gpt-4o-mini"

# In-memory conversation storage keyed by session_id.
CHAT_HISTORY = {}


def build_json_response(handler, payload, status=200):
    response_bytes = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(response_bytes)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.end_headers()
    handler.wfile.write(response_bytes)


def call_openrouter(messages):
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY is not set in environment variables.")

    payload = {
        "model": MODEL,
        "messages": messages,
    }
    body = json.dumps(payload).encode("utf-8")

    request = urllib.request.Request(
        OPENROUTER_URL,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:5173",
            "X-Title": "Core Python Chatbot",
        },
    )

    with urllib.request.urlopen(request, timeout=60) as response:
        data = json.loads(response.read().decode("utf-8"))
        return data["choices"][0]["message"]["content"]


class ChatHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/health"):
            build_json_response(self, {"ok": True})
            return

        if self.path.startswith("/history"):
            _, _, query = self.path.partition("?")
            session_id = ""
            if query.startswith("session_id="):
                session_id = query.replace("session_id=", "", 1)
            history = CHAT_HISTORY.get(session_id, [])
            build_json_response(self, {"session_id": session_id, "history": history})
            return

        build_json_response(self, {"error": "Not found"}, status=404)

    def do_POST(self):
        if self.path != "/chat":
            build_json_response(self, {"error": "Not found"}, status=404)
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(content_length)
            body = json.loads(raw_body.decode("utf-8"))
            user_message = (body.get("message") or "").strip()
            session_id = body.get("session_id") or str(uuid.uuid4())

            if not user_message:
                build_json_response(self, {"error": "message is required"}, status=400)
                return

            history = CHAT_HISTORY.setdefault(session_id, [])
            history.append({"role": "user", "content": user_message})

            assistant_reply = call_openrouter(history)
            history.append({"role": "assistant", "content": assistant_reply})

            build_json_response(
                self,
                {
                    "session_id": session_id,
                    "reply": assistant_reply,
                    "history": history,
                },
            )
        except urllib.error.HTTPError as error:
            details = error.read().decode("utf-8", errors="replace")
            build_json_response(
                self,
                {"error": "OpenRouter HTTP error", "details": details},
                status=502,
            )
        except urllib.error.URLError as error:
            build_json_response(
                self,
                {"error": "OpenRouter connection failed", "details": str(error)},
                status=502,
            )
        except RuntimeError as error:
            build_json_response(self, {"error": str(error)}, status=500)
        except Exception as error:
            build_json_response(
                self,
                {"error": "Internal server error", "details": str(error)},
                status=500,
            )


if __name__ == "__main__":
    server = HTTPServer((HOST, PORT), ChatHandler)
    print(f"Backend running on port {PORT}")
    server.serve_forever()
