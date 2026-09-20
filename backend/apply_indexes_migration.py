#!/usr/bin/env python3
"""
Script to apply the screening count indexes migration.

This script applies the migration that adds:
1. Composite index on Booking(userId, remainingScreeningCount)
2. Composite index on PostureAnalysis(bookingId, analysisDate)
3. Partial index on Booking for active bookings with remaining counts

Usage:
    python apply_indexes_migration.py
"""

import asyncio
import sys
from pathlib import Path

# Add the app directory to the path
sys.path.insert(0, str(Path(__file__).parent))

from prisma import Prisma


async def apply_migration():
    """Apply the indexes migration."""
    db = Prisma()
    
    try:
        print("Connecting to database...")
        await db.connect()
        print("✓ Connected to database")
        
        # Read the migration SQL
        migration_path = Path(__file__).parent / "prisma" / "migrations" / "20260217130037_add_screening_count_indexes" / "migration.sql"
        
        if not migration_path.exists():
            print(f"✗ Migration file not found: {migration_path}")
            return False
        
        print(f"Reading migration from: {migration_path}")
        migration_sql = migration_path.read_text()
        
        print("\nApplying migration...")
        print("=" * 60)
        print(migration_sql)
        print("=" * 60)
        
        # Split the SQL into individual statements
        statements = [s.strip() for s in migration_sql.split(';') if s.strip() and not s.strip().startswith('--')]
        
        for i, statement in enumerate(statements, 1):
            print(f"\nExecuting statement {i}/{len(statements)}...")
            try:
                await db.execute_raw(statement)
                print(f"✓ Statement {i} executed successfully")
            except Exception as e:
                error_msg = str(e)
                # Check if index already exists
                if "already exists" in error_msg.lower():
                    print(f"⚠ Index already exists (skipping): {error_msg}")
                else:
                    print(f"✗ Error executing statement {i}: {error_msg}")
                    raise
        
        print("\n" + "=" * 60)
        print("✓ Migration applied successfully!")
        print("=" * 60)
        
        # Verify indexes were created
        print("\nVerifying indexes...")
        
        # Query to check indexes on Booking table
        booking_indexes = await db.query_raw("""
            SELECT indexname, indexdef 
            FROM pg_indexes 
            WHERE tablename = 'Booking' 
            AND indexname LIKE '%screening%'
            ORDER BY indexname;
        """)
        
        print("\nBooking table indexes:")
        for idx in booking_indexes:
            print(f"  - {idx['indexname']}")
            print(f"    {idx['indexdef']}")
        
        # Query to check indexes on PostureAnalysis table
        posture_indexes = await db.query_raw("""
            SELECT indexname, indexdef 
            FROM pg_indexes 
            WHERE tablename = 'PostureAnalysis' 
            AND (indexname LIKE '%booking%' OR indexname LIKE '%analysis%')
            ORDER BY indexname;
        """)
        
        print("\nPostureAnalysis table indexes:")
        for idx in posture_indexes:
            print(f"  - {idx['indexname']}")
            print(f"    {idx['indexdef']}")
        
        return True
        
    except Exception as e:
        print(f"\n✗ Error applying migration: {e}")
        import traceback
        traceback.print_exc()
        return False
        
    finally:
        print("\nDisconnecting from database...")
        await db.disconnect()
        print("✓ Disconnected")


async def main():
    """Main entry point."""
    print("=" * 60)
    print("Screening Count Indexes Migration")
    print("=" * 60)
    print()
    
    success = await apply_migration()
    
    if success:
        print("\n✓ Migration completed successfully!")
        sys.exit(0)
    else:
        print("\n✗ Migration failed!")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
