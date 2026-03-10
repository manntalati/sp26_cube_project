import os

# Allow OAuth over HTTP for local development (never use in production)
os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from routes.auth import auth_bp
from routes.fireflies import fireflies_bp
from routes.calendar_api import calendar_bp

app = Flask(__name__)
# Secret key for session management (used for OAuth state)
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'dev_secret_key_123')

# Enable CORS for the frontend app
CORS(app, supports_credentials=True, origins=["http://localhost:5173", "http://127.0.0.1:5173"])

# Register blueprints
app.register_blueprint(auth_bp, url_prefix='/api/auth')
app.register_blueprint(fireflies_bp, url_prefix='/api/fireflies')
app.register_blueprint(calendar_bp, url_prefix='/api/calendar')

@app.route('/api/health')
def health_check():
    return jsonify({"status": "ok", "message": "Backend is running"})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    app.run(debug=True, host='0.0.0.0', port=port)
