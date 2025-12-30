#!/bin/bash
# Docker build helper - cleans macOS metadata files first

set -e

echo "🧹 Cleaning macOS metadata files..."
find . -name "._*" -type f -delete

echo "🐳 Starting Docker Compose..."
docker compose up --build "$@"
