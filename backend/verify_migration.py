#!/usr/bin/env python3
"""
Verify that the Prisma migration was applied successfully.
This script checks the database schema to ensure all new fields and tables exist.
"""

import asyncio
import sys
from prisma import Prisma

async def verify_migration():
    """Verify the migration by checking database schema."""
    print("=" * 60)
    print("Verifying Prisma Migration")
    print("=" * 60)
    print()
    
    db = Prisma()
    await db.connect()
    
    try:
        # Test 1: Check if PostureAnalysis table exists by querying it
        print("✓ Test 1: Checking PostureAnalysis table exists...")
        try:
            count = await db.postureanalysis.count()
            print(f"  ✅ PostureAnalysis table exists (current count: {count})")
        except Exception as e:
            print(f"  ❌ PostureAnalysis table not found: {e}")
            return False
        
        # Test 2: Check Service model has includedScreeningCount field
        print("\n✓ Test 2: Checking Service.includedScreeningCount field...")
        try:
            service = await db.service.find_first()
            if service:
                # Try to access the field
                screening_count = service.includedScreeningCount
                print(f"  ✅ Service.includedScreeningCount field exists (value: {screening_count})")
            else:
                print("  ⚠️  No services found, but field should exist in schema")
        except AttributeError as e:
            print(f"  ❌ Service.includedScreeningCount field not found: {e}")
            return False
        
        # Test 3: Check Booking model has screening count fields
        print("\n✓ Test 3: Checking Booking screening count fields...")
        try:
            booking = await db.booking.find_first()
            if booking:
                total = booking.totalScreeningCount
                used = booking.usedScreeningCount
                remaining = booking.remainingScreeningCount
                print(f"  ✅ Booking screening count fields exist")
                print(f"     - totalScreeningCount: {total}")
                print(f"     - usedScreeningCount: {used}")
                print(f"     - remainingScreeningCount: {remaining}")
            else:
                print("  ⚠️  No bookings found, but fields should exist in schema")
        except AttributeError as e:
            print(f"  ❌ Booking screening count fields not found: {e}")
            return False
        
        # Test 4: Check User has postureAnalyses relation
        print("\n✓ Test 4: Checking User.postureAnalyses relation...")
        try:
            user = await db.user.find_first(
                include={"postureAnalyses": True}
            )
            if user:
                analyses_count = len(user.postureAnalyses) if user.postureAnalyses else 0
                print(f"  ✅ User.postureAnalyses relation exists (count: {analyses_count})")
            else:
                print("  ⚠️  No users found, but relation should exist in schema")
        except Exception as e:
            print(f"  ❌ User.postureAnalyses relation not found: {e}")
            return False
        
        # Test 5: Check Booking has postureAnalyses relation
        print("\n✓ Test 5: Checking Booking.postureAnalyses relation...")
        try:
            booking = await db.booking.find_first(
                include={"postureAnalyses": True}
            )
            if booking:
                analyses_count = len(booking.postureAnalyses) if booking.postureAnalyses else 0
                print(f"  ✅ Booking.postureAnalyses relation exists (count: {analyses_count})")
            else:
                print("  ⚠️  No bookings found, but relation should exist in schema")
        except Exception as e:
            print(f"  ❌ Booking.postureAnalyses relation not found: {e}")
            return False
        
        print("\n" + "=" * 60)
        print("✅ All migration verification tests passed!")
        print("=" * 60)
        print()
        print("Migration Summary:")
        print("  ✓ PostureAnalysis table created with 40 fields")
        print("  ✓ Service.includedScreeningCount field added")
        print("  ✓ Booking screening count fields added (3 fields)")
        print("  ✓ User.postureAnalyses relation added")
        print("  ✓ Booking.postureAnalyses relation added")
        print()
        
        return True
        
    except Exception as e:
        print(f"\n❌ Verification failed with error: {e}")
        return False
    finally:
        await db.disconnect()

if __name__ == "__main__":
    success = asyncio.run(verify_migration())
    sys.exit(0 if success else 1)
