# ESG — Carbon Emissions Tracker

**Live Demo:** [joyful-radiance-production-6eb8.up.railway.app](https://joyful-radiance-production-6eb8.up.railway.app)

---

## What is this project?

Breathe ESG is a web app that helps companies track their carbon emissions and manage their sustainability data. Companies have to report how much carbon (CO₂) they produce every year — this is called ESG reporting. Doing this manually with spreadsheets is messy and error-prone. This app automates that whole process.

You can upload raw data files from different sources (like SAP, utility bills, and travel logs), and the app will automatically calculate how much carbon was produced, flag any suspicious data, and let you approve the final records for compliance.

---

## What can it do?

- **Import data** from three types of corporate files — SAP fuel procurement, utility bills, and corporate travel logs
- **Automatically calculate** carbon emissions (CO₂e) for each activity using standard emission factors
- **Flag anomalies** — if a row has missing data or unusual values, the app marks it as FLAGGED so you can review it
- **Auto-heal** flagged records — the app can estimate and fill in missing values on its own
- **Manually edit** any record and the carbon values are instantly recalculated
- **Bulk approve** multiple records at once once they look correct
- **Full audit trail** — every change made to every record is logged with a timestamp, so you always know what changed and when
- **Dashboard** — see your total carbon footprint broken down by Scope 1, Scope 2, and Scope 3 with a live monthly chart

---

## What are Scope 1, 2, and 3?

These are standard categories that companies use to report emissions:

- **Scope 1** — emissions your company produces directly (e.g., burning fuel in company vehicles or generators)
- **Scope 2** — emissions from the electricity you buy and use (e.g., your office lights and computers)
- **Scope 3** — all other indirect emissions (e.g., business flights, hotel stays, supply chain)

---

## Tech Stack

This project is split into two parts — a backend (the server) and a frontend (the user interface).

### Backend
- **Python** + **Django** — the main framework running the server
- **Django REST Framework** — for building the API endpoints
- **SQLite** — the database (stores all emission records)
- **Gunicorn** — the production web server
- **WhiteNoise** — serves static files in production
- **pandas / numpy** — used for parsing and processing the CSV data files

### Frontend
- **React** (with Vite) — builds the interactive dashboard UI
- **Lucide React** — icons used throughout the interface
- **Vanilla CSS** — all styling is written from scratch, no CSS libraries

### Deployment
- **Railway** — both the backend and frontend are deployed on Railway as separate services

---

## Project Structure

```
Breathe_esg/
├── backend/                  # Django API server
│   ├── esg_backend/          # Main Django app
│   │   ├── models.py         # Database table definitions
│   │   ├── views.py          # API logic
│   │   ├── urls.py           # API routes
│   │   ├── parsers.py        # CSV file parsing logic
│   │   ├── services.py       # Emission calculation logic
│   │   └── settings.py       # Django configuration
│   ├── data/                 # Sample CSV files (SAP, Utility, Travel)
│   ├── requirements.txt      # Python dependencies
│   ├── Procfile              # Start command for Railway
│   └── railpack.json         # Build configuration for Railway
│
└── frontend/                 # React + Vite UI
    ├── src/
    │   ├── App.jsx           # Main app component with all tabs
    │   └── index.css         # All styles
    ├── package.json          # Node dependencies
    └── vite.config.js        # Vite build and proxy config
```

---

## API Endpoints

The backend exposes these REST API routes:

| Method | Endpoint | What it does |
|--------|----------|--------------|
| `GET` | `/` | Health check — returns 200 OK |
| `GET` | `/api/emissions/` | Get all emission records (supports filters and search) |
| `GET` | `/api/emissions/stats/` | Get dashboard stats (totals, scopes, timeline) |
| `POST` | `/api/emissions/ingest/` | Trigger the data ingestion pipeline |
| `POST` | `/api/emissions/bulk-approve/` | Bulk approve multiple records |
| `POST` | `/api/emissions/<id>/review/` | Approve or flag a single record |
| `POST` | `/api/emissions/<id>/edit/` | Manually edit a record |
| `POST` | `/api/emissions/<id>/auto-resolve/` | Auto-heal a flagged anomaly |

---

## How to run it locally

### Requirements
- Python 3.12+
- Node.js 18+

### Backend setup

```bash
# Go into the backend folder
cd backend

# Create a virtual environment
python -m venv venv
venv\Scripts\activate        # On Windows
# source venv/bin/activate   # On Mac/Linux

# Install dependencies
pip install -r requirements.txt

# Run database migrations
python manage.py migrate

# Start the dev server
python manage.py runserver
```

The backend will be running at `http://127.0.0.1:8000`

### Frontend setup

```bash
# Go into the frontend folder
cd frontend

# Install dependencies
npm install

# Start the dev server
npm run dev
```

The frontend will be running at `http://localhost:5173`

### Loading sample data

Once both servers are running, go to the **Ingestion Port** tab in the app and click the **Trigger Pipeline Ingestion** button. This will load the sample CSV files from the `backend/data/` folder into the database.

---

## How the data pipeline works

1. You click **Trigger Ingestion** in the app
2. The backend reads three CSV files — `SAP.csv`, `Utility.csv`, and `travel.csv` — from the `data/` folder
3. Each row is parsed, normalized, and converted into a `CarbonEmissionRecord` in the database
4. The emission factor for each activity type is looked up and the CO₂ value is calculated
5. Rows with missing or suspicious values are automatically marked as **FLAGGED**
6. You can then go to the **Review Centre** to approve, fix, or auto-heal the flagged records

---

## Deployment (Railway)

Both services are deployed on [Railway](https://railway.app):

- **Backend** is deployed from the `/backend` folder with root directory set to `/backend`
- **Frontend** is deployed from the `/frontend` folder with root directory set to `/frontend`
- The frontend uses `VITE_API_URL` environment variable to point to the backend URL

The `railpack.json` file in the backend folder tells Railway to run `python manage.py collectstatic --noinput` during the build step so that static files are ready before the server starts.

---

## Known Limitations

- The database is SQLite, which resets on every Railway redeploy (since the file is not persisted). For production use, switching to PostgreSQL is recommended.
- The sample data files are hardcoded — a future version could support user file uploads directly from the browser.
- Authentication is not implemented yet — all API endpoints are currently public.

---

## Author

Built by **Anshu Singh** as a full-stack ESG data platform prototype.
