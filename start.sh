#!/bin/bash

# Gravion Phase 1 Startup Script
# Automatically stops existing servers, starts in new terminals, then opens browser

echo "🚀 Starting Gravion Phase 1..."
echo "================================"

# Stop existing backend server if running
echo "0. Checking for existing servers..."
BACKEND_PID=$(lsof -ti :8000)
if [ ! -z "$BACKEND_PID" ]; then
    echo "Stopping existing backend server (PID: $BACKEND_PID)..."
    kill $BACKEND_PID
    sleep 1
fi

# Stop existing frontend server if running
FRONTEND_PID=$(lsof -ti :5173)
if [ ! -z "$FRONTEND_PID" ]; then
    echo "Stopping existing frontend server (PID: $FRONTEND_PID)..."
    kill $FRONTEND_PID
    sleep 1
fi

# Start backend server in new terminal
echo "1. Starting backend server..."
osascript -e 'tell application "Terminal" to do script "cd /Users/a1-6/Documents/trae_projects/gravion/backend && python main.py"'

# Wait a bit for backend to initialize
sleep 2

# Start frontend server in new terminal
echo "2. Starting frontend server..."
osascript -e 'tell application "Terminal" to do script "cd /Users/a1-6/Documents/trae_projects/gravion/frontend && npm run dev"'

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
echo "📋 Servers are running in separate Terminal windows for monitoring"
echo ""
echo "🛑 To stop servers:"
echo "1. Close the Terminal windows"
echo "2. Or run: kill $(lsof -ti :8000) $(lsof -ti :5173)"
echo ""
echo "📖 Usage:"
echo "1. Click 'Run Scan' in the sidebar"
echo "2. Backend will fetch AAPL data from yfinance"
echo "3. Data will be saved to SQLite database"
echo "4. Frontend will display data in the grid"
