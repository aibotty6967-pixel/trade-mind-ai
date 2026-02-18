# TradeMind - AI Stock Predictor

A Tickeron-inspired AI trading dashboard that predicts stock prices using Linear Regression and Technical Analysis.

## Prerequisites

- Python 3.9+
- Node.js 18+

## Setup

1. **Backend (Python/FastAPI)**
   ```bash
   cd backend
   # Create virtual env (optional but recommended)
   python -m venv venv
   # Windows:
   .\venv\Scripts\activate
   # Mac/Linux:
   source venv/bin/activate
   
   # Install dependencies
   pip install -r requirements.txt
   
   # Run Server
   uvicorn app.main:app --reload
   ```
   Server runs at: `http://localhost:8000`

2. **Frontend (React/Vite)**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   App runs at: `http://localhost:5173`

## Features

- **Real-Time Data:** Fetches live stock data via `yfinance`.
- **AI Prediction:** Uses Linear Regression on the last 6 months of data to predict the next 5 days.
- **Technical Analysis:** Calculates RSI, SMA (20), and EMA (20).
- **UI:** Dark mode dashboard with interactive charts.
