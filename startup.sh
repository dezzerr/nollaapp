#!/bin/bash

# Exit on error
set -e

echo "Starting application initialization..."

# Initialize the database
echo "Initializing database..."
python init_db.py

# Start the application
echo "Starting the application..."
gunicorn --worker-class gevent -w 1 --log-file=- --bind=0.0.0.0:$PORT appnolla1:app
