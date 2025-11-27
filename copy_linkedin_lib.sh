#!/bin/bash

# Script to copy linkedin.py to venv location (Mac/Linux)
# Usage: ./copy_linkedin_lib.sh

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Source file
SOURCE_FILE="linkedin.py"

# Destination file
DEST_FILE="linkedin-extension/backend/venv/lib/python3.9/site-packages/linkedin_api/linkedin.py"

# Check if source file exists
if [ ! -f "$SOURCE_FILE" ]; then
    echo "❌ Error: $SOURCE_FILE not found in current directory"
    echo "   Please make sure linkedin.py exists in the project root"
    exit 1
fi

# Check if destination directory exists
DEST_DIR=$(dirname "$DEST_FILE")
if [ ! -d "$DEST_DIR" ]; then
    echo "❌ Error: Destination directory does not exist: $DEST_DIR"
    echo "   Please make sure the venv is set up correctly"
    exit 1
fi

# Create backup of existing file if it exists
if [ -f "$DEST_FILE" ]; then
    BACKUP_FILE="${DEST_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
    echo "📦 Creating backup of existing file: $BACKUP_FILE"
    cp "$DEST_FILE" "$BACKUP_FILE"
fi

# Copy the file
echo "📋 Copying $SOURCE_FILE to $DEST_FILE..."
cp "$SOURCE_FILE" "$DEST_FILE"

# Check if copy was successful
if [ $? -eq 0 ]; then
    echo "✅ Successfully copied linkedin.py to venv location"
    echo "   Restart your server for changes to take effect"
else
    echo "❌ Error: Failed to copy file"
    exit 1
fi

