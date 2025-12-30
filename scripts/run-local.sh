#!/bin/bash
# Run services locally without Docker Compose

set -e

echo "🚀 Starting services locally..."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 20+"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker"
    exit 1
fi

# 2. Setup environment
echo -e "${YELLOW}Setting up environment...${NC}"
./scripts/dev-seed.sh

# 3. Start Redis
echo -e "${YELLOW}Starting Redis...${NC}"
docker run -d \
  --name gateway-redis \
  -p 6379:6379 \
  redis:7-alpine \
  redis-server --appendonly yes

# Wait for Redis
echo "Waiting for Redis to be ready..."
sleep 3

# 4. Install dependencies
echo -e "${YELLOW}Installing gateway dependencies...${NC}"
npm install

echo -e "${YELLOW}Installing mock service dependencies...${NC}"
cd mock-service
npm install
cd ..

# 5. Build TypeScript
echo -e "${YELLOW}Building gateway...${NC}"
npm run build

echo -e "${YELLOW}Building mock service...${NC}"
cd mock-service
npm run build
cd ..

echo ""
echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo "Now run these commands in separate terminals:"
echo ""
echo "Terminal 1 (Mock Service):"
echo "  cd mock-service && npm run dev"
echo ""
echo "Terminal 2 (Gateway):"
echo "  npm run dev"
echo ""
echo "Or run in background:"
echo "  cd mock-service && npm run dev &"
echo "  npm run dev"
echo ""
