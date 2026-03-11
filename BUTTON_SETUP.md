# Button-Based Interaction Setup Guide

## Overview

The bot has been updated to use **button-based interactions** as the primary method for user interactions. Slash commands are now **admin-only** and reserved for backend management.

## Channel Setup

You need to create channels and add their IDs to your `.env` file. Here are the required channels:

### Required Channels

1. **Daily Check-in Channel** (already exists)
   - Environment Variable: `DAILYCHECKING_CHANNEL_ID`
   - Purpose: Daily reward claim button
   - Example: `#📅-daily-checkin`

2. **Hall of Fame Channel** (Leaderboard - already exists)
   - Environment Variable: `LEADERBOARD_CHANNEL_ID`
   - Purpose: Auto-updating leaderboard (updates every 3 minutes)
   - Example: `#hall-of-fame` or `#leaderboard`
   - Note: This channel shows the live leaderboard automatically, no button needed

3. **Profile Channel**
   - Environment Variable: `PROFILE_CHANNEL_ID`
   - Purpose: View user profile button
   - Example: `#profile` or `#my-profile`

4. **Status Channel**
   - Environment Variable: `STATUS_CHANNEL_ID`
   - Purpose: Check status button
   - Example: `#status` or `#my-status`

5. **Gamble Channel**
   - Environment Variable: `GAMBLE_CHANNEL_ID`
   - Purpose: Coin flip game button
   - Example: `#gamble` or `#casino`

6. **Instruction Channel** (NEW - replaces Help)
   - Environment Variable: `INSTRUCTION_CHANNEL_ID`
   - Purpose: Comprehensive guide on how to use all buttons and features
   - Example: `#instruction` or `#guide`
   - Note: This channel shows a detailed guide with instructions for all buttons

## Environment Variables

Add these to your `.env` file:

```env
# Button Channels
DAILYCHECKING_CHANNEL_ID=your_daily_checkin_channel_id
PROFILE_CHANNEL_ID=your_profile_channel_id
STATUS_CHANNEL_ID=your_status_channel_id
GAMBLE_CHANNEL_ID=your_gamble_channel_id

# Leaderboard (Auto-updating, no button needed)
LEADERBOARD_CHANNEL_ID=your_hall_of_fame_channel_id

# Instruction Guide
INSTRUCTION_CHANNEL_ID=your_instruction_channel_id
```

## How to Get Channel IDs

1. Enable Developer Mode in Discord (User Settings → Advanced → Developer Mode)
2. Right-click on the channel
3. Click "Copy ID"
4. Paste the ID into your `.env` file

## Bot Permissions Required

The bot needs these permissions in each channel:
- ✅ View Channel
- ✅ Send Messages
- ✅ Manage Messages (for editing button messages)

## User Commands (Now Blocked)

The following commands are now **blocked for regular users** and will show a message to use buttons instead:
- `/daily` - Use the button in daily-checkin channel
- `/profile` - Use the button in profile channel
- `/status` - Use the button in status channel
- `/leaderboard` - Check the Hall of Fame channel (auto-updating leaderboard)
- `/gamble` - Use the button in gamble channel

**Note:** Admins can still use these commands for testing/management purposes.

## Admin Commands (Still Available)

These commands are **admin-only** and require Administrator permission:
- `/backup export` - Export database backup
- `/backup import` - Import database backup
- `/reset database` - Reset database (with confirmation)

## Button Features

### Profile Button
- Shows user's honor points, rank, daily streak, message progress, and join date
- Updates in real-time with latest data

### Status Button
- Shows current honor points, daily message quota, cooldown status, and daily check-in status

### Hall of Fame (Leaderboard)
- Auto-updates every 3 minutes in the designated channel
- Shows top 10 users with rankings
- Medal emojis for top 3 (🥇🥈🥉)
- No button needed - just view the channel

### Gamble Button
- Opens a modal to input:
  - Choice: "heads" or "tails"
  - Bet Amount: 1-5 points
- Win: Double your bet
- Lose: Lose your bet

### Instruction Channel
- Comprehensive guide showing how to use all buttons
- Explains all features and rules
- Auto-updates with channel mentions
- No button needed - just view the channel

## Setup Steps

1. **Create Channels**
   - Create the required channels mentioned above:
     - Profile channel
     - Status channel
     - Gamble channel
     - Instruction channel (if not exists)
   - Make sure bot has proper permissions

2. **Get Channel IDs**
   - Copy IDs from each channel
   - Add to `.env` file
   - **Note:** `LEADERBOARD_CHANNEL_ID` is for Hall of Fame (auto-updating leaderboard)

3. **Restart Bot**
   - The bot will automatically create button messages in each channel
   - Instruction channel will show comprehensive guide
   - Buttons will auto-update every 3 minutes

4. **Test Buttons**
   - Click each button to verify they work
   - Check Instruction channel for guide
   - Check Hall of Fame channel for auto-updating leaderboard
   - Check that user commands are blocked

## Troubleshooting

### Buttons Not Appearing
- Check that channel IDs are correct in `.env`
- Verify bot has permissions in channels
- Check bot logs for errors
- Restart bot

### Buttons Not Working
- Check MongoDB connection
- Verify bot is online
- Check console logs for errors

### Commands Still Working
- Make sure you've restarted the bot after changes
- Verify the build completed successfully
- Check that you're not an admin (admins can still use commands)

## Notes

- Buttons are persistent and will auto-recreate if deleted
- Button messages update every 3 minutes
- All button interactions are ephemeral (only visible to the user who clicked)
- Gamble uses a modal for input (better UX than command options)
