#!/bin/bash

# Gravion Phase 1 Startup Script
# Automatically starts backend and frontend servers, then opens browser

echo "🚀 Starting Gravion Phase 1..."
echo "================================"

# Start backend server
echo "1. Starting backend server..."
cd backend
python main.py &
BACKEND_PID=$!
cd ..

# Wait a bit for backend to initialize
sleep 2

# Start frontend server
echo "2. Starting frontend server..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

# Wait for frontend to start
sleep 3

# Open browser to the application
echo "3. Opening browser..."
open http://localhost:5173

echo "================================"
echo "✅ Gravion Phase 1 started successfully!"
echo ""
echo "🌐 Frontend: http://localhost:5173"
echo "🖥️ Backend: http://localhost:8000"
echo ""
echo "📋 Running Processes:"
echo "- Backend PID: $BACKEND_PID"
echo "- Frontend PID: $FRONTEND_PID"
echo ""
echo "🛑 To stop servers, run: kill $BACKEND_PID $FRONTEND_PID"
echo ""
echo "📖 Usage:"
echo "1. Click 'Run Scan' in the sidebar"
echo "2. Backend will fetch AAPL data from yfinance"
echo "3. Data will be saved to SQLite database"
echo "4. Frontend will display data in the grid"
