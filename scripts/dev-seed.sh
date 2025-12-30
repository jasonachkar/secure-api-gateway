#!/bin/bash
# Development seed script
# Generates JWT keys and prepares development environment

set -e

echo "🔧 Setting up development environment..."

# Create directories
echo "📁 Creating directories..."
mkdir -p keys logs

# Generate JWT keys if they don't exist
if [ ! -f keys/private.pem ] || [ ! -f keys/public.pem ]; then
  echo "🔑 Generating JWT keys (RS256)..."
  openssl genrsa -out keys/private.pem 2048 2>/dev/null
  openssl rsa -in keys/private.pem -pubout -out keys/public.pem 2>/dev/null
  chmod 600 keys/private.pem
  chmod 644 keys/public.pem
  echo "✅ JWT keys generated"
else
  echo "✅ JWT keys already exist"
fi

# Create .env if it doesn't exist
if [ ! -f .env ]; then
  echo "📝 Creating .env file from template..."
  cp .env.example .env

  # Generate random secrets
  COOKIE_SECRET=$(openssl rand -base64 32)
  JWT_SECRET=$(openssl rand -base64 32)

  # Update .env with generated secrets (macOS compatible)
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|COOKIE_SECRET=.*|COOKIE_SECRET=$COOKIE_SECRET|" .env
    sed -i '' "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" .env
    sed -i '' "s|JWT_ALGORITHM=.*|JWT_ALGORITHM=RS256|" .env
  else
    sed -i "s|COOKIE_SECRET=.*|COOKIE_SECRET=$COOKIE_SECRET|" .env
    sed -i "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" .env
    sed -i "s|JWT_ALGORITHM=.*|JWT_ALGORITHM=RS256|" .env
  fi

  echo "✅ .env file created with secure secrets"
else
  echo "✅ .env file already exists"
fi

echo ""
echo "✨ Development environment ready!"
echo ""
echo "Next steps:"
echo "  1. npm install              # Install dependencies"
echo "  2. docker compose up -d     # Start Redis and mock service"
echo "  3. npm run dev              # Start the gateway"
echo ""
echo "Or run everything with Docker Compose:"
echo "  docker compose up --build"
echo ""
echo "Access points:"
echo "  - Gateway:    http://localhost:3000"
echo "  - Swagger UI: http://localhost:3000/docs"
echo "  - Health:     http://localhost:3000/healthz"
echo ""
