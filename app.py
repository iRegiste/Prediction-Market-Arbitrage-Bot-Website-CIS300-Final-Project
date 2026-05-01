import csv
import os
import re
import smtplib
import ssl
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
PNL_FILE = DATA_DIR / "pnl.csv"
CONTACT_LOG_FILE = DATA_DIR / "contact_messages.csv"
ENV_FILE = BASE_DIR / ".env"

DEFAULT_RECIPIENT = "ianregister1@gmail.com"
EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

app = Flask(__name__)


def load_env_file(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")

        if key and key not in os.environ:
            os.environ[key] = value


def ensure_data_files() -> None:
    DATA_DIR.mkdir(exist_ok=True)

    if not CONTACT_LOG_FILE.exists():
        CONTACT_LOG_FILE.write_text(
            "timestamp_utc,name,email,subject,message\n",
            encoding="utf-8",
        )


ensure_data_files()
load_env_file(ENV_FILE)


def get_allowed_origin(request_origin: str) -> str:
    configured = os.getenv("CORS_ALLOWED_ORIGINS", "*").strip()
    if configured == "*":
        return "*"

    allowed_origins = [origin.strip() for origin in configured.split(",") if origin.strip()]
    if not allowed_origins:
        return "*"

    if request_origin and request_origin in allowed_origins:
        return request_origin

    return allowed_origins[0]


@app.after_request
def add_cors_headers(response):
    allowed_origin = get_allowed_origin(request.headers.get("Origin", ""))
    response.headers["Access-Control-Allow-Origin"] = allowed_origin
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Vary"] = "Origin"
    return response


def parse_float(value: str) -> float:
    return float(str(value).strip().replace(",", ""))


def read_pnl_rows() -> list[dict]:
    if not PNL_FILE.exists():
        return []

    rows: list[dict] = []
    with PNL_FILE.open("r", newline="", encoding="utf-8") as file:
        reader = csv.DictReader(file)
        for row in reader:
            rows.append(
                {
                    "date": row["date"],
                    "polymarket": parse_float(row["polymarket"]),
                    "kalshi": parse_float(row["kalshi"]),
                    "daily_pl": parse_float(row["daily_pl"]),
                    "total_equity": parse_float(row["total_equity"]),
                }
            )
    return rows


def append_contact_log(payload: dict) -> None:
    timestamp = datetime.now(timezone.utc).isoformat()

    with CONTACT_LOG_FILE.open("a", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        writer.writerow(
            [
                timestamp,
                payload["name"],
                payload["email"],
                payload["subject"],
                payload["message"],
            ]
        )


def send_contact_email(payload: dict) -> None:
    recipient = os.getenv("CONTACT_TO_EMAIL", DEFAULT_RECIPIENT)
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_username = os.getenv("SMTP_USERNAME", "")
    smtp_password = os.getenv("SMTP_PASSWORD", "")
    smtp_from = os.getenv("SMTP_FROM_EMAIL", smtp_username or DEFAULT_RECIPIENT)

    if not smtp_username or not smtp_password:
        raise RuntimeError(
            "SMTP is not configured. Set SMTP_USERNAME and SMTP_PASSWORD in your environment."
        )

    message = EmailMessage()
    message["Subject"] = f"Website Contact: {payload['subject']}"
    message["From"] = smtp_from
    message["To"] = recipient
    message["Reply-To"] = payload["email"]
    message.set_content(
        "\n".join(
            [
                "New contact form submission:",
                "",
                f"Name: {payload['name']}",
                f"Email: {payload['email']}",
                f"Subject: {payload['subject']}",
                "",
                "Message:",
                payload["message"],
            ]
        )
    )

    context = ssl.create_default_context()
    use_ssl = os.getenv("SMTP_USE_SSL", "false").lower() == "true"
    use_tls = os.getenv("SMTP_USE_TLS", "true").lower() == "true"

    if use_ssl:
        with smtplib.SMTP_SSL(smtp_host, smtp_port, context=context) as server:
            server.login(smtp_username, smtp_password)
            server.send_message(message)
        return

    with smtplib.SMTP(smtp_host, smtp_port) as server:
        if use_tls:
            server.starttls(context=context)
        server.login(smtp_username, smtp_password)
        server.send_message(message)


def validate_contact_payload(payload: dict) -> tuple[bool, str]:
    required = ("name", "email", "subject", "message")
    for key in required:
        value = str(payload.get(key, "")).strip()
        if not value:
            return False, f"'{key}' is required."
        payload[key] = value

    if not EMAIL_REGEX.match(payload["email"]):
        return False, "Please provide a valid email address."

    if len(payload["message"]) > 5000:
        return False, "Message is too long."

    return True, ""


@app.route("/api/pnl", methods=["GET", "OPTIONS"])
def get_pnl():
    if request.method == "OPTIONS":
        return ("", 204)

    rows = read_pnl_rows()
    return jsonify({"rows": rows})


@app.route("/api/contact", methods=["POST", "OPTIONS"])
def submit_contact():
    if request.method == "OPTIONS":
        return ("", 204)

    payload = request.get_json(silent=True) or {}
    ok, error = validate_contact_payload(payload)
    if not ok:
        return jsonify({"error": error}), 400

    try:
        append_contact_log(payload)
        send_contact_email(payload)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    return jsonify({"success": True})


@app.get("/")
def home():
    return send_from_directory(BASE_DIR, "index.html")


@app.get("/<path:path>")
def static_files(path: str):
    file_path = BASE_DIR / path
    if file_path.exists() and file_path.is_file():
        return send_from_directory(BASE_DIR, path)
    return jsonify({"error": "Not found."}), 404


if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
