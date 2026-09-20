#!/usr/bin/env python3
"""
Script to verify that the screening count indexes exist.

This script checks for:
1. Composite index on Booking(userId, remainingScreeningCount)
2. Composite index on PostureAnalysis(bookingId, analysisDate)
3. Partial index on Booking for active bookings with remaining counts

Usage:
    python verify_indexes.py
"""

import asyncio
import sys
from pathlib import Path

# Add the app directory to the path
sys.path.insert(0, str(Path(__file__).parent))

from prisma import Prisma


async def verify_indexes():
    """Verify that all required indexes exist."""
    db = Prisma()
    
    try:
        print("Connecting to database...")
        await db.connect()
        print("✓ Connected to database\n")
        
        # Check all indexes on Booking table
        print("=" * 60)
        print("Booking Table Indexes")
        print("=" * 60)
        
        booking_indexes = await db.query_raw("""
            SELECT 
                indexname, 
                indexdef,
                CASE 
                    WHEN indexdef LIKE '%WHERE%' THEN 'Partial'
                    ELSE 'Full'
                END as index_type
            FROM pg_indexes 
            WHERE tablename = 'Booking'
            ORDER BY indexname;
        """)
        
        required_booking_indexes = [
            "Booking_userId_remainingScreeningCount_idx",
            "Booking_active_with_counts_idx"
        ]
        
        found_indexes = []
        for idx in booking_indexes:
            print(f"\n{idx['indexname']} ({idx['index_type']})")
            print(f"  {idx['indexdef']}")
            if idx['indexname'] in required_booking_indexes:
                found_indexes.append(idx['indexname'])
        
        print("\n" + "-" * 60)
        print("Required Booking Indexes:")
        for req_idx in required_booking_indexes:
            status = "✓" if req_idx in found_indexes else "✗"
            print(f"  {status} {req_idx}")
        
        # Check all indexes on PostureAnalysis table
        print("\n" + "=" * 60)
        print("PostureAnalysis Table Indexes")
        print("=" * 60)
        
        posture_indexes = await db.query_raw("""
            SELECT 
                indexname, 
                indexdef
            FROM pg_indexes 
            WHERE tablename = 'PostureAnalysis'
            ORDER BY indexname;
        """)
        
        required_posture_indexes = [
            "PostureAnalysis_bookingId_analysisDate_idx"
        ]
        
        found_posture_indexes = []
        for idx in posture_indexes:
            print(f"\n{idx['indexname']}")
            print(f"  {idx['indexdef']}")
            if idx['indexname'] in required_posture_indexes:
                found_posture_indexes.append(idx['indexname'])
        
        print("\n" + "-" * 60)
        print("Required PostureAnalysis Indexes:")
        for req_idx in required_posture_indexes:
            status = "✓" if req_idx in found_posture_indexes else "✗"
            print(f"  {status} {req_idx}")
        
        # Summary
        print("\n" + "=" * 60)
        print("Summary")
        print("=" * 60)
        
        all_required = required_booking_indexes + required_posture_indexes
        all_found = found_indexes + found_posture_indexes
        
        print(f"\nTotal required indexes: {len(all_required)}")
        print(f"Total found indexes: {len(all_found)}")
        
        if len(all_found) == len(all_required):
            print("\n✓ All required indexes exist!")
            return True
        else:
            missing = set(all_required) - set(all_found)
            print(f"\n✗ Missing indexes: {', '.join(missing)}")
            return False
        
    except Exception as e:
        print(f"\n✗ Error verifying indexes: {e}")
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
    print("Screening Count Indexes Verification")
    print("=" * 60)
    print()
    
    success = await verify_indexes()
    
    if success:
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
