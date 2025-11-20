#!/bin/bash

# LinkedIn Scraper Backend Startup Script

echo "🚀 Starting LinkedIn Scraper Backend Server..."
echo ""

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source venv/bin/activate

# Install/update dependencies
echo "📥 Installing dependencies..."
pip install -r requirements.txt

# Start the server
echo ""
echo "✅ Starting server on http://localhost:8000"
echo "💡 Press Ctrl+C to stop the server"
echo ""
python server.py

