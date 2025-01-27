#!/bin/bash

# Check if required environment variables are set
if [ -z "$PROJECT_ID" ]; then
    echo "ERROR: PROJECT_ID environment variable is not set"
    exit 1
fi

# Enable required APIs
echo "Enabling required APIs..."
gcloud services enable \
    monitoring.googleapis.com \
    cloudtrace.googleapis.com \
    clouddebugger.googleapis.com \
    cloudprofiler.googleapis.com \
    --project="$PROJECT_ID"

# Create alert policies
echo "Creating alert policies..."

# CPU utilization alert
gcloud alpha monitoring policies create \
    --project="$PROJECT_ID" \
    --display-name="High CPU Usage" \
    --condition-display-name="CPU usage above 80%" \
    --condition-filter="resource.type = \"cloud_run_revision\" AND metric.type = \"run.googleapis.com/container/cpu/utilizations\"" \
    --condition-threshold-value=0.8 \
    --condition-threshold-duration=300s \
    --notification-channels="$NOTIFICATION_CHANNEL" \
    --documentation-content="CPU usage is above 80% for 5 minutes"

# Memory utilization alert
gcloud alpha monitoring policies create \
    --project="$PROJECT_ID" \
    --display-name="High Memory Usage" \
    --condition-display-name="Memory usage above 80%" \
    --condition-filter="resource.type = \"cloud_run_revision\" AND metric.type = \"run.googleapis.com/container/memory/utilizations\"" \
    --condition-threshold-value=0.8 \
    --condition-threshold-duration=300s \
    --notification-channels="$NOTIFICATION_CHANNEL" \
    --documentation-content="Memory usage is above 80% for 5 minutes"

# Error rate alert
gcloud alpha monitoring policies create \
    --project="$PROJECT_ID" \
    --display-name="High Error Rate" \
    --condition-display-name="Error rate above 5%" \
    --condition-filter="resource.type = \"cloud_run_revision\" AND metric.type = \"run.googleapis.com/request_count\" AND metric.labels.response_code_class = \"5xx\"" \
    --condition-threshold-value=0.05 \
    --condition-threshold-duration=300s \
    --notification-channels="$NOTIFICATION_CHANNEL" \
    --documentation-content="Error rate is above 5% for 5 minutes"

# Create dashboard
echo "Creating monitoring dashboard..."
gcloud monitoring dashboards create \
    --project="$PROJECT_ID" \
    --config-from-file=monitoring/dashboard.json

echo "Monitoring setup complete!"
