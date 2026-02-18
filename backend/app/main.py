from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import yfinance as yf
import pandas as pd
import numpy as np
from ta.trend import SMAIndicator, EMAIndicator, MACD
from ta.momentum import RSIIndicator
from ta.volatility import BollingerBands
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import PolynomialFeatures
from sklearn.pipeline import make_pipeline
import concurrent.futures
import threading
import time
from datetime import datetime, timedelta
import pytz

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SCREENER_TICKERS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "META", "NFLX", "AMD", "INTC",
    "IBM", "ORCL", "CSCO", "QCOM", "TXN", "ADBE", "CRM", "AVGO", "PYPL", "SQ",
    "SHOP", "SPOT", "UBER", "ABNB", "PLTR", "COIN", "HOOD", "ROKU", "ZM", "DOCU"
]

# --- PORTFOLIO STATE ---
portfolio = {
    "balance": 15000.0,
    "positions": [],
    "history": []
}

active_traders = {} # { "TSLA": True }
trader_logs = {}    # { "TSLA": "Scanning... RSI: 45" }
trader_pnl = {}     # { "TSLA": 150.00 }

def get_next_market_open():
    # Simple logic: Market opens Mon-Fri 9:30 AM EST
    # Convert current time to EST
    est = pytz.timezone('US/Eastern')
    now = datetime.now(est)
    
    # Start with today 9:30 AM
    market_open = now.replace(hour=9, minute=30, second=0, microsecond=0)
    
    # If it's already past 4:00 PM EST, or it's a weekend, move to next day
    if now.hour >= 16 or (now.hour == 15 and now.minute >= 59): # Past Close
        market_open += timedelta(days=1)
    
    # Handle Weekends
    while market_open.weekday() > 4: # 5=Sat, 6=Sun
        market_open += timedelta(days=1)
        
    return market_open.strftime("%b %d, %I:%30 %p EST")

def is_market_open():
    est = pytz.timezone('US/Eastern')
    now = datetime.now(est)
    
    # Check Weekend
    if now.weekday() > 4: return False
    
    # Check Hours (9:30 AM - 4:00 PM EST)
    start = now.replace(hour=9, minute=30, second=0, microsecond=0)
    end = now.replace(hour=16, minute=0, second=0, microsecond=0)
    
    return start <= now <= end

def get_val(series):
    if series is None or series.empty: return 0
    val = series.iloc[-1]
    return val if not pd.isna(val) else 0

def calculate_option_price(stock_price, strike, expiry_days, volatility, type="CALL"):
    intrinsic = max(0, stock_price - strike) if type == "CALL" else max(0, strike - stock_price)
    time_val = (stock_price * volatility * np.sqrt(expiry_days / 365)) * 0.4 
    noise = np.random.uniform(-0.05, 0.05)
    return round(intrinsic + time_val + noise, 2)

def auto_trader_loop(symbol):
    print(f"🤖 Auto-Trader Started for {symbol}")
    trader_logs[symbol] = "Initializing..."
    if symbol not in trader_pnl: trader_pnl[symbol] = 0.0
    
    while active_traders.get(symbol):
        # 1. Check Market Hours
        if not is_market_open():
            next_open = get_next_market_open()
            trader_logs[symbol] = f"😴 Market Closed. Sleeping until {next_open}..."
            time.sleep(60) # Sleep for a minute and check again
            continue

        try:
            ticker = yf.Ticker(symbol)
            hist = ticker.history(period="1d", interval="5m")
            
            if not hist.empty:
                current_price = hist['Close'].iloc[-1]
                rsi = RSIIndicator(hist['Close'], window=14).rsi().iloc[-1]
                macd = MACD(hist['Close'])
                macd_diff = macd.macd_diff().iloc[-1]
                
                status_msg = f"Price: ${round(current_price, 2)} | RSI: {round(rsi, 1)} | MACD: {round(macd_diff, 2)}"
                
                existing_pos = next((p for p in portfolio['positions'] if p['symbol'] == symbol), None)
                
                if not existing_pos:
                    if rsi < 30 and macd_diff > 0: 
                        contract_type = "CALL"
                        status_msg = "🚀 BUY SIGNAL: Oversold + Momentum!"
                    elif rsi > 70 and macd_diff < 0: 
                        contract_type = "PUT"
                        status_msg = "🔻 SELL SIGNAL: Overbought + Momentum!"
                    else:
                        contract_type = None
                        status_msg += " (Waiting for setup...)"

                    trader_logs[symbol] = status_msg
                    
                    if contract_type:
                        strike = round(current_price * 1.02, 0) if contract_type == "CALL" else round(current_price * 0.98, 0)
                        entry_price = calculate_option_price(current_price, strike, 7, 0.4, contract_type)
                        quantity = 10
                        cost = entry_price * quantity * 100
                        
                        if portfolio['balance'] >= cost:
                            portfolio['balance'] -= cost
                            portfolio['positions'].append({
                                "symbol": symbol,
                                "type": contract_type,
                                "strike": strike,
                                "entry_price": entry_price,
                                "quantity": quantity,
                                "cost": cost,
                                "entry_time": str(pd.Timestamp.now()),
                                "status": "OPEN"
                            })
                            trader_logs[symbol] = f"EXECUTED: Bought {quantity} {contract_type}s @ ${entry_price}"
                
                else:
                    current_opt_price = calculate_option_price(current_price, existing_pos['strike'], 7, 0.4, existing_pos['type'])
                    pnl_percent = ((current_opt_price - existing_pos['entry_price']) / existing_pos['entry_price']) * 100
                    
                    status_msg += f" | Position P/L: {round(pnl_percent, 1)}%"
                    trader_logs[symbol] = status_msg
                    
                    should_close = False
                    reason = ""
                    
                    if pnl_percent >= 20: 
                        should_close = True
                        reason = "TAKE PROFIT"
                    elif pnl_percent <= -10:
                        should_close = True
                        reason = "STOP LOSS"
                    elif existing_pos['type'] == "CALL" and (rsi > 70 or macd_diff < 0):
                        should_close = True
                        reason = "REVERSAL"
                    elif existing_pos['type'] == "PUT" and (rsi < 30 or macd_diff > 0):
                         should_close = True
                         reason = "REVERSAL"

                    if should_close:
                        revenue = current_opt_price * existing_pos['quantity'] * 100
                        profit = revenue - existing_pos['cost']
                        
                        trader_pnl[symbol] += profit
                        portfolio['balance'] += revenue
                        portfolio['history'].append({
                            **existing_pos,
                            "exit_price": current_opt_price,
                            "exit_time": str(pd.Timestamp.now()),
                            "profit": round(profit, 2),
                            "reason": reason,
                            "status": "CLOSED"
                        })
                        portfolio['positions'].remove(existing_pos)
                        trader_logs[symbol] = f"CLOSED Trade: ${round(profit, 2)} Profit ({reason})"

        except Exception as e:
            trader_logs[symbol] = f"Error: {str(e)}"
        
        time.sleep(10) 

def analyze_stock(
    symbol: str,
    min_price: float = None,
    max_price: float = None,
    min_market_cap: float = None,
    max_market_cap: float = None,
    min_volume: float = None,
    max_volume: float = None,
    min_rsi: float = None,
    max_rsi: float = None,
    macd_signal: str = None, # "bullish", "bearish", "any"
    sector: str = None
):
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info # Fetch info once
        
        # Apply filters as early as possible
        current_price = info.get('currentPrice')
        if current_price is None: return None
        if min_price is not None and current_price < min_price: return None
        if max_price is not None and current_price > max_price: return None
        
        market_cap = info.get('marketCap')
        if market_cap is None: return None # Must have market cap for filtering
        if min_market_cap is not None and market_cap < min_market_cap: return None
        if max_market_cap is not None and market_cap > max_market_cap: return None

        current_volume = info.get('volume')
        if current_volume is None: return None # Must have volume for filtering
        if min_volume is not None and current_volume < min_volume: return None
        if max_volume is not None and current_volume > max_volume: return None

        stock_sector = info.get('sector')
        if sector is not None and stock_sector != sector: return None

        hist = ticker.history(period="6mo")
        if hist.empty or len(hist) < 50: return None
        
        close = hist['Close']
        rsi = RSIIndicator(close, window=14).rsi().iloc[-1]
        macd = MACD(close)
        macd_diff = macd.macd_diff().iloc[-1]
        bb = BollingerBands(close)
        bb_percent = bb.bollinger_pband().iloc[-1]

        # Apply RSI filter
        if min_rsi is not None and rsi < min_rsi: return None
        if max_rsi is not None and rsi > max_rsi: return None

        # Apply MACD signal filter
        if macd_signal == "bullish" and macd_diff <= 0: return None
        if macd_signal == "bearish" and macd_diff >= 0: return None
        
        signal, score = "Neutral", 0
        if rsi < 30: score += 2
        if rsi > 50 and rsi < 70: score += 1
        if macd_diff > 0: score += 2
        if bb_percent < 0.05: score += 3
        if rsi > 70: score -= 2
        if rsi < 50 and rsi > 30: score -= 1
        if macd_diff < 0: score -= 2
        if bb_percent > 0.95: score -= 3
        if score >= 3: signal = "Strong Buy"
        elif score >= 1: signal = "Buy"
        elif score <= -3: signal = "Strong Sell"
        elif score <= -1: signal = "Sell"
        
        return {
            "symbol": symbol,
            "price": round(current_price, 2),
            "signal": signal,
            "score": score,
            "rsi": round(rsi, 2),
            "macd": round(macd_diff, 2),
            "market_cap": market_cap,
            "volume": current_volume,
            "sector": stock_sector
        }
    except Exception as e:
        # print(f"Error analyzing {symbol}: {e}") # For debugging
        return None

@app.get("/")
def read_root(): return {"message": "Tickeron Clone API Active"}

@app.post("/api/trader/start/{symbol}")
def start_trader(symbol: str):
    if active_traders.get(symbol): return {"message": "Already running"}
    active_traders[symbol] = True
    t = threading.Thread(target=auto_trader_loop, args=(symbol,))
    t.daemon = True
    t.start()
    return {"message": "Started"}

@app.post("/api/trader/stop/{symbol}")
def stop_trader(symbol: str):
    active_traders[symbol] = False
    return {"message": "Stopped"}

@app.post("/api/portfolio/reset")
def reset_portfolio(amount: float):
    portfolio['balance'] = amount
    portfolio['positions'] = []
    portfolio['history'] = []
    active_traders.clear()
    trader_pnl.clear()
    return {"message": f"Portfolio reset to ${amount}"}

@app.get("/api/portfolio")
def get_portfolio():
    total_equity = portfolio['balance']
    updated_positions = []
    for pos in portfolio['positions']:
        try:
            ticker = yf.Ticker(pos['symbol'])
            current_stock_price = ticker.history(period="1d")['Close'].iloc[-1]
            current_opt_price = calculate_option_price(current_stock_price, pos['strike'], 7, 0.4, pos['type'])
            market_value = current_opt_price * pos['quantity'] * 100
            unrealized_pl = market_value - pos['cost']
            updated_positions.append({
                **pos,
                "current_stock_price": round(current_stock_price, 2),
                "current_opt_price": current_opt_price,
                "market_value": round(market_value, 2),
                "unrealized_pl": round(unrealized_pl, 2),
                "return_pct": round((unrealized_pl / pos['cost']) * 100, 2)
            })
            total_equity += market_value
        except: updated_positions.append(pos)

    return {
        "balance": round(portfolio['balance'], 2),
        "equity": round(total_equity, 2),
        "positions": updated_positions,
        "history": portfolio['history'][-20:],
        "active_traders": [s for s, active in active_traders.items() if active],
        "trader_logs": trader_logs,
        "trader_pnl": trader_pnl
    }

# --- SCREENER ENDPOINT (MODIFIED) ---
@app.get("/api/screener")
def run_screener(
    min_price: float = None,
    max_price: float = None,
    min_market_cap: float = None,
    max_market_cap: float = None,
    min_volume: float = None,
    max_volume: float = None,
    min_rsi: float = None,
    max_rsi: float = None,
    macd_signal: str = None,
    sector: str = None
):
    results = []
    # Use a partial function to pass screener parameters to analyze_stock
    from functools import partial
    analyze_stock_with_filters = partial(
        analyze_stock,
        min_price=min_price,
        max_price=max_price,
        min_market_cap=min_market_cap,
        max_market_cap=max_market_cap,
        min_volume=min_volume,
        max_volume=max_volume,
        min_rsi=min_rsi,
        max_rsi=max_rsi,
        macd_signal=macd_signal,
        sector=sector
    )

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        future_to_stock = {executor.submit(analyze_stock_with_filters, sym): sym for sym in SCREENER_TICKERS}
        for future in concurrent.futures.as_completed(future_to_stock):
            res = future.result()
            if res: results.append(res)
    results.sort(key=lambda x: x['score'], reverse=True)
    return results

@app.get("/api/stock/{symbol}")
def get_stock_data(symbol: str):
    try:
        data = yf.Ticker(symbol)
        hist = data.history(period="1y")
        if hist.empty: raise HTTPException(status_code=404, detail="Stock not found")
        close = hist['Close']
        sma_20 = SMAIndicator(close, window=20).sma_indicator()
        ema_20 = EMAIndicator(close, window=20).ema_indicator()
        sma_50 = SMAIndicator(close, window=50).sma_indicator()
        rsi = RSIIndicator(close, window=14).rsi()
        macd = MACD(close)
        bb = BollingerBands(close)
        
        rsi_val = get_val(rsi)
        macd_val = get_val(macd.macd_diff())
        bb_val = get_val(bb.bollinger_pband())
        
        sentiment = "Neutral"
        if rsi_val > 50 and macd_val > 0:
            sentiment = "Bullish"
            if bb_val > 0.95: sentiment = "Very Bullish (Breakout)"
            elif bb_val < 0.05: sentiment = "Oversold Bounce (Buy)"
        elif rsi_val < 50 and macd_val < 0:
            sentiment = "Bearish"
            if bb_val < 0.05: sentiment = "Very Bearish (Breakdown)"
            elif bb_val > 0.95: sentiment = "Overbought Rejection (Sell)"

        return {
            "symbol": symbol.upper(),
            "name": data.info.get('longName', symbol.upper()),
            "current_price": round(close.iloc[-1], 2),
            "change_percent": 0.0,
            "market_cap": data.info.get('marketCap', 'N/A'),
            "volume": data.info.get('volume', 'N/A'),
            "pe_ratio": data.info.get('trailingPE', 'N/A'),
            "sector": data.info.get('sector', 'Unknown'),
            "outlook": {"sentiment": sentiment, "confidence": 85, "summary": f"RSI: {round(rsi_val, 1)} | MACD: {round(macd_val, 2)} | BB%: {round(bb_val*100, 1)}%"},
            "indicators": {
                "rsi": round(rsi_val, 2),
                "sma_20": round(get_val(sma_20), 2),
                "ema_20": round(get_val(ema_20), 2),
                "sma_50": round(get_val(sma_50), 2),
                "macd": round(get_val(macd.macd()), 2),
                "macd_signal": round(get_val(macd.macd_signal()), 2),
                "macd_diff": round(get_val(macd.macd_diff()), 2),
                "bb_upper": round(get_val(bb.bollinger_hband()), 2),
                "bb_lower": round(get_val(bb.bollinger_lband()), 2),
                "bb_percent": round(get_val(bb.bollinger_pband()), 2),
            },
            "history": hist[['Open', 'High', 'Low', 'Close', 'Volume']].tail(60).reset_index().to_dict(orient="records")
        }
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/predict/{symbol}")
def predict_stock(symbol: str):
    try:
        data = yf.Ticker(symbol)
        hist = data.history(period="1y") 
        if hist.empty: raise HTTPException(status_code=404, detail="Stock not found")
        df = hist.reset_index()
        df['Date'] = pd.to_datetime(df['Date'])
        df['DateIdx'] = range(len(df))
        X = df[['DateIdx']].values
        y = df['Close'].values
        degree = 2
        model = make_pipeline(PolynomialFeatures(degree), LinearRegression())
        model.fit(X, y)
        last_idx = df['DateIdx'].iloc[-1]
        future_indices = np.array([last_idx + i for i in range(1, 8)]).reshape(-1, 1)
        predictions = model.predict(future_indices)
        last_date = df['Date'].iloc[-1]
        future_dates = [last_date + pd.Timedelta(days=i) for i in range(1, 8)]
        result = []
        last_close = df['Close'].iloc[-1]
        for d, p in zip(future_dates, predictions):
            result.append({"date": d.strftime("%Y-%m-%d"), "predicted_price": round(p, 2), "action": "BUY" if p > last_close else "SELL"})
        return {"symbol": symbol.upper(), "prediction_days": 7, "predictions": result, "trend": "Upward" if predictions[-1] > predictions[0] else "Downward"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/backtest/{symbol}")
def backtest_strategy(symbol: str):
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period="1y")
        if len(hist) < 100: raise HTTPException(status_code=400, detail="Not enough data")
        initial_balance = 10000
        balance = initial_balance
        shares = 0
        trades = []
        wins = 0
        losses = 0
        lookback_window = 90
        data_slice = hist.iloc[-(lookback_window+50):]
        for i in range(50, len(data_slice)):
            current_day = data_slice.iloc[i]
            past_data = data_slice.iloc[:i+1]['Close']
            rsi = RSIIndicator(past_data, window=14).rsi().iloc[-1]
            macd = MACD(past_data)
            macd_diff = macd.macd_diff().iloc[-1]
            price = current_day['Close']
            date = current_day.name.strftime("%Y-%m-%d")
            signal = "HOLD"
            if rsi < 35 and macd_diff > -0.5: signal = "BUY"
            elif rsi > 65 or macd_diff < -0.5: signal = "SELL"
            if signal == "BUY" and balance > 0:
                shares_to_buy = balance // price
                if shares_to_buy > 0:
                    cost = shares_to_buy * price
                    balance -= cost
                    shares += shares_to_buy
                    trades.append({"date": date, "type": "BUY", "price": round(price, 2), "shares": shares_to_buy})
            elif signal == "SELL" and shares > 0:
                revenue = shares * price
                profit = revenue - (trades[-1]['price'] * shares)
                if profit > 0: wins += 1
                else: losses += 1
                balance += revenue
                shares = 0
                trades.append({"date": date, "type": "SELL", "price": round(price, 2), "profit": round(profit, 2)})
        final_value = balance + (shares * hist['Close'].iloc[-1])
        total_return = ((final_value - initial_balance) / initial_balance) * 100
        total_trades = wins + losses
        win_rate = (wins / total_trades * 100) if total_trades > 0 else 0
        return {"symbol": symbol.upper(), "days_tested": lookback_window, "initial_balance": initial_balance, "final_balance": round(final_value, 2), "return_percent": round(total_return, 2), "total_trades": total_trades, "win_rate": round(win_rate, 1), "trades": trades[-10:]}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))
