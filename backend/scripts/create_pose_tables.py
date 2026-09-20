#!/usr/bin/env python3
"""
Script to create pose data tables for SQLAlchemy storage.

This script creates tables for storing pose data that doesn't work well
with Prisma/GraphQL due to:
1. GraphQL field name restrictions (numeric keys)
2. Large JSON data (450 frames with landmarks)
3. Performance issues with large transactions
"""

import os
import sys
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def get_database_url():
    """Get database URL from environment variables."""
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("Error: DATABASE_URL environment variable is not set")
        print("Please set DATABASE_URL in your .env file")
        sys.exit(1)
    return database_url

def read_sql_file(file_path):
    """Read SQL file content."""
    try:
        with open(file_path, 'r') as f:
            return f.read()
    except FileNotFoundError:
        print(f"Error: SQL file not found: {file_path}")
        sys.exit(1)
    except Exception as e:
        print(f"Error reading SQL file: {str(e)}")
        sys.exit(1)

def execute_sql_script(connection, sql_script):
    """Execute SQL script."""
    try:
        cursor = connection.cursor()
        
        # Split script into individual statements
        statements = sql_script.split(';')
        
        for statement in statements:
            statement = statement.strip()
            if statement:
                print(f"Executing: {statement[:50]}...")
                cursor.execute(statement)
        
        connection.commit()
        cursor.close()
        print("SQL script executed successfully")
        
    except Exception as e:
        print(f"Error executing SQL script: {str(e)}")
        connection.rollback()
        raise

def main():
    """Main function to create pose tables."""
    print("Creating pose data tables for SQLAlchemy storage...")
    
    # Get database URL
    database_url = get_database_url()
    print(f"Database URL: {database_url.split('@')[0]}...")
    
    # Read SQL script
    sql_file_path = os.path.join(os.path.dirname(__file__), "create_pose_tables.sql")
    print(f"Reading SQL script from: {sql_file_path}")
    sql_script = read_sql_file(sql_file_path)
    
    # Connect to database and execute script
    try:
        connection = psycopg2.connect(database_url)
        connection.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        
        print("Connected to database successfully")
        execute_sql_script(connection, sql_script)
        
        connection.close()
        print("Pose tables created successfully!")
        
    except psycopg2.OperationalError as e:
        print(f"Database connection error: {str(e)}")
        print("Please check your DATABASE_URL and ensure the database is running")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()