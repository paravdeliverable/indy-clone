#!/usr/bin/env node

/**
 * Cross-platform script to copy linkedin.py to venv location
 * Works on both Mac/Linux and Windows
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SCRIPT_DIR = __dirname;
const SOURCE_FILE = path.join(SCRIPT_DIR, 'linkedin.py');
const DEST_FILE = path.join(
    SCRIPT_DIR,
    'linkedin-extension',
    'backend',
    'venv',
    'lib',
    'python3.9',
    'site-packages',
    'linkedin_api',
    'linkedin.py'
);

// Check if source file exists
if (!fs.existsSync(SOURCE_FILE)) {
    console.error('❌ Error: linkedin.py not found in project root');
    console.error(`   Expected: ${SOURCE_FILE}`);
    process.exit(1);
}

// Check if destination directory exists
const DEST_DIR = path.dirname(DEST_FILE);
if (!fs.existsSync(DEST_DIR)) {
    console.error('❌ Error: Destination directory does not exist');
    console.error(`   Expected: ${DEST_DIR}`);
    console.error('   Please make sure the venv is set up correctly');
    process.exit(1);
}

// Create backup of existing file if it exists
if (fs.existsSync(DEST_FILE)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const BACKUP_FILE = `${DEST_FILE}.backup.${timestamp}`;
    console.log(`📦 Creating backup of existing file: ${path.basename(BACKUP_FILE)}`);
    fs.copyFileSync(DEST_FILE, BACKUP_FILE);
}

// Copy the file
console.log(`📋 Copying linkedin.py to venv location...`);
try {
    fs.copyFileSync(SOURCE_FILE, DEST_FILE);
    console.log('✅ Successfully copied linkedin.py to venv location');
    console.log('   Restart your server for changes to take effect');
} catch (error) {
    console.error('❌ Error: Failed to copy file');
    console.error(`   ${error.message}`);
    process.exit(1);
}

