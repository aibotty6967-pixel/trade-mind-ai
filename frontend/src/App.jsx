import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area, ComposedChart, Bar, BarChart } from 'recharts'
import { Activity, TrendingUp, TrendingDown, BrainCircuit, Search, BarChart2, ShieldCheck, Zap, Menu, X, Info, History, Briefcase, Play, Square, Settings, User } from 'lucide-react'
import './App.css'

// Stock Puns & Bot Personalities
const BOT_JOKES = [
  "I'm bullish... no bull! 🐂",
  "Why did the trader go broke? He lost his margin of safety. 📉",
  "Buying the dip... or catching a falling knife? 🔪",
  "To the moon! 🚀 (Or at least the ceiling)",
  "My algorithm is 99% math, 1% hope. 🤞",
  "HODL until my circuits fry! 🤖",
  "Stonks only go up... right? 📈",
  "I eat volatility for breakfast. 🥣",
  "Analyzing charts so you don't have to pretend you understand them. 🧐",
  "Bear market? I thought you said beer market! 🍺",
  "Cash is trash, but I'm made of code. 💻"
]

function App() {
  const [symbol, setSymbol] = useState('TSLA')
  const [data, setData] = useState(null)
  const [prediction, setPrediction] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [screenerResults, setScreenerResults] = useState([])
  const [screenerLoading, setScreenerLoading] = useState(false)
  const [modalData, setModalData] = useState(null)
  const [chartData, setChartData] = useState([])
  const [backtestResults, setBacktestResults] = useState(null)
  const [backtestLoading, setBacktestLoading] = useState(false)
  
  // NEW: Portfolio State
  const [portfolio, setPortfolio] = useState(null)
  const [portfolioLoading, setPortfolioLoading] = useState(false)
  const [newTraderSymbol, setNewTraderSymbol] = useState('')
  const [editBalanceMode, setEditBalanceMode] = useState(false)
  const [newBalance, setNewBalance] = useState('')

  // NEW: Screener Filter States
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [minMarketCap, setMinMarketCap] = useState('')
  const [maxMarketCap, setMaxMarketCap] = useState('')
  const [minVolume, setMinVolume] = useState('')
  const [maxVolume, setMaxVolume] = useState('')
  const [minRsi, setMinRsi] = useState('')
  const [maxRsi, setMaxRsi] = useState('')
  const [macdSignal, setMacdSignal] = useState('')
  const [sector, setSector] = useState('')
  
  // NEW: Bot Detail Modal State
  const [selectedBot, setSelectedBot] = useState(null) 
  const [botJoke, setBotJoke] = useState('')

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    setBacktestResults(null)
    try {
      const stockRes = await fetch(`http://localhost:8000/api/stock/${symbol}`)
      if (!stockRes.ok) throw new Error('Stock not found')
      const stockData = await stockRes.json()
      
      const predictRes = await fetch(`http://localhost:8000/api/predict/${symbol}`)
      const predictData = await predictRes.json()
      
      setData(stockData)
      setPrediction(predictData)
      
      const history = stockData.history.map(d => ({
        date: new Date(d.Date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        actual: d.Close,
        predicted: null
      }))
      const combined = [
        ...history,
        ...predictData.predictions.map(p => ({
          date: new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          actual: null,
          predicted: p.predicted_price
        }))
      ]
      combined[history.length - 1].predicted = combined[history.length - 1].actual
      setChartData(combined)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const runScreener = async () => {
    setScreenerLoading(true)
    try {
      const params = new URLSearchParams();
      if (minPrice) params.append('min_price', minPrice);
      if (maxPrice) params.append('max_price', maxPrice);
      if (minMarketCap) params.append('min_market_cap', minMarketCap * 1_000_000_000); // Convert to billions
      if (maxMarketCap) params.append('max_market_cap', maxMarketCap * 1_000_000_000); // Convert to billions
      if (minVolume) params.append('min_volume', minVolume);
      if (maxVolume) params.append('max_volume', maxVolume);
      if (minRsi) params.append('min_rsi', minRsi);
      if (maxRsi) params.append('max_rsi', maxRsi);
      if (macdSignal) params.append('macd_signal', macdSignal);
      if (sector) params.append('sector', sector);

      const queryString = params.toString();
      const url = `http://localhost:8000/api/screener${queryString ? `?${queryString}` : ''}`;
      
      const res = await fetch(url)
      const data = await res.json()
      setScreenerResults(data)
    } catch (err) { console.error(err) } finally { setScreenerLoading(false) }
  }
  
  const runBacktest = async () => {
    setBacktestLoading(true)
    try {
      const res = await fetch(`http://localhost:8000/api/backtest/${symbol}`)
      const data = await res.json()
      setBacktestResults(data)
    } catch (err) { console.error(err) } finally { setBacktestLoading(false) }
  }
  
  const fetchPortfolio = async () => {
    setPortfolioLoading(true)
    try {
      const res = await fetch('http://localhost:8000/api/portfolio')
      const data = await res.json()
      setPortfolio(data)
    } catch (err) { console.error(err) } finally { setPortfolioLoading(false) }
  }
  
  const resetPortfolio = async () => {
    if (!newBalance) return
    await fetch(`http://localhost:8000/api/portfolio/reset?amount=${newBalance}`, { method: 'POST' })
    setEditBalanceMode(false)
    fetchPortfolio()
  }

  const toggleTrader = async (s) => {
    if (!portfolio) return
    const isRunning = portfolio.active_traders.includes(s)
    const endpoint = isRunning ? 'stop' : 'start'
    await fetch(`http://localhost:8000/api/trader/${endpoint}/${s}`, { method: 'POST' })
    fetchPortfolio() 
  }

  const openBotDetail = (botSymbol) => {
    setSelectedBot(botSymbol)
    // Pick a random joke when opening
    setBotJoke(BOT_JOKES[Math.floor(Math.random() * BOT_JOKES.length)])
  }

  useEffect(() => {
    if (activeTab === 'screener') runScreener()
    else if (activeTab === 'portfolio') {
        fetchPortfolio()
        const interval = setInterval(fetchPortfolio, 5000) 
        return () => clearInterval(interval)
    }
    else if (!data) fetchData()
  }, [activeTab])

  // ... (Indicator Details Dictionary kept same as before) ...
  const indicatorDetails = {
    RSI: {
      title: "Relative Strength Index (RSI)",
      definition: "A momentum oscillator that measures the speed and change of price movements on a scale of 0 to 100.",
      importance: "It helps identify overbought or oversold conditions. Traditionally, > 70 is overbought (risk of sell-off) and < 30 is oversold (potential buy opportunity).",
      calculation: "Based on average gains vs average losses over the last 14 periods.",
      interpretation: (val) => val > 70 ? `Current value is ${val}. This is HIGH. The stock may be due for a pullback (correction).` : val < 30 ? `Current value is ${val}. This is LOW. The stock may be undervalued and due for a bounce.` : `Current value is ${val}. This is Neutral. The stock is not in an extreme state.`
    },
    MACD: {
      title: "Moving Average Convergence Divergence (MACD)",
      definition: "A trend-following momentum indicator that shows the relationship between two moving averages of a security’s price.",
      importance: "The MACD 'Histogram' is the key. When it crosses above zero, it's a Bullish signal. When it crosses below, it's Bearish.",
      calculation: "Subtracts the 26-period EMA from the 12-period EMA.",
      interpretation: (val) => val > 0 ? `The histogram is POSITIVE (${val}). Momentum is currently Bullish (Upward).` : `The histogram is NEGATIVE (${val}). Momentum is currently Bearish (Downward).`
    },
    BB: {
      title: "Bollinger Bands %",
      definition: "A volatility indicator consisting of a middle SMA and two standard deviation lines (Upper and Lower bands).",
      importance: "Prices tend to stay within the bands. Touching the lower band often signals a bounce (Buy), while breaking the upper band can mean a strong breakout or a reversal.",
      calculation: "Percent B tells us where the price is relative to the bands (0 = Lower Band, 1 = Upper Band).",
      interpretation: (val) => val > 1.0 ? `Value is ${(val*100).toFixed(0)}%. Price has broken ABOVE the upper band. This is an extreme breakout!` : val < 0.0 ? `Value is ${(val*100).toFixed(0)}%. Price has broken BELOW the lower band. This is an extreme oversold condition.` : `Value is ${(val*100).toFixed(0)}%. Price is trading normally within the expected range.`
    },
    SMA: {
      title: "Simple Moving Average (20)",
      definition: "The average price of the stock over the last 20 days.",
      importance: "It acts as a dynamic support/resistance line. If price is above it, the short-term trend is UP. If below, the trend is DOWN.",
      calculation: "Sum of last 20 closing prices / 20.",
      interpretation: (val, currentPrice) => currentPrice > val ? `Price ($${currentPrice}) is ABOVE the average ($${val}). The short-term trend is healthy and UP.` : `Price ($${currentPrice}) is BELOW the average ($${val}). The short-term trend is weak and DOWN.`
    }
  }

  const openModal = (type, val, extraVal) => {
    const info = indicatorDetails[type]
    setModalData({ ...info, currentAnalysis: info.interpretation(val, extraVal) })
  }

  // --- RENDER CONTENT FUNCTION (Fixed & Properly Closed) ---
  const renderContent = () => {
    // 1. SCREENER
    if (activeTab === 'screener') {
       return (
         <div className="grid-container screener-view">
           <div className="card full-width">
             <div className="card-header">
               <h3>Market Screener (Real-Time Signals)</h3>
               <button onClick={runScreener} className="refresh-btn"><Zap size={16}/> Refresh</button>
             </div>
             <div className="screener-filters">
               <h4>Filter Options</h4>
               <div className="filter-group">
                 <label>Price ($)</label>
                 <input type="number" placeholder="Min" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} />
                 <input type="number" placeholder="Max" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
               </div>
               <div className="filter-group">
                 <label>Market Cap (Billions $)</label>
                 <input type="number" placeholder="Min" value={minMarketCap} onChange={(e) => setMinMarketCap(e.target.value)} />
                 <input type="number" placeholder="Max" value={maxMarketCap} onChange={(e) => setMaxMarketCap(e.target.value)} />
               </div>
               <div className="filter-group">
                 <label>Volume</label>
                 <input type="number" placeholder="Min" value={minVolume} onChange={(e) => setMinVolume(e.target.value)} />
                 <input type="number" placeholder="Max" value={maxVolume} onChange={(e) => setMaxVolume(e.target.value)} />
               </div>
               <div className="filter-group">
                 <label>RSI</label>
                 <input type="number" placeholder="Min" value={minRsi} onChange={(e) => setMinRsi(e.target.value)} />
                 <input type="number" placeholder="Max" value={maxRsi} onChange={(e) => setMaxRsi(e.target.value)} />
               </div>
               <div className="filter-group">
                 <label>MACD Signal</label>
                 <select value={macdSignal} onChange={(e) => setMacdSignal(e.target.value)}>
                   <option value="">Any</option>
                   <option value="bullish">Bullish</option>
                   <option value="bearish">Bearish</option>
                 </select>
               </div>
               <div className="filter-group">
                 <label>Sector</label>
                 <select value={sector} onChange={(e) => setSector(e.target.value)}>
                   <option value="">Any</option>
                   <option value="Technology">Technology</option>
                   <option value="Healthcare">Healthcare</option>
                   <option value="Financial Services">Financial Services</option>
                   <option value="Consumer Cyclical">Consumer Cyclical</option>
                   <option value="Consumer Defensive">Consumer Defensive</option>
                   <option value="Communication Services">Communication Services</option>
                   <option value="Industrials">Industrials</option>
                   <option value="Energy">Energy</option>
                   <option value="Utilities">Utilities</option>
                   <option value="Real Estate">Real Estate</option>
                   <option value="Basic Materials">Basic Materials</option>
                 </select>
               </div>
               <button onClick={runScreener} className="apply-filters-btn">Apply Filters</button>
             </div>
             {screenerLoading ? (
               <div className="loading"><Zap className="spin" /> Scanning Market...</div>
             ) : (
               <div className="tech-table">
                 <div className="tech-row header">
                   <span>Ticker</span>
                   <span>Price</span>
                   <span>Signal</span>
                   <span>Score</span>
                 </div>
                 {screenerResults.map((s) => (
                   <div key={s.symbol} className="tech-row" onClick={() => { setSymbol(s.symbol); setActiveTab('overview'); fetchData(); }} style={{cursor: 'pointer'}}>
                     <span style={{fontWeight: 'bold', color: '#fff'}}>{s.symbol}</span>
                     <span>${s.price}</span>
                     <span className={s.signal.includes('Buy') ? 'bullish' : s.signal.includes('Sell') ? 'bearish' : 'neutral'}>
                       {s.signal}
                     </span>
                     <span style={{fontWeight: 'bold'}}>{s.score}</span>
                   </div>
                 ))}
               </div>
             )}
           </div>
         </div>
       )
    }
    
    // 2. PORTFOLIO
    if (activeTab === 'portfolio') {
      if (!portfolio) return <div className="loading"><Zap className="spin"/> Loading Portfolio...</div>
      
      return (
        <div className="grid-container portfolio-view">
           <div className="card full-width">
              <div className="card-header">
                <h3>Live Paper Trading (Options Simulator)</h3>
                
                <div style={{display:'flex', gap: 10, alignItems: 'center'}}>
                    <input 
                      type="text" 
                      placeholder="Enter Ticker (e.g. NVDA)" 
                      value={newTraderSymbol}
                      onChange={(e) => setNewTraderSymbol(e.target.value.toUpperCase())}
                      style={{
                        padding: '8px 12px', 
                        borderRadius: '6px', 
                        border: '1px solid #444', 
                        background: '#252525', 
                        color: 'white'
                      }}
                    />
                    <button 
                        onClick={() => { if(newTraderSymbol) toggleTrader(newTraderSymbol); setNewTraderSymbol('') }} 
                        className="start-btn"
                        style={{
                          background: '#00ff88', 
                          color: '#000', 
                          border: 'none', 
                          padding: '8px 16px', 
                          borderRadius: '6px', 
                          fontWeight: 'bold', 
                          cursor: 'pointer'
                        }}
                    >
                        <Play size={14} style={{marginRight: 8}}/> Add Auto-Trader
                    </button>
                </div>
              </div>
              
              <div className="score-grid">
                  <div className="score-item">
                    <span className="label">
                      Cash Balance
                      {!editBalanceMode && <button onClick={() => setEditBalanceMode(true)} style={{marginLeft: 10, background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 10}}>EDIT</button>}
                    </span>
                    {editBalanceMode ? (
                      <div style={{display:'flex', gap: 5}}>
                        <input type="number" placeholder="15000" value={newBalance} onChange={(e) => setNewBalance(e.target.value)} style={{width: 80, background: '#333', border: 'none', color: 'white', padding: 4}}/>
                        <button onClick={resetPortfolio} style={{background: '#00ff88', border: 'none', padding: '2px 8px', cursor: 'pointer', fontWeight: 'bold'}}>SET</button>
                        <button onClick={() => setEditBalanceMode(false)} style={{background: 'none', border: 'none', color: '#888', cursor: 'pointer'}}>X</button>
                      </div>
                    ) : (
                      <span className="value">${portfolio.balance.toLocaleString()}</span>
                    )}
                  </div>
                  <div className="score-item">
                    <span className="label">Total Equity</span>
                    <span className="value">${portfolio.equity.toLocaleString()}</span>
                  </div>
                  <div className="score-item">
                    <span className="label">Active Bots</span>
                    <span className="value">{portfolio.active_traders.length}</span>
                  </div>
              </div>
              
              <h4 style={{marginTop: 30, marginBottom: 10, color: '#888'}}>Running Auto-Traders</h4>
              {portfolio.active_traders.length === 0 ? (
                  <div className="empty-state">No AI Traders running. Add a ticker above to start one.</div>
              ) : (
                  <div className="tech-table">
                     {portfolio.active_traders.map((traderSym) => {
                         const pnl = portfolio.trader_pnl && portfolio.trader_pnl[traderSym] ? portfolio.trader_pnl[traderSym] : 0
                         return (
                         <div key={traderSym} className="tech-row clickable" onClick={() => openBotDetail(traderSym)} style={{display: 'flex', flexDirection: 'column', gap: 5}}>
                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                 <span style={{fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 10}}>
                                   <Zap size={16} color="#00ff88" className="spin"/> {traderSym} Bot Active
                                 </span>
                                 <span className={pnl >= 0 ? 'bullish' : 'bearish'} style={{fontWeight: 'bold', fontSize: '0.9rem'}}>
                                    {pnl > 0 ? '+' : ''}${pnl.toFixed(2)} P/L
                                 </span>
                                 <button 
                                    onClick={(e) => { e.stopPropagation(); toggleTrader(traderSym); }}
                                    style={{
                                      background: 'transparent', 
                                      border: '1px solid #ff4d4d', 
                                      color: '#ff4d4d', 
                                      padding: '4px 12px', 
                                      borderRadius: '4px', 
                                      cursor: 'pointer'
                                    }}
                                 >
                                   <Square size={12} style={{marginRight: 6}}/> Stop Bot
                                 </button>
                            </div>
                             {portfolio.trader_logs && portfolio.trader_logs[traderSym] && (
                               <div style={{fontSize: '0.85rem', color: '#aaa', marginLeft: 26, fontStyle: 'italic'}}>
                                 ↳ {portfolio.trader_logs[traderSym]}
                               </div>
                             )}
                         </div>
                     )})}
                  </div>
              )}
              
              {/* Other sections kept same... */}
              <h4 style={{marginTop: 30, marginBottom: 10, color: '#888'}}>Open Options Positions</h4>
              {portfolio.positions.length === 0 ? (
                  <div className="empty-state">No active trades yet. Waiting for signals...</div>
              ) : (
                  <div className="tech-table">
                     <div className="tech-row header">
                       <span>Contract</span>
                       <span>Entry</span>
                       <span>Current</span>
                       <span>P/L</span>
                     </div>
                     {portfolio.positions.map((p, i) => (
                         <div key={i} className="tech-row">
                             <span style={{color: p.type === 'CALL' ? '#00ff88' : '#ff4d4d'}}>
                                 {p.symbol} ${p.strike} {p.type}
                             </span>
                             <span>${p.entry_price}</span>
                             <span>${p.current_opt_price}</span>
                             <span className={p.unrealized_pl >= 0 ? 'bullish' : 'bearish'}>
                                 {p.unrealized_pl > 0 ? '+' : ''}{p.unrealized_pl} ({p.return_pct}%)
                             </span>
                         </div>
                     ))}
                  </div>
              )}
              
              <h4 style={{marginTop: 30, marginBottom: 10, color: '#888'}}>Recent Trade History</h4>
              <div className="tech-table">
                 {portfolio.history.map((h, i) => (
                     <div key={i} className="tech-row" style={{opacity: 0.7}}>
                         <span>{h.symbol} {h.type}</span>
                         <span>{h.reason}</span>
                         <span className={h.profit >= 0 ? 'bullish' : 'bearish'}>
                             {h.profit > 0 ? '+' : ''}${h.profit}
                         </span>
                     </div>
                 ))}
                 {portfolio.history.length === 0 && <div className="empty-state">No closed trades yet.</div>}
              </div>
           </div>
        </div>
      )
    }

    if (!data || !prediction) return null

    // 3. TECHNICAL ANALYSIS
    if (activeTab === 'technical') {
      return (
        <div className="grid-container technical-view">
          <div className="card full-width">
            <h3>Advanced Technical Indicators</h3>
            <div className="tech-table">
              <div className="tech-row header">
                <span>Indicator</span>
                <span>Value</span>
                <span>Signal</span>
              </div>
              
              <div className="tech-row clickable" onClick={() => openModal('RSI', data.indicators.rsi)}>
                <span><Info size={14} style={{marginRight:5}}/> RSI (14)</span>
                <span>{data.indicators.rsi}</span>
                <span className={data.indicators.rsi > 70 ? 'bearish' : data.indicators.rsi < 30 ? 'bullish' : 'neutral'}>
                  {data.indicators.rsi > 70 ? 'Overbought' : data.indicators.rsi < 30 ? 'Oversold' : 'Neutral'}
                </span>
              </div>
              
              <div className="tech-row clickable" onClick={() => openModal('MACD', data.indicators.macd_diff)}>
                <span><Info size={14} style={{marginRight:5}}/> MACD Diff</span>
                <span>{data.indicators.macd_diff}</span>
                <span className={data.indicators.macd_diff > 0 ? 'bullish' : 'bearish'}>
                  {data.indicators.macd_diff > 0 ? 'Bullish Cross' : 'Bearish Cross'}
                </span>
              </div>
              
              <div className="tech-row clickable" onClick={() => openModal('BB', data.indicators.bb_percent)}>
                <span><Info size={14} style={{marginRight:5}}/> Bollinger Bands %</span>
                <span>{(data.indicators.bb_percent * 100).toFixed(1)}%</span>
                <span className={data.indicators.bb_percent > 0.95 ? 'bullish' : data.indicators.bb_percent < 0.05 ? 'bearish' : 'neutral'}>
                  {data.indicators.bb_percent > 0.95 ? 'Breakout' : data.indicators.bb_percent < 0.05 ? 'Oversold' : 'Range'}
                </span>
              </div>
              
              <div className="tech-row clickable" onClick={() => openModal('SMA', data.indicators.sma_20, data.current_price)}>
                <span><Info size={14} style={{marginRight:5}}/> SMA 20</span>
                <span>${data.indicators.sma_20}</span>
                <span className={data.current_price > data.indicators.sma_20 ? 'bullish' : 'bearish'}>
                  {data.current_price > data.indicators.sma_20 ? 'Above Average' : 'Below Average'}
                </span>
              </div>
            </div>
          </div>
           <div className="card full-width chart-card">
              <h3>MACD Momentum</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.history.slice(-40)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis dataKey="Date" stroke="#666" tick={{fontSize: 10}} tickFormatter={(str) => new Date(str).toLocaleDateString('en-US', {month:'short', day:'numeric'})} />
                  <YAxis stroke="#666" />
                  <Tooltip contentStyle={{backgroundColor: '#1a1a1a', border: '1px solid #333'}} />
                  <Bar dataKey="Volume" fill="#00ff88" opacity={0.3} />
                </BarChart>
              </ResponsiveContainer>
           </div>
        </div>
      )
    }
    
    // 4. BACKTEST
    if (activeTab === 'backtest') {
      return (
        <div className="grid-container backtest-view">
          <div className="card full-width">
            <div className="card-header">
              <h3>Strategy Backtester (90 Days)</h3>
              <button onClick={runBacktest} className="refresh-btn"><History size={16}/> Run Simulation</button>
            </div>
            {backtestLoading ? (
              <div className="loading"><Zap className="spin" /> Simulating Trades...</div>
            ) : backtestResults ? (
              <>
                <div className="score-grid">
                  <div className="score-item">
                    <span className="label">Total Return</span>
                    <span className={`value ${backtestResults.return_percent >= 0 ? 'bullish' : 'bearish'}`}>
                      {backtestResults.return_percent > 0 ? '+' : ''}{backtestResults.return_percent}%
                    </span>
                  </div>
                  <div className="score-item">
                    <span className="label">Win Rate</span>
                    <span className="value">{backtestResults.win_rate}%</span>
                  </div>
                   <div className="score-item">
                    <span className="label">Final Balance</span>
                    <span className="value">${backtestResults.final_balance.toLocaleString()}</span>
                  </div>
                   <div className="score-item">
                    <span className="label">Trades Executed</span>
                    <span className="value">{backtestResults.total_trades}</span>
                  </div>
                </div>
                <div className="tech-table" style={{marginTop: 20}}>
                   <h4>Recent Trade Log</h4>
                   <div className="tech-row header">
                     <span>Date</span>
                     <span>Type</span>
                     <span>Price</span>
                     <span>Result</span>
                   </div>
                   {backtestResults.trades.map((t, i) => (
                     <div key={i} className="tech-row">
                       <span>{t.date}</span>
                       <span className={t.type === 'BUY' ? 'bullish' : 'bearish'}>{t.type}</span>
                       <span>${t.price}</span>
                       <span>{t.shares ? `${t.shares} Shares` : t.profit > 0 ? `+$${t.profit}` : `-$${Math.abs(t.profit)}`}</span>
                     </div>
                   ))}
                </div>
              </>
            ) : (
              <div className="loading" style={{color: '#666'}}>Click "Run Simulation" to test the AI strategy on {symbol} history.</div>
            )}
          </div>
        </div>
      )
    }

    // 5. OVERVIEW (DEFAULT)
    return (
        <div className="grid-container">
            <div className="card full-width chart-card">
            <div className="card-header">
                <div>
                <h2>{symbol} Forecast</h2>
                <p>AI Prediction (Next 7 Days)</p>
                </div>
                <div className="price-tag">
                ${data.current_price}
                <span className={prediction.direction === 'UP' ? 'bullish' : 'bearish'}>
                    {prediction.direction === 'UP' ? <TrendingUp size={16}/> : <TrendingDown size={16}/>}
                    {prediction.direction}
                </span>
                </div>
            </div>
            
            <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chartData}>
                <defs>
                    <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00ff88" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#00ff88" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorPred" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00ccff" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#00ccff" stopOpacity={0}/>
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                <XAxis dataKey="date" stroke="#666" tick={{fontSize: 12}} />
                <YAxis stroke="#666" domain={['auto', 'auto']} tick={{fontSize: 12}} tickFormatter={(val) => `$${val}`} />
                <Tooltip contentStyle={{backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: 8}} />
                <Legend />
                <Area type="monotone" dataKey="actual" stroke="#00ff88" fillOpacity={1} fill="url(#colorPrice)" name="Historical" strokeWidth={2} />
                <Area type="monotone" dataKey="predicted" stroke="#00ccff" strokeDasharray="5 5" fillOpacity={1} fill="url(#colorPred)" name="AI Prediction" strokeWidth={2} />
                </AreaChart>
            </ResponsiveContainer>
            </div>
            
            <div className="card">
                <h3>AI Sentinel Score</h3>
                <div className="score-circle">
                <svg viewBox="0 0 36 36" className="circular-chart">
                    <path className="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                    <path className="circle" strokeDasharray={`${prediction.confidence}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" stroke={prediction.confidence > 70 ? '#00ff88' : prediction.confidence < 40 ? '#ff4d4d' : '#ffaa00'} />
                </svg>
                <div className="percentage">
                    {prediction.confidence}%
                    <span>Confidence</span>
                </div>
                </div>
            </div>

            <div className="card">
                <h3>Market Sentiment</h3>
                <div className="sentiment-box">
                <div className="sentiment-row">
                    <span>News Sentiment</span>
                    <span className="bullish">Positive</span>
                </div>
                <div className="sentiment-row">
                    <span>Social Volume</span>
                    <span className="neutral">High</span>
                </div>
                <div className="sentiment-row">
                    <span>Volatility</span>
                    <span className="bearish">High</span>
                </div>
                </div>
            </div>
        </div>
    )
  }

  return (
    <div className="dashboard">
      {/* Bot Detail Modal */}
      {selectedBot && portfolio && (
        <div className="modal-overlay" onClick={() => setSelectedBot(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{width: 600}}>
             <div className="modal-header">
               <div style={{display:'flex', alignItems: 'center', gap: 10}}>
                 <User size={24} color="#00ff88"/>
                 <h2>{selectedBot} AI Bot</h2>
               </div>
               <button onClick={() => setSelectedBot(null)} className="close-btn"><X /></button>
             </div>
             <div className="modal-body">
                <div style={{background: '#252525', padding: 16, borderRadius: 8, marginBottom: 20, borderLeft: '4px solid #00ff88'}}>
                  <h4 style={{margin: '0 0 5px 0', color: '#888', fontSize: '0.8rem'}}>BOT PERSONALITY</h4>
                  <p style={{fontSize: '1.1rem', fontStyle: 'italic', margin: 0}}>"{botJoke}"</p>
                </div>
                
                <div className="section">
                  <h4 style={{color: '#888'}}>CURRENT STATUS</h4>
                  <p className="mono" style={{color: '#fff !important'}}>{portfolio.trader_logs[selectedBot] || "Sleeping..."}</p>
                </div>
                
                <div className="section">
                  <h4 style={{color: '#888'}}>PERFORMANCE (Since Start)</h4>
                  <div style={{fontSize: '2rem', fontWeight: 'bold', color: (portfolio.trader_pnl[selectedBot] || 0) >= 0 ? '#00ff88' : '#ff4d4d'}}>
                    {(portfolio.trader_pnl[selectedBot] || 0) >= 0 ? '+' : ''}${(portfolio.trader_pnl[selectedBot] || 0).toFixed(2)}
                  </div>
                </div>
                
                {/* Simple visual bar for now instead of complex chart since history is shared */}
                <div style={{width: '100%', height: 10, background: '#333', borderRadius: 5, overflow: 'hidden', marginTop: 10}}>
                   <div style={{
                     width: `${Math.min(Math.abs(portfolio.trader_pnl[selectedBot] || 0) / 10, 100)}%`, 
                     height: '100%', 
                     background: (portfolio.trader_pnl[selectedBot] || 0) >= 0 ? '#00ff88' : '#ff4d4d'
                   }}></div>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Indicator Modal (Keep Existing) */}
      {modalData && (
        <div className="modal-overlay" onClick={() => setModalData(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{modalData.title}</h2>
              <button onClick={() => setModalData(null)} className="close-btn"><X /></button>
            </div>
            <div className="modal-body">
              <div className="section">
                <h4>What does this mean for {symbol}?</h4>
                <p className="highlight">{modalData.currentAnalysis}</p>
              </div>
              <div className="section">
                <h4>Definition</h4>
                <p>{modalData.definition}</p>
              </div>
              <div className="section">
                <h4>Why it matters</h4>
                <p>{modalData.importance}</p>
              </div>
              <div className="section">
                <h4>How we calculate it</h4>
                <p className="mono">{modalData.calculation}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <nav className="sidebar">
        <div className="logo">
          <BrainCircuit size={28} color="#00ff88" />
          <span>TradeMind AI</span>
        </div>
        <ul className="nav-links">
          <li className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')}>
            <Activity size={18} /> Market Overview
          </li>
          <li className={activeTab === 'technical' ? 'active' : ''} onClick={() => setActiveTab('technical')}>
            <BarChart2 size={18} /> Technical Analysis
          </li>
          <li className={activeTab === 'screener' ? 'active' : ''} onClick={() => setActiveTab('screener')}>
            <Search size={18} /> Screener (New)
          </li>
          <li className={activeTab === 'backtest' ? 'active' : ''} onClick={() => setActiveTab('backtest')}>
            <History size={18} /> Backtest Strategy (New)
          </li>
          <li className={activeTab === 'portfolio' ? 'active' : ''} onClick={() => setActiveTab('portfolio')}>
            <Briefcase size={18} /> Live Portfolio (Sim)
          </li>
          <li><ShieldCheck size={18} /> Risk Analysis</li>
        </ul>
      </nav>

      <main className="main-content">
        <header>
          <div className="search-bar">
            <Search color="#888" size={20} />
            <input 
              type="text" 
              value={symbol} 
              onChange={(e) => setSymbol(e.target.value.toUpperCase())} 
              onKeyDown={(e) => e.key === 'Enter' && fetchData()}
              placeholder="Search Ticker (e.g. AAPL, NVDA)..."
            />
            <button onClick={fetchData}>Analyze</button>
          </div>
        </header>

        {loading && <div className="loading"><Zap className="spin" /> Crunching Data...</div>}
        {error && <div className="error">{error}</div>}
        
        {!loading && !error && renderContent()}
      </main>
    </div>
  )
}

export default App
