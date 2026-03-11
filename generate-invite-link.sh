#!/bin/bash

# Script to generate Discord bot invite link with required permissions

# Load environment variables from .env file
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "❌ Error: .env file not found!"
    exit 1
fi

# Check if CLIENT_ID is set
if [ -z "$CLIENT_ID" ]; then
    echo "❌ Error: CLIENT_ID is not set in .env file!"
    exit 1
fi

echo "Discord Bot Invite Link Generator"
echo "=================================="
echo ""

# Required permissions for the bot:
# - View Channels: 1024
# - Send Messages: 2048
# - Manage Messages: 8192 (for editing button messages)
# - Read Message History: 65536
# - Embed Links: 16384 (for rich embeds)
# - Attach Files: 32768 (for backup files)
# - Use Slash Commands: included in scope=applications.commands

PERMISSIONS=125952  # Sum of all required permissions

# Calculate permissions breakdown
echo "Required Permissions:"
echo "  - View Channels: 1024"
echo "  - Send Messages: 2048"
echo "  - Manage Messages: 8192"
echo "  - Read Message History: 65536"
echo "  - Embed Links: 16384"
echo "  - Attach Files: 32768"
echo "  Total: $PERMISSIONS"
echo ""

# Generate invite URL
INVITE_URL="https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&permissions=${PERMISSIONS}&scope=bot%20applications.commands"

echo "✅ Bot Invite Link Generated:"
echo ""
echo "$INVITE_URL"
echo ""
echo "📋 Copy the link above and open it in your browser to invite the bot to your server."
echo ""
echo "⚠️  Important: After inviting, make sure the bot has the required permissions in each channel:"
echo "   - View Channel"
echo "   - Send Messages"
echo "   - Manage Messages"
echo ""
