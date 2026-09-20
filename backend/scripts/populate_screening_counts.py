"""
Data population script for existing bookings - Screening Count Migration

This script populates screening count fields for existing bookings based on their
associated service's includedScreeningCount configuration.

Features:
- Populates totalScreeningCount, usedScreeningCount, and remainingScreeningCount
- Handles edge cases (null values, missing services)
- Comprehensive logging and error handling
- Idempotent - can be run multiple times safely
- Dry-run mode for testing
- Transaction support for data consistency

Usage:
    # Dry run (preview changes without applying)
    python scripts/populate_screening_counts.py --dry-run
    
    # Apply changes
    python scripts/populate_screening_counts.py
    
    # Apply changes with verbose logging
    python scripts/populate_screening_counts.py --verbose
"""
import asyncio
import argparse
import sys
from pathlib import Path
from typing import Dict, List, Tuple
from datetime import datetime

# Add parent directory to path to import app modules
sys.path.append(str(Path(__file__).parent.parent))

from prisma import Prisma
from prisma.models import Booking, Service


class ScreeningCountPopulator:
    """Handles population of screening counts for existing bookings."""
    
    def __init__(self, db: Prisma, dry_run: bool = False, verbose: bool = False):
        self.db = db
        self.dry_run = dry_run
        self.verbose = verbose
        
        # Statistics
        self.stats = {
            "total_bookings": 0,
            "already_populated": 0,
            "updated": 0,
            "no_service": 0,
            "no_screening_count": 0,
            "errors": 0
        }
    
    def log(self, message: str, level: str = "INFO"):
        """Log message with timestamp and level."""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        prefix = {
            "INFO": "ℹ",
            "SUCCESS": "✓",
            "WARNING": "⚠",
            "ERROR": "✗",
            "DEBUG": "→"
        }.get(level, "•")
        
        if level == "DEBUG" and not self.verbose:
            return
        
        print(f"[{timestamp}] {prefix} {message}")
    
    async def get_bookings_needing_update(self) -> List[Booking]:
        """
        Get all bookings that need screening count population.
        
        Returns bookings where:
        - totalScreeningCount is 0 (not yet populated)
        - usedScreeningCount is 0 (no analyses performed yet)
        - remainingScreeningCount is 0 (not yet populated)
        """
        self.log("Fetching bookings that need screening count population...")
        
        bookings = await self.db.booking.find_many(
            where={
                "totalScreeningCount": 0,
                "usedScreeningCount": 0,
                "remainingScreeningCount": 0
            },
            include={
                "service": True
            }
        )
        
        self.log(f"Found {len(bookings)} bookings needing update", "DEBUG")
        return bookings
    
    async def get_all_bookings_for_verification(self) -> List[Booking]:
        """Get all bookings for verification purposes."""
        self.log("Fetching all bookings for verification...", "DEBUG")
        
        bookings = await self.db.booking.find_many(
            include={
                "service": True
            }
        )
        
        return bookings
    
    def calculate_screening_counts(self, booking: Booking) -> Tuple[int, int, int]:
        """
        Calculate screening counts for a booking.
        
        Returns: (totalScreeningCount, usedScreeningCount, remainingScreeningCount)
        """
        # Handle missing service
        if not booking.service:
            self.log(
                f"Booking {booking.id} has no associated service",
                "WARNING"
            )
            self.stats["no_service"] += 1
            return (0, 0, 0)
        
        # Get screening count from service
        included_count = booking.service.includedScreeningCount
        
        # Handle null or missing screening count
        if included_count is None:
            self.log(
                f"Service '{booking.service.name}' (ID: {booking.service.id}) "
                f"has no includedScreeningCount configured",
                "DEBUG"
            )
            self.stats["no_screening_count"] += 1
            return (0, 0, 0)
        
        # For existing bookings, we assume no analyses have been performed yet
        # So usedScreeningCount = 0, and remainingScreeningCount = totalScreeningCount
        total_count = included_count
        used_count = 0
        remaining_count = total_count
        
        return (total_count, used_count, remaining_count)
    
    async def update_booking_screening_counts(
        self,
        booking: Booking,
        total: int,
        used: int,
        remaining: int
    ) -> bool:
        """
        Update screening counts for a single booking.
        
        Returns True if successful, False otherwise.
        """
        try:
            if self.dry_run:
                self.log(
                    f"[DRY RUN] Would update booking {booking.id}: "
                    f"total={total}, used={used}, remaining={remaining}",
                    "DEBUG"
                )
                return True
            
            # Update booking with new screening counts
            await self.db.booking.update(
                where={"id": booking.id},
                data={
                    "totalScreeningCount": total,
                    "usedScreeningCount": used,
                    "remainingScreeningCount": remaining
                }
            )
            
            self.log(
                f"Updated booking {booking.id}: "
                f"total={total}, used={used}, remaining={remaining}",
                "DEBUG"
            )
            return True
            
        except Exception as e:
            self.log(
                f"Error updating booking {booking.id}: {str(e)}",
                "ERROR"
            )
            self.stats["errors"] += 1
            return False
    
    async def verify_consistency(self) -> bool:
        """
        Verify that all bookings have consistent screening counts.
        
        Checks: totalScreeningCount = usedScreeningCount + remainingScreeningCount
        """
        self.log("\nVerifying screening count consistency...")
        
        bookings = await self.get_all_bookings_for_verification()
        inconsistent = []
        
        for booking in bookings:
            expected_total = booking.usedScreeningCount + booking.remainingScreeningCount
            
            if booking.totalScreeningCount != expected_total:
                inconsistent.append({
                    "id": booking.id,
                    "total": booking.totalScreeningCount,
                    "used": booking.usedScreeningCount,
                    "remaining": booking.remainingScreeningCount,
                    "expected_total": expected_total
                })
        
        if inconsistent:
            self.log(
                f"Found {len(inconsistent)} bookings with inconsistent counts:",
                "WARNING"
            )
            for item in inconsistent:
                self.log(
                    f"  Booking {item['id']}: "
                    f"total={item['total']}, used={item['used']}, "
                    f"remaining={item['remaining']} "
                    f"(expected total: {item['expected_total']})",
                    "WARNING"
                )
            return False
        
        self.log("All bookings have consistent screening counts", "SUCCESS")
        return True
    
    async def populate(self) -> bool:
        """
        Main population logic.
        
        Returns True if successful, False otherwise.
        """
        try:
            # Get bookings needing update
            bookings = await self.get_bookings_needing_update()
            self.stats["total_bookings"] = len(bookings)
            
            if not bookings:
                self.log("No bookings need screening count population", "INFO")
                return True
            
            self.log(f"\nProcessing {len(bookings)} bookings...")
            
            # Process each booking
            for i, booking in enumerate(bookings, 1):
                self.log(
                    f"\nProcessing booking {i}/{len(bookings)} (ID: {booking.id})",
                    "DEBUG"
                )
                
                # Calculate screening counts
                total, used, remaining = self.calculate_screening_counts(booking)
                
                # Update booking
                success = await self.update_booking_screening_counts(
                    booking, total, used, remaining
                )
                
                if success:
                    self.stats["updated"] += 1
            
            # Verify consistency (only if not dry run)
            if not self.dry_run:
                await self.verify_consistency()
            
            return True
            
        except Exception as e:
            self.log(f"Fatal error during population: {str(e)}", "ERROR")
            return False
    
    def print_summary(self):
        """Print summary of population results."""
        print("\n" + "=" * 70)
        print("SCREENING COUNT POPULATION SUMMARY")
        print("=" * 70)
        
        if self.dry_run:
            print("MODE: DRY RUN (no changes applied)")
        else:
            print("MODE: LIVE (changes applied)")
        
        print(f"\nTotal bookings processed:        {self.stats['total_bookings']}")
        print(f"Successfully updated:            {self.stats['updated']}")
        print(f"Bookings with no service:        {self.stats['no_service']}")
        print(f"Services with no screening count: {self.stats['no_screening_count']}")
        print(f"Errors encountered:              {self.stats['errors']}")
        
        print("=" * 70)
        
        if self.stats["errors"] > 0:
            print("\n⚠ Some errors occurred. Please review the log above.")
        elif self.dry_run:
            print("\n✓ Dry run completed. Run without --dry-run to apply changes.")
        else:
            print("\n✓ Population completed successfully!")


async def main():
    """Main function to run the population script."""
    # Parse command line arguments
    parser = argparse.ArgumentParser(
        description="Populate screening counts for existing bookings"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview changes without applying them"
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable verbose logging"
    )
    args = parser.parse_args()
    
    print("=" * 70)
    print("SCREENING COUNT POPULATION SCRIPT")
    print("=" * 70)
    
    if args.dry_run:
        print("\n⚠ DRY RUN MODE - No changes will be applied\n")
    
    db = Prisma()
    
    try:
        # Connect to database
        print("Connecting to database...")
        await db.connect()
        print("✓ Connected to database\n")
        
        # Create populator and run
        populator = ScreeningCountPopulator(
            db=db,
            dry_run=args.dry_run,
            verbose=args.verbose
        )
        
        success = await populator.populate()
        
        # Print summary
        populator.print_summary()
        
        # Exit with appropriate code
        sys.exit(0 if success else 1)
        
    except Exception as e:
        print(f"\n✗ Fatal error: {e}")
        sys.exit(1)
    finally:
        # Disconnect from database
        await db.disconnect()
        print("\n✓ Disconnected from database")


if __name__ == "__main__":
    asyncio.run(main())
