#!/bin/bash

# Set project configuration
export PROJECT_ID="nollaapp1"
export FLASK_ENV="production"

# Get the project number
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
if [ -z "$PROJECT_NUMBER" ]; then
    echo "ERROR: Could not get project number. Make sure you're logged into gcloud and have access to the project."
    exit 1
fi

echo "Project configuration:"
echo "PROJECT_ID: $PROJECT_ID"
echo "PROJECT_NUMBER: $PROJECT_NUMBER"
echo "FLASK_ENV: $FLASK_ENV"

# Run the secrets setup script
./scripts/setup_secrets.sh

# Run the monitoring setup script
./scripts/setup_monitoring.sh

# Build and push the Docker image
gcloud builds submit --config cloudbuild.yaml

echo "Setup complete! Your application should now be deploying to Cloud Run."
