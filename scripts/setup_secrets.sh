#!/bin/bash

# Check if required environment variables are set
if [ -z "$PROJECT_ID" ]; then
    echo "ERROR: PROJECT_ID environment variable is not set"
    exit 1
fi

# Get the project number
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
if [ -z "$PROJECT_NUMBER" ]; then
    echo "ERROR: Could not get project number"
    exit 1
fi

# Get the Cloud Run service account
SERVICE_ACCOUNT="service-${PROJECT_NUMBER}@serverless-robot-prod.iam.gserviceaccount.com"
echo "Using service account: $SERVICE_ACCOUNT"

# Create secrets in Secret Manager
echo "Creating secrets in Secret Manager..."

# Create secret for Firebase credentials
echo "Creating firebase-credentials secret..."
gcloud secrets create firebase-credentials \
    --project="$PROJECT_ID" \
    --replication-policy="automatic" || true

# Create secret for OpenAI API key
echo "Creating openai-api-key secret..."
gcloud secrets create openai-api-key \
    --project="$PROJECT_ID" \
    --replication-policy="automatic" || true

# Create secret for app secret key
echo "Creating app-secret-key secret..."
gcloud secrets create app-secret-key \
    --project="$PROJECT_ID" \
    --replication-policy="automatic" || true

# Generate a random secret key for Flask
FLASK_SECRET_KEY=$(openssl rand -hex 24)

# Update secret values
echo "Updating secret values..."

# Update Firebase credentials from file
if [ -f "firebase-credentials.json" ]; then
    gcloud secrets versions add firebase-credentials \
        --project="$PROJECT_ID" \
        --data-file="firebase-credentials.json"
    echo "Firebase credentials updated"
else
    echo "WARNING: firebase-credentials.json not found"
fi

# Update OpenAI API key from environment
if [ -n "$OPENAI_API_KEY" ]; then
    echo "$OPENAI_API_KEY" | \
    gcloud secrets versions add openai-api-key \
        --project="$PROJECT_ID" \
        --data-file=-
    echo "OpenAI API key updated"
else
    echo "WARNING: OPENAI_API_KEY environment variable not set"
fi

# Update Flask secret key
echo "$FLASK_SECRET_KEY" | \
gcloud secrets versions add app-secret-key \
    --project="$PROJECT_ID" \
    --data-file=-
echo "App secret key updated"

# Grant access to Cloud Run service account
echo "Granting access to Cloud Run service account..."

# Get the default compute service account
COMPUTE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
echo "Using compute account: $COMPUTE_ACCOUNT"

for SECRET_NAME in "firebase-credentials" "openai-api-key" "app-secret-key"; do
    echo "Granting access to $SECRET_NAME for compute account..."
    gcloud secrets add-iam-policy-binding "$SECRET_NAME" \
        --project="$PROJECT_ID" \
        --member="serviceAccount:$COMPUTE_ACCOUNT" \
        --role="roles/secretmanager.secretAccessor"
        
    echo "Granting access to $SECRET_NAME for Cloud Run service account..."
    gcloud secrets add-iam-policy-binding "$SECRET_NAME" \
        --project="$PROJECT_ID" \
        --member="serviceAccount:$SERVICE_ACCOUNT" \
        --role="roles/secretmanager.secretAccessor"
done

echo "Secret setup complete!"
