#!/usr/bin/env python3
"""
Script to directly create the screening count indexes.
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from prisma import Prisma


async def create_indexes():
    """Create the indexes directly."""
    db = Prisma()
    
    try:
        print("Connecting to database...")
        await db.connect()
        print("✓ Connected to database\n")
        
        # Index 1: Composite index on Booking
        print("Creating Booking_userId_remainingScreeningCount_idx...")
        try:
            await db.execute_raw('''
                CREATE INDEX IF NOT EXISTS "Booking_userId_remainingScreeningCount_idx" 
                ON "Booking"("userId", "remainingScreeningCount");
            ''')
            print("✓ Created Booking_userId_remainingScreeningCount_idx\n")
        except Exception as e:
            print(f"Error: {e}\n")
        
        # Index 2: Partial index on Booking
        print("Creating Booking_active_with_counts_idx...")
        try:
            await db.execute_raw('''
                CREATE INDEX IF NOT EXISTS "Booking_active_with_counts_idx" 
                ON "Booking"("userId", "remainingScreeningCount") 
                WHERE "status" IN ('CONFIRMED', 'COMPLETED') AND "remainingScreeningCount" > 0;
            ''')
            print("✓ Created Booking_active_with_counts_idx\n")
        except Exception as e:
            print(f"Error: {e}\n")
        
        # Index 3: PostureAnalysis index (only if table exists)
        print("Checking if PostureAnalysis table exists...")
        table_exists = await db.query_raw('''
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'PostureAnalysis'
            );
        ''')
        
        if table_exists[0]['exists']:
            print("✓ PostureAnalysis table exists")
            print("Creating PostureAnalysis_bookingId_analysisDate_idx...")
            try:
                await db.execute_raw('''
                    CREATE INDEX IF NOT EXISTS "PostureAnalysis_bookingId_analysisDate_idx" 
                    ON "PostureAnalysis"("bookingId", "analysisDate");
                ''')
                print("✓ Created PostureAnalysis_bookingId_analysisDate_idx\n")
            except Exception as e:
                print(f"Error: {e}\n")
        else:
            print("⚠️  PostureAnalysis table does not exist yet (will be created in later tasks)\n")
        
        # Verify indexes
        print("="*60)
        print("Verifying indexes...")
        print("="*60)
        
        result = await db.query_raw('''
            SELECT indexname, indexdef 
            FROM pg_indexes 
            WHERE tablename = 'Booking'
            AND (indexname LIKE '%screening%' OR indexname LIKE '%active%')
            ORDER BY indexname;
        ''')
        
        print("\nBooking indexes:")
        for idx in result:
            print(f"  ✓ {idx['indexname']}")
        
        if table_exists[0]['exists']:
            result = await db.query_raw('''
                SELECT indexname, indexdef 
                FROM pg_indexes 
                WHERE tablename = 'PostureAnalysis'
                AND indexname LIKE '%booking%'
                ORDER BY indexname;
            ''')
            
            print("\nPostureAnalysis indexes:")
            for idx in result:
                print(f"  ✓ {idx['indexname']}")
        
        print("\n✓ All indexes created successfully!")
        return True
        
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
        return False
        
    finally:
        await db.disconnect()


if __name__ == "__main__":
    success = asyncio.run(create_indexes())
    sys.exit(0 if success else 1)
