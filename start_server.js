#!/usr/bin/env node

/**
 * Cross-platform script to start the server
 * Works on both Mac/Linux and Windows
 */

const { execSync } = require('child_process');
const path = require('path');
const os = require('os');

const isWindows = os.platform() === 'win32';
const backendDir = path.join(__dirname, 'linkedin-extension', 'backend');

// Determine Python executable path based on OS
const pythonPath = isWindows
    ? path.join(backendDir, 'venv', 'Scripts', 'python.exe')
    : path.join(backendDir, 'venv', 'bin', 'python');

const serverPath = path.join(backendDir, 'server.py');

console.log('🚀 Starting LinkedIn Scraper Backend Server...');
console.log(`📡 Server will run on http://localhost:8000`);
console.log(`💡 Using Python: ${pythonPath}`);

try {
    // Change to backend directory and run server
    process.chdir(backendDir);
    execSync(`"${pythonPath}" server.py`, { stdio: 'inherit' });
} catch (error) {
    console.error('❌ Error starting server:', error.message);
    process.exit(1);
}

