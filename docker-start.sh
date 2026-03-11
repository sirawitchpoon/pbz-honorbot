#!/bin/bash

# Docker Start Script for HonorBot PBZ
# This script helps you start the bot with Docker Compose

set -e

echo "🐳 Starting HonorBot PBZ with Docker..."
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "Please create a .env file with your configuration."
    exit 1
fi

# Check if MONGO_URI is set correctly for Docker
if grep -q "MONGO_URI=mongodb://127.0.0.1" .env || grep -q "MONGO_URI=mongodb://localhost" .env; then
    echo "⚠️  Warning: MONGO_URI in .env is set for local MongoDB"
    echo "Updating MONGO_URI to use Docker service name..."
    sed -i.bak 's|MONGO_URI=mongodb://127.0.0.1:27017/honorbot|MONGO_URI=mongodb://mongodb:27017/honorbot|' .env
    sed -i.bak 's|MONGO_URI=mongodb://localhost:27017/honorbot|MONGO_URI=mongodb://mongodb:27017/honorbot|' .env
    echo "✓ Updated MONGO_URI to mongodb://mongodb:27017/honorbot"
    echo ""
fi

# Build and start services
echo "📦 Building Docker images..."
docker-compose build

echo ""
echo "🚀 Starting services..."
docker-compose up -d

echo ""
echo "⏳ Waiting for services to be ready..."
sleep 5

# Check if containers are running
if docker-compose ps | grep -q "Up"; then
    echo "✓ Services are running!"
    echo ""
    echo "📋 Container Status:"
    docker-compose ps
    echo ""
    echo "📝 View logs with: docker-compose logs -f"
    echo "📝 View bot logs: docker-compose logs -f app"
    echo "📝 View MongoDB logs: docker-compose logs -f mongodb"
    echo ""
    echo "🔧 Deploy Discord commands: docker-compose exec app npm run deploy:prod"
    echo "🛑 Stop services: docker-compose down"
else
    echo "❌ Error: Services failed to start"
    echo "Check logs with: docker-compose logs"
    exit 1
fi
