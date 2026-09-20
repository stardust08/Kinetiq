"""
Verification script to check seeded data in the database.
"""
import asyncio
import sys
from pathlib import Path

# Add parent directory to path to import app modules
sys.path.append(str(Path(__file__).parent.parent))

from prisma import Prisma


async def verify_data():
    """
    Verify the seeded data in the database.
    """
    print("=" * 60)
    print("Verifying seeded data...")
    print("=" * 60)
    
    db = Prisma()
    
    try:
        # Connect to database
        await db.connect()
        print("✓ Connected to database\n")
        
        # Count categories
        categories = await db.category.find_many()
        print(f"Categories: {len(categories)} found")
        for cat in categories:
            print(f"  - {cat.name} ({cat.slug}) - Status: {cat.status}")
        
        # Count services
        services = await db.service.find_many(
            include={"category": True}
        )
        print(f"\nServices: {len(services)} found")
        
        # Group services by category
        services_by_category = {}
        for service in services:
            cat_name = service.category.name if service.category else "Unknown"
            if cat_name not in services_by_category:
                services_by_category[cat_name] = []
            services_by_category[cat_name].append(service)
        
        # Display services by category
        for cat_name, cat_services in services_by_category.items():
            print(f"\n  {cat_name}: {len(cat_services)} services")
            for service in cat_services:
                payment_info = f"{service.paymentType}"
                if service.paymentType == "PARTIAL":
                    payment_info += f" ({service.advancePercent}% advance = ₹{service.advanceAmount})"
                print(f"    - {service.name}: ₹{service.basePrice} ({payment_info})")
        
        print("\n" + "=" * 60)
        print("✓ Verification completed!")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n✗ Error during verification: {e}")
        raise
    finally:
        # Disconnect from database
        await db.disconnect()
        print("\n✓ Disconnected from database")


if __name__ == "__main__":
    asyncio.run(verify_data())
