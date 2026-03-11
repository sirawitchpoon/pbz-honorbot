#!/bin/sh
# ตรวจว่า MongoDB ที่ container ใช้มี users กี่คน (ใช้จาก host)
# Usage: ./scripts/check-db-users.sh   หรือ  docker compose exec mongodb mongosh honorbot --quiet --eval "db.users.countDocuments()"
set -e
echo "Checking honorbot.users count in MongoDB..."
docker compose exec mongodb mongosh honorbot --quiet --eval "print('users count:', db.users.countDocuments())"
