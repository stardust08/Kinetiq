"""
Script to add screening count columns to existing Booking table.
This is an incremental migration for an existing database.
"""

import asyncio
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent))

from prisma import Prisma

async def add_screening_columns():
    """Add screening count columns to Booking table."""
    
    db = Prisma()
    await db.connect()
    
    try:
        print("Adding screening count columns to Booking table...")
        print("="*60)
        
        # Add the three screening count columns
        print("\n1. Adding totalScreeningCount column...")
        try:
            await db.execute_raw("""
                ALTER TABLE "Booking" 
                ADD COLUMN IF NOT EXISTS "totalScreeningCount" INTEGER NOT NULL DEFAULT 0;
            """)
            print("   ✓ totalScreeningCount column added")
        except Exception as e:
            if "already exists" in str(e).lower():
                print("   ⚠️  Column already exists, skipping")
            else:
                raise
        
        print("\n2. Adding usedScreeningCount column...")
        try:
            await db.execute_raw("""
                ALTER TABLE "Booking" 
                ADD COLUMN IF NOT EXISTS "usedScreeningCount" INTEGER NOT NULL DEFAULT 0;
            """)
            print("   ✓ usedScreeningCount column added")
        except Exception as e:
            if "already exists" in str(e).lower():
                print("   ⚠️  Column already exists, skipping")
            else:
                raise
        
        print("\n3. Adding remainingScreeningCount column...")
        try:
            await db.execute_raw("""
                ALTER TABLE "Booking" 
                ADD COLUMN IF NOT EXISTS "remainingScreeningCount" INTEGER NOT NULL DEFAULT 0;
            """)
            print("   ✓ remainingScreeningCount column added")
        except Exception as e:
            if "already exists" in str(e).lower():
                print("   ⚠️  Column already exists, skipping")
            else:
                raise
        
        # Add includedScreeningCount to Service table
        print("\n4. Adding includedScreeningCount column to Service table...")
        try:
            await db.execute_raw("""
                ALTER TABLE "Service" 
                ADD COLUMN IF NOT EXISTS "includedScreeningCount" INTEGER;
            """)
            print("   ✓ includedScreeningCount column added to Service")
        except Exception as e:
            if "already exists" in str(e).lower():
                print("   ⚠️  Column already exists, skipping")
            else:
                raise
        
        print("\n" + "="*60)
        print("✅ All screening count columns added successfully!")
        print("="*60)
        
        # Verify columns were added
        print("\nVerifying columns...")
        columns = await db.query_raw("""
            SELECT column_name, data_type, column_default
            FROM information_schema.columns
            WHERE table_schema = 'public' 
            AND table_name = 'Booking'
            AND column_name LIKE '%screening%'
            ORDER BY column_name;
        """)
        
        print("\nScreening count columns in Booking table:")
        for col in columns:
            print(f"  - {col['column_name']}: {col['data_type']} (default: {col['column_default']})")
        
        # Check Service table
        service_cols = await db.query_raw("""
            SELECT column_name, data_type, column_default
            FROM information_schema.columns
            WHERE table_schema = 'public' 
            AND table_name = 'Service'
            AND column_name = 'includedScreeningCount';
        """)
        
        if service_cols:
            print("\nScreening count column in Service table:")
            for col in service_cols:
                print(f"  - {col['column_name']}: {col['data_type']} (default: {col['column_default']})")
        
    except Exception as e:
        print(f"\n❌ Error adding columns: {e}")
        raise
    finally:
        await db.disconnect()

if __name__ == "__main__":
    asyncio.run(add_screening_columns())
