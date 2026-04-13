import os

# Allow OAuth over HTTP for local development (never use in production)
os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'
# Accept tokens whose scope is a superset of what was requested
# (Google may return previously-granted scopes like 'tasks' even if we only asked for calendar.events)
os.environ['OAUTHLIB_RELAX_TOKEN_SCOPE'] = '1'
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from routes.auth import auth_bp
from routes.fireflies import fireflies_bp
from routes.calendar_api import calendar_bp
from routes.gemini import gemini_bp
from routes.settings import settings_bp
from routes.demo import demo_bp
from services.background_analysis import start_background_worker

app = Flask(__name__)
# Secret key for session management (used for OAuth state)
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'dev_secret_key_123')

# Enable CORS for the frontend app
CORS(
    app,
    supports_credentials=True,
    origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5002",
        "http://127.0.0.1:5002",
        "file://",
        "null",
    ],
)

# Register blueprints
app.register_blueprint(auth_bp, url_prefix='/api/auth')
app.register_blueprint(fireflies_bp, url_prefix='/api/fireflies')
app.register_blueprint(calendar_bp, url_prefix='/api/calendar')
app.register_blueprint(gemini_bp, url_prefix='/api/gemini')
app.register_blueprint(settings_bp, url_prefix='/api/settings')
app.register_blueprint(demo_bp, url_prefix='/api/demo')

# Start background analysis worker (avoid double-start in debug reloader)
if os.environ.get("WERKZEUG_RUN_MAIN") == "true" or not app.debug:
    start_background_worker()

@app.route('/api/health')
def health_check():
    return jsonify({"status": "ok", "message": "Backend is running"})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5002))
    use_debug = os.environ.get('FLASK_DEBUG', '1') != '0'
    app.run(debug=use_debug, host='0.0.0.0', port=port)
