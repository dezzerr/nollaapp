web: apt-get update && apt-get install -y ffmpeg && gunicorn --worker-class gevent --workers 1 --log-file=- --bind=0.0.0.0:$PORT appnolla1:app
