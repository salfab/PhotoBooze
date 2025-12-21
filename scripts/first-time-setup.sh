#!/bin/bash

# First-time setup script for PhotoBooze
# This script sets up everything needed for local development

set -e

echo "🎉 PhotoBooze First-Time Setup"
echo "==============================="
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "❌ Docker is not running. Please start Docker Desktop and try again."
  exit 1
fi

echo "✅ Docker is running"
echo ""

# Check if .env.local exists
if [ -f .env.local ]; then
  echo "⚠️  .env.local already exists, skipping creation"
else
  echo "📝 Starting Supabase to get credentials..."
  npx supabase start
  
  echo ""
  echo "📝 Creating .env.local file..."
  echo "Please copy the SERVICE_ROLE_KEY from the output above and paste it below:"
  read -p "SERVICE_ROLE_KEY: " SERVICE_ROLE_KEY
  
  cat > .env.local << EOF
# Local Supabase
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY

# Session secret
SESSION_SECRET=dev-session-secret-change-in-production-32chars!!

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
EOF

  echo "✅ .env.local created"
fi

echo ""
echo "🗄️  Setting up storage bucket..."
node scripts/dev-setup.mjs

echo ""
echo "✅ Setup complete!"
echo ""
echo "To start the development server:"
echo "  pnpm dev"
echo ""
echo "To access the admin panel:"
echo "  http://localhost:3000/admin"
echo ""
