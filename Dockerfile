# Use Python 3.9 slim image
FROM python:3.9-slim

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    python3-dev \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user
RUN useradd -m appuser && chown -R appuser:appuser /app

# Create necessary directories
RUN mkdir -p /app/instance && chown -R appuser:appuser /app/instance && chmod 777 /app/instance
RUN mkdir -p /app/secrets && chown -R appuser:appuser /app/secrets
RUN mkdir -p /app/uploads && chown -R appuser:appuser /app/uploads && chmod 777 /app/uploads

# Copy requirements first for better caching
COPY --chown=appuser:appuser requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt gunicorn[gevent]

# Copy the application files
COPY --chown=appuser:appuser nollaapp /app/nollaapp/
COPY --chown=appuser:appuser static /app/static/
COPY --chown=appuser:appuser templates /app/templates/

# Create startup script
RUN echo '#!/bin/sh\n\
cd /app && \
PYTHONPATH=/app \
exec gunicorn \
    --worker-class gevent \
    --worker-connections 1000 \
    --bind "0.0.0.0:$PORT" \
    --workers 1 \
    --threads 8 \
    --timeout 300 \
    --worker-tmp-dir /dev/shm \
    --access-logfile - \
    --error-logfile - \
    --log-level info \
    --chdir /app \
    "nollaapp.appnolla1:app"' > /app/start.sh && \
    chmod +x /app/start.sh

# Set non-sensitive environment variables
ENV FLASK_APP=nollaapp.appnolla1:app
ENV FLASK_ENV=production
ENV PORT=8084
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app
ENV UPLOAD_FOLDER=/app/uploads

# Switch to non-root user
USER appuser

# Expose the port
EXPOSE 8084

# Use exec form of CMD with JSON array
CMD ["./start.sh"]
