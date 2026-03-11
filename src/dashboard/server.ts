import express, { Request, Response } from 'express';
import basicAuth from 'express-basic-auth';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { join, resolve } from 'path';
import { readFileSync } from 'fs';
import { User } from '../models/User';
import { LeaderboardService } from '../services/LeaderboardService';
import mongoose from 'mongoose';
import { MONGODB_CONNECTED } from '../utils/connectDB';

// Store leaderboard service instance (will be set by index.ts)
let leaderboardServiceInstance: LeaderboardService | null = null;

export function startDashboard(leaderboardService?: LeaderboardService): void {
  // Store the leaderboard service instance for use in API endpoints
  if (leaderboardService) {
    leaderboardServiceInstance = leaderboardService;
    console.log('[Dashboard] LeaderboardService instance registered for manual updates');
  } else {
    console.log('[Dashboard] LeaderboardService not provided - manual updates will be unavailable');
  }
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Middleware Order (CRITICAL for security):
  // 1. CORS (configured with origin restriction)
  // Allow multiple origins or use function for dynamic origin matching
  const allowedOrigins = process.env.ALLOWED_ORIGIN 
    ? process.env.ALLOWED_ORIGIN.split(',').map(o => o.trim())
    : ['http://localhost:3000'];
  
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, Postman, or same-origin requests)
      if (!origin) {
        console.log('[Dashboard] CORS: Allowing request with no origin (same-origin or tool request)');
        return callback(null, true);
      }
      
      console.log(`[Dashboard] CORS: Checking origin: ${origin}`);
      
      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        console.log(`[Dashboard] CORS: Origin ${origin} is in allowed list`);
        callback(null, true);
      } else {
        // Allow localhost and IP addresses for development (or if ALLOWED_ORIGIN not strictly set)
        const isLocalhost = origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1');
        const isIPAddress = /^http:\/\/\d+\.\d+\.\d+\.\d+(:\d+)?$/.test(origin);
        
        if (isLocalhost || isIPAddress) {
          // Log a warning but allow it (useful for development and IP-based deployments)
          console.warn(`[Dashboard] CORS: Allowing IP/localhost origin: ${origin} (not in ALLOWED_ORIGIN list)`);
          callback(null, true);
        } else {
          console.error(`[Dashboard] CORS: Blocked request from origin: ${origin}`);
          console.error(`[Dashboard] CORS: Allowed origins: ${allowedOrigins.join(', ')}`);
          callback(new Error(`Not allowed by CORS. Origin ${origin} not in allowed list.`));
        }
      }
    },
    credentials: true,
    optionsSuccessStatus: 200
  }));
  
  // 2. Rate limiting (protect against brute force and DoS)
  // General API rate limiter
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Stricter rate limiter for write operations (POST requests)
  const writeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // Limit to 50 write operations per 15 minutes
    message: 'Too many write requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Apply general rate limiting to all API routes
  app.use('/api/', apiLimiter);
  
  // 3. JSON body parser (must be before auth)
  app.use(express.json({ limit: '10mb' })); // Limit JSON payload size

  // 4. Basic Auth configuration
  const webUser = process.env.WEB_USER || 'admin';
  const webPass = process.env.WEB_PASS;

  // Security: Require password to be set, no weak defaults
  if (!webPass || webPass === 'password') {
    console.error('[Dashboard] ⚠️ SECURITY WARNING: WEB_PASS is not set or using default value!');
    console.error('[Dashboard] Please set WEB_PASS in your .env file with a strong password.');
    if (process.env.NODE_ENV === 'production') {
      throw new Error('WEB_PASS must be set in production environment');
    }
  }

  // Verification log - confirm auth loaded correctly (never log password)
  console.log('🔒 Basic Auth enabled for user:', webUser);

  const authMiddleware = basicAuth({
    users: { [webUser]: webPass || 'password' }, // Fallback only for dev mode
    challenge: true, // Important: triggers browser login popup
    realm: 'Admin Panel',
    unauthorizedResponse: (req: Request) => {
      return 'Unauthorized. Please provide valid credentials.';
    },
  });

  // CRITICAL: Apply auth middleware BEFORE static files and API routes
  // This ensures ALL requests (including static files) require authentication
  app.use(authMiddleware);

  // 5. Define API routes FIRST (before static files) to ensure they're matched correctly
  // API Endpoint: Get leaderboard (top 50 users) - Read-only
  app.get('/api/leaderboard', async (req: Request, res: Response) => {
    try {
      console.log('[Dashboard] GET /api/leaderboard - Request received');
      
      // Check MongoDB connection
      if (mongoose.connection.readyState !== MONGODB_CONNECTED) {
        console.error('[Dashboard] MongoDB not connected. Connection state:', mongoose.connection.readyState);
        return res.status(503).json({
          success: false,
          error: 'Database connection not available. Please check MongoDB connection.',
        });
      }
      
      const topUsers = await User.find({})
        .sort({ honorPoints: -1 })
        .limit(50)
        .select('userId username honorPoints dailyCheckinStreak lastDailyReset')
        .lean();

      console.log(`[Dashboard] Found ${topUsers.length} users in database`);

      // Calculate today's UTC date for check-in status
      const nowUTC = new Date();
      const todayUTC = new Date(Date.UTC(nowUTC.getUTCFullYear(), nowUTC.getUTCMonth(), nowUTC.getUTCDate()));

      // Transform data for frontend
      const leaderboard = topUsers.map((user, index) => {
        // Calculate daily check-in status
        let dailyCheckinStatus = '⏳ Available';
        if (user.lastDailyReset) {
          const lastResetDateUTC = new Date(user.lastDailyReset);
          const lastResetUTC = new Date(Date.UTC(
            lastResetDateUTC.getUTCFullYear(),
            lastResetDateUTC.getUTCMonth(),
            lastResetDateUTC.getUTCDate()
          ));
          if (user.lastDailyReset.getTime() !== 0 && todayUTC.getTime() === lastResetUTC.getTime()) {
            dailyCheckinStatus = '✅ Claimed';
          }
        }

        return {
          rank: index + 1,
          userId: user.userId,
          username: user.username,
          honorPoints: user.honorPoints || 0,
          dailyStreak: user.dailyCheckinStreak || 0,
          dailyCheckinStatus: dailyCheckinStatus,
        };
      });

      console.log(`[Dashboard] Returning leaderboard with ${leaderboard.length} entries`);

      res.json({
        success: true,
        data: leaderboard,
        lastUpdated: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[Dashboard] Error fetching leaderboard:', error);
      if (error instanceof Error) {
        console.error('[Dashboard] Error message:', error.message);
        console.error('[Dashboard] Error stack:', error.stack);
      }
      const isDevelopment = process.env.NODE_ENV !== 'production';
      res.status(500).json({
        success: false,
        error: isDevelopment 
          ? (error instanceof Error ? error.message : 'Failed to fetch leaderboard data')
          : 'Failed to fetch leaderboard data',
      });
    }
  });

  // API Endpoint: Refresh Discord leaderboard message (e.g. after database restore)
  app.post('/api/leaderboard/refresh', writeLimiter, async (req: Request, res: Response) => {
    try {
      if (!leaderboardServiceInstance) {
        return res.status(503).json({
          success: false,
          error: 'LeaderboardService not available.',
        });
      }
      console.log('[Dashboard] POST /api/leaderboard/refresh - Forcing Discord leaderboard update...');
      const ok = await leaderboardServiceInstance.forceUpdate();
      if (ok) {
        return res.json({ success: true, message: 'Leaderboard updated in Discord.' });
      }
      return res.status(500).json({
        success: false,
        error: 'Leaderboard update failed. Check bot logs.',
      });
    } catch (error) {
      console.error('[Dashboard] Error refreshing leaderboard:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to refresh leaderboard',
      });
    }
  });

  // API Endpoint: Update user's honor points (Admin only)
  // SECURITY: Apply stricter rate limiting to write operations
  app.post('/api/user/:id/points', writeLimiter, async (req: Request, res: Response) => {
    try {
      const userId = req.params.id;
      const { points } = req.body;

      // SECURITY: Validate userId format (Discord snowflake: 17-19 digits)
      if (!userId || !/^\d{17,19}$/.test(userId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid user ID format. Must be a valid Discord snowflake (17-19 digits).',
        });
      }

      // SECURITY: Validate and sanitize points value
      if (typeof points !== 'number' || !Number.isFinite(points) || points < 0 || points > Number.MAX_SAFE_INTEGER) {
        return res.status(400).json({
          success: false,
          error: 'Invalid points value. Must be a non-negative number within safe integer range.',
        });
      }

      const user = await User.findOneAndUpdate(
        { userId },
        { honorPoints: Math.floor(points) }, // Ensure integer
        { new: true, upsert: false }
      );

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
        });
      }

      // Trigger leaderboard update after points change
      if (leaderboardServiceInstance) {
        console.log('[Dashboard] Points updated, triggering leaderboard refresh...');
        leaderboardServiceInstance.triggerUpdate().catch((error) => {
          console.error('[Dashboard] Error triggering leaderboard update:', error);
          // Don't fail the request if leaderboard update fails
        });
      } else {
        console.warn('[Dashboard] LeaderboardService not available, skipping leaderboard update');
      }

      res.json({
        success: true,
        message: 'User points updated successfully',
        data: {
          userId: user.userId,
          username: user.username,
          honorPoints: user.honorPoints,
        },
      });
    } catch (error) {
      console.error('[Dashboard] Error updating user points:', error);
      const isDevelopment = process.env.NODE_ENV !== 'production';
      res.status(500).json({
        success: false,
        error: isDevelopment
          ? (error instanceof Error ? error.message : 'Failed to update user points')
          : 'Failed to update user points',
      });
    }
  });

  // API Endpoint: Reset user's streak (Admin only)
  // SECURITY: Apply stricter rate limiting to write operations
  app.post('/api/user/:id/reset-streak', writeLimiter, async (req: Request, res: Response) => {
    try {
      const userId = req.params.id;

      // SECURITY: Validate userId format (Discord snowflake: 17-19 digits)
      if (!userId || !/^\d{17,19}$/.test(userId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid user ID format. Must be a valid Discord snowflake (17-19 digits).',
        });
      }

      const user = await User.findOneAndUpdate(
        { userId },
        {
          dailyCheckinStreak: 0,
          lastCheckinDate: new Date(0),
          lastDailyReset: new Date(0),
        },
        { new: true, upsert: false }
      );

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
        });
      }

      // Trigger leaderboard update after streak reset (user might change rank)
      if (leaderboardServiceInstance) {
        console.log('[Dashboard] Streak reset, triggering leaderboard refresh...');
        leaderboardServiceInstance.triggerUpdate().catch((error) => {
          console.error('[Dashboard] Error triggering leaderboard update:', error);
          // Don't fail the request if leaderboard update fails
        });
      }

      res.json({
        success: true,
        message: 'User streak reset successfully',
        data: {
          userId: user.userId,
          username: user.username,
          dailyCheckinStreak: user.dailyCheckinStreak,
        },
      });
    } catch (error) {
      console.error('[Dashboard] Error resetting user streak:', error);
      const isDevelopment = process.env.NODE_ENV !== 'production';
      res.status(500).json({
        success: false,
        error: isDevelopment
          ? (error instanceof Error ? error.message : 'Failed to reset user streak')
          : 'Failed to reset user streak',
      });
    }
  });

  // Health check endpoint (protected)
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // 6. Serve static files from public directory (AFTER API routes)
  // Dynamic path: works in both dev (ts-node: src/dashboard/) and prod (node: dist/dashboard/)
  const publicPath = join(__dirname, 'public');
  console.log(`[Dashboard] Serving static files from: ${publicPath}`);
  
  // Explicitly serve index.html with no caching to ensure updates are always reflected
  app.get('/', (req: Request, res: Response) => {
    try {
      // SECURITY: Path traversal protection - ensure path is within public directory
      const indexPath = join(publicPath, 'index.html');
      const resolvedPath = resolve(indexPath);
      const resolvedPublicPath = resolve(publicPath);
      
      if (!resolvedPath.startsWith(resolvedPublicPath)) {
        console.error('[Dashboard] SECURITY: Path traversal attempt detected');
        return res.status(403).send('Forbidden: Invalid path');
      }

      const html = readFileSync(indexPath, 'utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('X-Content-Type-Options', 'nosniff'); // Security header
      res.setHeader('X-Frame-Options', 'DENY'); // Prevent clickjacking
      res.send(html);
    } catch (error) {
      console.error('[Dashboard] Error serving index.html:', error);
      res.status(500).send('Internal Server Error');
    }
  });
  
  // Serve other static files (CSS, JS, images, etc.)
  app.use(express.static(publicPath, {
    setHeaders: (res, path) => {
      // Apply no-cache headers to all static files to prevent browser caching issues
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }));

  // Start server
  app.listen(PORT, () => {
    console.log(`[Dashboard] Admin Panel running on http://localhost:${PORT}`);
    // SECURITY: Never log passwords in production
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Dashboard] Username: ${webUser}`);
    } else {
      console.log(`[Dashboard] Basic Auth enabled for user: ${webUser}`);
    }
  });
}
