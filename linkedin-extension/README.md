# LinkedIn Post Scraper Extension

A Chrome extension that uses a Python backend with `linkedin-api==0.0.1` to login to LinkedIn and poll for posts matching specific keywords. Post IDs are saved in storage for later use.

## Features

- 🔐 **LinkedIn Login**: Authenticate using LinkedIn credentials via Python backend
- 🔍 **Keyword-based Scraping**: Search for posts containing specific keywords
- ⏰ **Automatic Polling**: Continuously poll LinkedIn for new posts matching keywords
- 💾 **Post Storage**: Save post IDs, keywords, and metadata in Chrome storage
- 📊 **Statistics**: View total scraped posts and polling status

## Architecture

This extension uses a **hybrid architecture**:

- **Chrome Extension** (JavaScript): Handles UI, user interactions, and Chrome storage
- **Python Backend** (Flask): Uses `linkedin-api==0.0.1` library to interact with LinkedIn

## Setup Instructions

### Step 1: Install Python Dependencies

1. Navigate to the `backend` directory:

   ```bash
   cd "linkedin-extension copy 2/backend"
   ```

2. Create a virtual environment (recommended):

   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install required packages:

   ```bash
   pip install -r requirements.txt
   ```

   This will install:

   - `linkedin-api==0.0.1`
   - `flask==3.0.0`
   - `flask-cors==4.0.0`

### Step 2: Start the Backend Server

1. Make sure you're in the `backend` directory with the virtual environment activated
2. Run the server:

   ```bash
   python server.py
   ```

   You should see:

   ```
   🚀 Starting LinkedIn Scraper Backend Server...
   📡 Server will run on http://localhost:8000
   💡 Make sure to install dependencies: pip install -r requirements.txt
   * Running on http://0.0.0.0:8000
   ```

3. Keep this terminal window open while using the extension

### Step 3: Load the Chrome Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `linkedin-extension copy 2` folder
5. The extension should now appear in your extensions list

### Step 4: Use the Extension

1. Click the extension icon in your Chrome toolbar
2. **Login**:
   - Enter your LinkedIn email and password
   - Click "Login to LinkedIn"
   - Wait for successful authentication
3. **Configure Scraping**:
   - Add keywords (press Enter after each keyword)
   - Set polling interval (in minutes, default: 5)
   - Click "Start Polling"
4. **View Results**:
   - Check the statistics section for total posts scraped
   - Click "View Scraped Posts" to see all collected post IDs
   - Click "Stop Polling" to pause the scraper

## Project Structure

```
linkedin-extension copy 2/
├── backend/
│   ├── server.py          # Flask backend server
│   └── requirements.txt    # Python dependencies
├── Scripts/
│   ├── extractLinkedInTokens.js
│   ├── linkedInLogin.js
│   └── voyagerAPI.js
├── background.js           # Extension background service worker
├── popup.js                # Extension popup UI logic
├── popup.html              # Extension popup UI
├── content.js              # Content script for LinkedIn pages
├── manifest.json           # Extension manifest
├── constants.js            # Constants
└── README.md               # This file
```

## API Endpoints

The backend server provides the following endpoints:

- `GET /health` - Health check
- `POST /login` - Login to LinkedIn
  ```json
  {
    "email": "your@email.com",
    "password": "yourpassword"
  }
  ```
- `POST /search_posts` - Search for posts with keywords
  ```json
  {
    "keywords": ["javascript", "python"]
  }
  ```
- `POST /poll_posts` - Poll for new posts (used by polling mechanism)
  ```json
  {
    "keywords": ["javascript", "python"]
  }
  ```
- `GET /get_scraped_posts` - Get all scraped post IDs
- `POST /clear_posts` - Clear all scraped posts
- `POST /logout` - Logout from LinkedIn

## How It Works

1. **Login Flow**:

   - User enters credentials in extension popup
   - Extension sends credentials to background script
   - Background script calls backend `/login` endpoint
   - Backend uses `linkedin-api` library to authenticate
   - Session is maintained in backend

2. **Polling Flow**:

   - User adds keywords and starts polling
   - Background script calls `/poll_posts` at specified intervals
   - Backend searches LinkedIn feed for posts matching keywords
   - New post IDs are returned and stored in Chrome storage
   - User receives notifications when new posts are found

3. **Storage**:
   - Post IDs are stored in both:
     - Backend memory (for current session)
     - Chrome storage.local (persistent across sessions)

## Troubleshooting

### Backend Server Not Running

- **Error**: "Backend server not running"
- **Solution**: Make sure the Python server is running on `http://localhost:8000`
- Check the terminal where you started the server

### Login Fails

- **Error**: "Login failed" or authentication errors
- **Solution**:
  - Verify your LinkedIn credentials are correct
  - Check if LinkedIn requires 2FA (two-factor authentication)
  - Ensure `linkedin-api==0.0.1` is properly installed

### No Posts Found

- **Possible Causes**:
  - Keywords might be too specific
  - LinkedIn feed might not have recent posts matching keywords
  - API rate limiting (wait a bit and try again)

### CORS Errors

- **Error**: CORS policy errors in browser console
- **Solution**: Make sure `flask-cors` is installed and the backend is running

## Security Notes

⚠️ **Important Security Considerations**:

- Credentials are sent to the backend server (localhost only)
- Consider using environment variables for sensitive data in production
- The backend stores credentials temporarily in memory
- Post IDs are stored locally in Chrome storage

## Development

### Testing the Backend

You can test the backend API directly using curl:

```bash
# Health check
curl http://localhost:8000/health

# Login
curl -X POST http://localhost:8000/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com","password":"yourpassword"}'

# Search posts
curl -X POST http://localhost:8000/search_posts \
  -H "Content-Type: application/json" \
  -d '{"keywords":["javascript"]}'
```

### Modifying Polling Interval

The polling interval can be changed in the extension popup UI (1-60 minutes).

## Notes

- The `linkedin-api==0.0.1` library may have limitations compared to newer versions
- LinkedIn's API structure may change, requiring updates to the backend code
- Rate limiting: Be mindful of LinkedIn's rate limits when polling frequently
- The extension requires the backend server to be running at all times

## License

This project is for educational purposes. Make sure to comply with LinkedIn's Terms of Service when using this extension.
