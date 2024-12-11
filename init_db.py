import os
import sys
import time
import logging
from sqlalchemy.exc import OperationalError
from appnolla1 import app, db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def wait_for_db(max_retries=5, delay=5):
    """Wait for database to be ready"""
    for i in range(max_retries):
        try:
            logger.info(f"Attempting to connect to database (attempt {i + 1}/{max_retries})...")
            with app.app_context():
                db.engine.connect()
                logger.info("Successfully connected to database!")
                return True
        except OperationalError as e:
            if i < max_retries - 1:
                logger.warning(f"Database not ready yet: {str(e)}")
                logger.info(f"Waiting {delay} seconds before retrying...")
                time.sleep(delay)
            else:
                logger.error("Max retries reached. Could not connect to database.")
                raise
    return False

def init_db():
    """Initialize the database"""
    try:
        # Wait for database to be ready
        wait_for_db()

        # Create tables
        with app.app_context():
            logger.info("Creating database tables...")
            db.create_all()
            logger.info("Database tables created successfully!")
            
            # Verify tables exist
            tables = db.engine.table_names()
            logger.info(f"Existing tables: {', '.join(tables)}")
            
    except Exception as e:
        logger.error(f"Error initializing database: {str(e)}")
        raise

if __name__ == '__main__':
    try:
        init_db()
    except Exception as e:
        logger.error(f"Database initialization failed: {str(e)}")
        sys.exit(1)
