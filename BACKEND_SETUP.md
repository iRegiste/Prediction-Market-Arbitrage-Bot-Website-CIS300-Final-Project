# Backend Setup

## 1) Install dependencies

```powershell
python -m pip install -r requirements.txt
```

## 2) Configure email sending

Copy `.env.example` to `.env` and set:

- `SMTP_USERNAME`: your Gmail address
- `SMTP_PASSWORD`: Gmail app password (not your normal login password)
- `SMTP_FROM_EMAIL`: usually the same as `SMTP_USERNAME`
- `CONTACT_TO_EMAIL`: defaults to `ianregister1@gmail.com`
- `CORS_ALLOWED_ORIGINS`: `*` (simple) or a comma-separated list of allowed origins (example: `https://yourname.github.io`)

## 3) Run server

```powershell
python app.py
```

Open:

- `http://127.0.0.1:5000/`

## 4) If frontend is on GitHub Pages and backend is on Render

Set the backend URL in these files:

- `contact.html` meta tag: `<meta name="api-base" content="https://YOUR-RENDER-URL.onrender.com">`
- `live-pnl-honors.html` meta tag: `<meta name="api-base" content="https://YOUR-RENDER-URL.onrender.com">`

Without that, GitHub Pages will post to `/api/...` on the static site and return HTML/404 instead of JSON.

## Notes

- PnL data is read from `data/pnl.csv`.
- Contact submissions are logged to `data/contact_messages.csv`.
- The contact API sends email through SMTP and returns an error if SMTP credentials are missing/invalid.
- To refresh website PnL from Excel: export/copy sanitized rows into `data/pnl.csv` with columns `date,polymarket,kalshi,daily_pl,total_equity`.
