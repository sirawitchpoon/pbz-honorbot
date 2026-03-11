# Security Audit Report - HonorBot PBZ

**Date:** January 2025  
**Auditor:** Automated Security Analysis  
**Version:** 1.0.0

## Executive Summary

This security audit identified **8 critical and medium-risk vulnerabilities** across authentication, input validation, XSS prevention, CSRF protection, and rate limiting. While the application uses Mongoose (which provides NoSQL injection protection) and has basic authentication, several areas need immediate attention.

---

## 🔴 CRITICAL VULNERABILITIES

### 1. **Cross-Site Scripting (XSS) - High Risk**

**Location:** `src/dashboard/public/index.html` (Lines 290-328)

**Issue:**

- User data (`userId`, `honorPoints`, `dailyStreak`) is directly inserted into HTML via template literals without proper escaping
- While `username` is escaped, numeric values and `userId` are not
- Potential XSS if data contains malicious content

**Vulnerable Code:**

```javascript
row.innerHTML = `
    <td>${user.userId}</td>  // ❌ Not escaped
    <td>${user.honorPoints}</td>  // ❌ Not escaped
    onclick="openEditModal('${user.userId}', ...)"  // ❌ Direct injection
`;
```

**Risk:** An attacker could inject malicious JavaScript if they control data in the database.

**Fix:**

```javascript
// Always escape all user input
row.innerHTML = `
    <td>${escapeHtml(String(user.userId))}</td>
    <td>${escapeHtml(String(user.honorPoints))}</td>
    onclick="openEditModal('${escapeHtml(String(user.userId))}', ...)"
`;
```

---

### 2. **Weak Authentication - Critical**

**Location:** `src/dashboard/server.ts` (Lines 30-32, 35, 221)

**Issues:**

1. **Default weak password:** Falls back to `'password'` if `WEB_PASS` is not set
2. **Password logged to console:** Credentials are logged in plain text (line 221)
3. **No password complexity requirements**
4. **Basic Auth over HTTP:** If not using HTTPS, credentials are transmitted in base64 (easily decoded)

**Vulnerable Code:**

```typescript
const webPass = process.env.WEB_PASS || "password"; // ❌ Weak default
console.log(`Default credentials: ${webUser} / ${webPass}`); // ❌ Password in logs
```

**Risk:** Credentials can be compromised if logs are exposed or if default password is used.

**Fix:**

- Remove password from console logs
- Require `WEB_PASS` to be set (throw error if not)
- Add password complexity validation
- Document HTTPS requirement

---

### 3. **No Rate Limiting - High Risk**

**Location:** `src/dashboard/server.ts` (All API endpoints)

**Issue:**

- No rate limiting on any API endpoints
- Attackers can perform brute-force attacks, spam requests, or DoS the dashboard

**Risk:**

- Brute-force attacks on Basic Auth
- DoS attacks on API endpoints
- Resource exhaustion

**Fix:**
Install and configure `express-rate-limit`:

```typescript
import rateLimit from "express-rate-limit";

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
});

app.use("/api/", apiLimiter);

// Stricter limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 attempts per 15 minutes
});
```

---

### 4. **No CSRF Protection - High Risk**

**Location:** `src/dashboard/server.ts` (POST endpoints)

**Issue:**

- No CSRF tokens on POST requests (`/api/user/:id/points`, `/api/user/:id/reset-streak`)
- Basic Auth alone doesn't protect against CSRF attacks

**Risk:** An attacker could trick an authenticated admin into making unwanted changes via a malicious website.

**Fix:**
Install `csurf` or use SameSite cookies:

```typescript
import csrf from "csurf";
const csrfProtection = csrf({ cookie: true });

app.use(csrfProtection);

// Add CSRF token to responses
app.get("/", (req, res) => {
  res.cookie("XSRF-TOKEN", req.csrfToken());
  // ... rest of code
});
```

---

## 🟡 MEDIUM-RISK VULNERABILITIES

### 5. **Input Validation Missing - Medium Risk**

**Location:** `src/dashboard/server.ts` (Lines 112, 167)

**Issue:**

- `userId` from URL params (`req.params.id`) is used directly in MongoDB queries without validation
- Should validate Discord snowflake format (17-19 digits)
- No check for injection attempts

**Vulnerable Code:**

```typescript
const userId = req.params.id; // ❌ No validation
const user = await User.findOneAndUpdate({ userId }, ...);
```

**Risk:** While Mongoose protects against NoSQL injection, invalid input could cause errors or unexpected behavior.

**Fix:**

```typescript
const userId = req.params.id;

// Validate Discord snowflake format
if (!/^\d{17,19}$/.test(userId)) {
  return res.status(400).json({
    success: false,
    error: 'Invalid user ID format'
  });
}

const user = await User.findOneAndUpdate({ userId }, ...);
```

---

### 6. **CORS Misconfiguration - Medium Risk**

**Location:** `src/dashboard/server.ts` (Line 25)

**Issue:**

- CORS enabled for all origins (`cors()` with no options)
- Allows any website to make requests to the API

**Risk:** If an XSS vulnerability exists elsewhere, this allows cross-origin attacks.

**Fix:**

```typescript
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN || "http://localhost:3000",
    credentials: true,
  })
);
```

---

### 7. **Error Information Disclosure - Medium Risk**

**Location:** Multiple files

**Issue:**

- Error messages in API responses may reveal internal structure
- Stack traces not filtered in production
- File paths exposed in error logs

**Risk:** Attackers can learn about the application structure and potential attack vectors.

**Fix:**

```typescript
// In production, don't expose detailed errors
const isDevelopment = process.env.NODE_ENV !== "production";

res.status(500).json({
  success: false,
  error: isDevelopment
    ? error.message
    : "An internal error occurred. Please contact an administrator.",
});
```

---

### 8. **Backup Import Validation - Medium Risk**

**Location:** `src/services/BackupService.ts` (Lines 60-93)

**Issues:**

1. JSON parsing doesn't validate array size limits
2. No validation of field lengths (username, userId could be extremely long)
3. No protection against deeply nested JSON (potential DoS)
4. `userId` validation only checks existence, not format

**Risk:**

- DoS via extremely large backups
- Data corruption from malformed data
- Potential injection if userId format is wrong

**Fix:**

```typescript
// Add limits
if (userData.length > 100000) {
  throw new Error("Backup file too large. Maximum 100,000 records.");
}

// Validate userId format
if (!/^\d{17,19}$/.test(user.userId)) {
  console.warn(`[BackupService] Invalid userId format: ${user.userId}`);
  errors++;
  return null;
}

// Validate string lengths
if (user.username && user.username.length > 100) {
  user.username = user.username.substring(0, 100);
}
```

---

## 🟢 LOW-RISK / BEST PRACTICES

### 9. **Path Traversal Protection**

**Location:** `src/dashboard/server.ts` (Line 57)

**Status:** ✅ **SAFE** - Using `join(__dirname, 'public')` prevents path traversal, but could add explicit validation.

**Recommendation:** Add explicit check:

```typescript
const indexPath = join(publicPath, "index.html");
if (!indexPath.startsWith(publicPath)) {
  throw new Error("Invalid path");
}
```

### 10. **NoSQL Injection Protection**

**Status:** ✅ **PROTECTED** - Using Mongoose with parameterized queries provides protection. However, ensure all user input is validated before queries.

### 11. **Secrets Management**

**Status:** ⚠️ **NEEDS IMPROVEMENT**

- `.env` file is properly gitignored ✅
- But no validation that required env vars are set
- Consider using a secrets manager for production

---

## 📋 SUMMARY OF REQUIRED FIXES

### Priority 1 (Critical - Fix Immediately):

1. ✅ **FIXED** - XSS vulnerabilities in HTML template (removed inline onclick, added proper escaping)
2. ✅ **FIXED** - Removed password from console logs
3. ✅ **FIXED** - Added rate limiting to API endpoints (express-rate-limit installed)
4. ⚠️ **PARTIAL** - CSRF protection recommended (requires additional package: `csurf` or use SameSite cookies)

### Priority 2 (High - Fix Soon):

5. ✅ **FIXED** - Validated and sanitized all user inputs (userId format, numeric bounds)
6. ✅ **FIXED** - Configured CORS properly (origin restriction)
7. ✅ **FIXED** - Added error message sanitization (production mode)

### Priority 3 (Medium - Fix When Possible):

8. ✅ **FIXED** - Improved backup import validation (array size limits, userId format, string lengths, date validation)
9. ✅ **FIXED** - Added path traversal explicit checks
10. ✅ **FIXED** - Added environment variable validation (WEB_PASS requirement)

---

## ✅ IMPLEMENTED FIXES

### 1. XSS Protection ✅

- Removed inline `onclick` handlers
- Implemented event delegation with data attributes
- All user data properly escaped before insertion into HTML
- Added HTML escaping for all numeric and string values

### 2. Authentication Security ✅

- Removed password from console logs
- Added validation to require WEB_PASS in production
- Warning messages for weak/default passwords
- Security headers added (X-Content-Type-Options, X-Frame-Options)

### 3. Rate Limiting ✅

- General API rate limiter: 100 requests per 15 minutes
- Write operation limiter: 50 requests per 15 minutes
- Applied to all API endpoints
- Standard rate limit headers included

### 4. Input Validation ✅

- userId validated for Discord snowflake format (17-19 digits)
- Numeric values validated for type, bounds, and safe integer range
- String lengths limited to prevent DoS
- Date validation with error handling

### 5. CORS Security ✅

- Restricted to specific origin (configurable via ALLOWED_ORIGIN)
- Credentials enabled only for allowed origin

### 6. Error Message Sanitization ✅

- Development mode: Detailed error messages
- Production mode: Generic error messages
- No stack traces exposed to clients

### 7. Backup Import Security ✅

- Maximum record limit (100,000)
- userId format validation
- Username length limits
- Numeric field validation and bounds checking
- Date validation with try-catch

### 8. Path Traversal Protection ✅

- Explicit path resolution and comparison
- Validates resolved path stays within public directory
- Returns 403 Forbidden on traversal attempts

---

## 🔒 SECURITY BEST PRACTICES RECOMMENDATIONS

1. **Always use HTTPS in production** - Basic Auth credentials are transmitted in base64
2. **Implement session management** - Consider replacing Basic Auth with JWT or sessions
3. **Add security headers** - Use `helmet` middleware:
   ```typescript
   import helmet from "helmet";
   app.use(helmet());
   ```
4. **Regular dependency audits** - Run `npm audit` regularly
5. **Input validation library** - Use `joi` or `zod` for schema validation
6. **Logging** - Use a proper logging library that can redact sensitive data
7. **Monitoring** - Add security monitoring and alerting

---

## ✅ GOOD SECURITY PRACTICES FOUND

1. ✅ Mongoose usage (NoSQL injection protection)
2. ✅ Basic Auth middleware order (protects all routes)
3. ✅ Authentication checks in Discord commands
4. ✅ File type validation for backups
5. ✅ File size limits
6. ✅ `.env` file properly gitignored
7. ✅ Input validation for numeric values
8. ✅ HTML escaping function exists and is used for usernames

---

**Next Steps:**

1. Review and prioritize fixes based on your deployment environment
2. Implement fixes starting with Critical vulnerabilities
3. Test all changes thoroughly
4. Re-audit after fixes are implemented
