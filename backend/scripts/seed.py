"""
Seed script to populate the database with initial categories and services.
This script is idempotent - it can be run multiple times without creating duplicates.
"""
import asyncio
import json
import sys
from pathlib import Path

# Add parent directory to path to import app modules
sys.path.append(str(Path(__file__).parent.parent))

from prisma import Prisma
from prisma.enums import PaymentType


# Categories to seed
CATEGORIES = [
    {
        "name": "Knee Pain & Arthritis",
        "slug": "knee-pain-arthritis",
        "description": "Comprehensive treatment for knee pain and arthritis",
        "status": "ACTIVE"
    },
    {
        "name": "Back Pain, Slip Disc, Sciatica",
        "slug": "back-pain-slip-disc-sciatica",
        "description": "Expert care for back pain, slip disc, and sciatica",
        "status": "ACTIVE"
    },
    {
        "name": "Neck & Shoulder Pain",
        "slug": "neck-shoulder-pain",
        "description": "Specialized treatment for neck and shoulder pain",
        "status": "ACTIVE"
    },
    {
        "name": "Post-Surgery Rehabilitation",
        "slug": "post-surgery-rehabilitation",
        "description": "Professional post-surgery rehabilitation programs",
        "status": "ACTIVE"
    },
    {
        "name": "Stroke & Neurological Recovery",
        "slug": "stroke-neurological-recovery",
        "description": "Comprehensive stroke and neurological recovery programs",
        "status": "ACTIVE"
    },
    {
        "name": "Balance Issues & Fall Risk",
        "slug": "balance-issues-fall-risk",
        "description": "Programs to improve balance and reduce fall risk",
        "status": "ACTIVE"
    },
    {
        "name": "Hip, Ankle & Sports Injuries",
        "slug": "hip-ankle-sports-injuries",
        "description": "Treatment for hip, ankle, and sports-related injuries",
        "status": "COMING_SOON"
    }
]


# Service templates (will be created for each category)
SERVICE_TEMPLATES = [
    {
        "name": "AI Assessment",
        "slug_suffix": "ai-assessment",
        "description": "AI-powered assessment to understand your condition",
        "basePrice": 399.0,
        "salePrice": 399.0,
        "discount": 0.0,
        "paymentType": PaymentType.FULL,
        "duration": "30 minutes",
        "serviceType": "Assessment",
        "features": ["AI-powered analysis", "Instant results", "Personalized recommendations"],
        "deliveryMode": "Online",
        "includedScreeningCount":10,
        "sessionCount": 1
    },
    {
        "name": "Assessment + Expert Consultation",
        "slug_suffix": "assessment-consultation",
        "description": "AI assessment combined with expert consultation",
        "basePrice": 499.0,
        "salePrice": 499.0,
        "discount": 0.0,
        "paymentType": PaymentType.FULL,
        "duration": "45 minutes",
        "serviceType": "Combo",
        "features": ["AI assessment", "Expert consultation", "Treatment plan"],
        "includedScreeningCount":10,
        "deliveryMode": "Online",
        "sessionCount": 1
    },
    {
        "name": "4 Week Program",
        "slug_suffix": "4-week-program",
        "description": "Comprehensive 4-week treatment program with 12 sessions",
        "basePrice": 3999.0,
        "salePrice": 3999.0,
        "discount": 0.0,
        "paymentType": PaymentType.PARTIAL,
        "advancePercent": 25.0,
        "advanceAmount": 999.75,
        "duration": "4 weeks",
        "serviceType": "Program",
        "features": ["12 sessions", "Personalized treatment", "Progress tracking"],
        "includedScreeningCount":10,
        "deliveryMode": "Hybrid",
        "sessionCount": 12
    },
    {
        "name": "8 Week Program",
        "slug_suffix": "8-week-program",
        "description": "Intensive 8-week treatment program with 24 sessions - Best Value",
        "basePrice": 6999.0,
        "salePrice": 6999.0,
        "discount": 0.0,
        "paymentType": PaymentType.PARTIAL,
        "advancePercent": 25.0,
        "advanceAmount": 1749.75,
        "duration": "8 weeks",
        "serviceType": "Program",
        "features": ["24 sessions", "Personalized treatment", "Progress tracking", "Best Value"],
        "includedScreeningCount":10,
        "deliveryMode": "Hybrid",
        "sessionCount": 24
    },
    {
        "name": "12 Week Program",
        "slug_suffix": "12-week-program",
        "description": "Extended 12-week treatment program with 36 sessions",
        "basePrice": 8999.0,
        "salePrice": 8999.0,
        "discount": 0.0,
        "paymentType": PaymentType.PARTIAL,
        "advancePercent": 25.0,
        "advanceAmount": 2249.75,
        "duration": "12 weeks",
        "serviceType": "Program",
        "features": ["36 sessions", "Personalized treatment", "Progress tracking", "Extended support"],
        "includedScreeningCount":10,
        "deliveryMode": "Hybrid",
        "sessionCount": 36
    }
]


async def seed_categories(db: Prisma) -> dict[str, str]:
    """
    Seed categories into the database.
    Returns a mapping of category slugs to their IDs.
    """
    print("Seeding categories...")
    category_map = {}
    
    for category_data in CATEGORIES:
        # Check if category already exists
        existing = await db.category.find_unique(
            where={"slug": category_data["slug"]}
        )
        
        if existing:
            print(f"  ✓ Category '{category_data['name']}' already exists")
            category_map[category_data["slug"]] = existing.id
        else:
            # Create new category
            category = await db.category.create(data=category_data)
            print(f"  + Created category '{category_data['name']}'")
            category_map[category_data["slug"]] = category.id
    
    return category_map


async def seed_services(db: Prisma, category_map: dict[str, str]) -> None:
    """
    Seed services for each category.
    Only creates services for ACTIVE categories.
    """
    print("\nSeeding services...")
    
    for category_data in CATEGORIES:
        # Skip COMING_SOON categories
        if category_data["status"] == "COMING_SOON":
            print(f"  ⊘ Skipping services for '{category_data['name']}' (Coming Soon)")
            continue
        
        category_id = category_map[category_data["slug"]]
        category_slug = category_data["slug"]
        
        print(f"\n  Category: {category_data['name']}")
        
        for service_template in SERVICE_TEMPLATES:
            # Create unique slug for this service
            service_slug = f"{category_slug}-{service_template['slug_suffix']}"
            
            # Check if service already exists
            existing = await db.service.find_unique(
                where={"slug": service_slug}
            )
            
            if existing:
                print(f"    ✓ Service '{service_template['name']}' already exists")
            else:
                # Create service data
                service_data = {
                    "categoryId": category_id,
                    "name": service_template["name"],
                    "slug": service_slug,
                    "description": service_template["description"],
                    "basePrice": service_template["basePrice"],
                    "salePrice": service_template["salePrice"],
                    "discount": service_template["discount"],
                    "paymentType": service_template["paymentType"],
                    "duration": service_template["duration"],
                    "serviceType": service_template["serviceType"],
                    "features": json.dumps(service_template["features"]),
                    "deliveryMode": service_template["deliveryMode"],
                    "sessionCount": service_template["sessionCount"],
                    "includedScreeningCount": service_template["includedScreeningCount"]
                }
                
                # Add advance payment fields for PARTIAL payment type
                if service_template["paymentType"] == PaymentType.PARTIAL:
                    service_data["advancePercent"] = service_template["advancePercent"]
                    service_data["advanceAmount"] = service_template["advanceAmount"]
                
                # Create new service
                await db.service.create(data=service_data)
                print(f"    + Created service '{service_template['name']}'")


async def main():
    """
    Main function to run the seed script.
    """
    print("=" * 60)
    print("Starting database seed...")
    print("=" * 60)
    
    db = Prisma()
    
    try:
        # Connect to database
        await db.connect()
        print("✓ Connected to database\n")
        
        # Seed categories
        category_map = await seed_categories(db)
        
        # Seed services
        await seed_services(db, category_map)
        
        print("\n" + "=" * 60)
        print("✓ Database seeding completed successfully!")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n✗ Error during seeding: {e}")
        raise
    finally:
        # Disconnect from database
        await db.disconnect()
        print("\n✓ Disconnected from database")


if __name__ == "__main__":
    asyncio.run(main())
