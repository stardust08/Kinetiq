#!/bin/bash

# Migration script for Neon branch testing
# This script runs Prisma migrations on a separate Neon branch

echo "=========================================="
echo "Prisma Migration on Neon Branch"
echo "=========================================="
echo ""

# Check if .env.migration exists
if [ ! -f ".env.migration" ]; then
    echo "❌ Error: .env.migration file not found"
    echo "Please create .env.migration with your Neon branch DATABASE_URL"
    exit 1
fi

# Backup current .env
if [ -f ".env" ]; then
    echo "📦 Backing up current .env to .env.backup"
    cp .env .env.backup
fi

# Use migration environment
echo "🔄 Switching to migration environment (.env.migration)"
cp .env.migration .env

# Activate virtual environment
echo "🐍 Activating virtual environment"
source .venv/bin/activate

# Run migration
echo ""
echo "🚀 Running Prisma migration: add_posture_analysis_feature"
echo ""
python -m prisma migrate dev --name add_posture_analysis_feature

MIGRATION_EXIT_CODE=$?

# Restore original .env
if [ -f ".env.backup" ]; then
    echo ""
    echo "♻️  Restoring original .env"
    mv .env.backup .env
fi

echo ""
if [ $MIGRATION_EXIT_CODE -eq 0 ]; then
    echo "✅ Migration completed successfully on branch!"
    echo ""
    echo "Next steps:"
    echo "1. Verify the migration in Neon console"
    echo "2. Test the application with the branch database"
    echo "3. If everything works, apply to main branch"
else
    echo "❌ Migration failed with exit code: $MIGRATION_EXIT_CODE"
    echo "Please check the error messages above"
fi

echo ""
echo "=========================================="
