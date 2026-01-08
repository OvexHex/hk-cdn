// CDN Server Configuration
export interface CDNConfig {
  // Server settings
  port: number;
  host: string;

  // File serving directory - Update this to your actual path
  // Example: '/home/user/Doc/P/alia-birthday-gift/public'
  rootDirectory: string;

  // Cache settings for Cloudflare CDN
  cache: {
    // Static assets (CSS, JS, images, fonts) - Long cache
    staticAssets: number; // in seconds (e.g., 31536000 = 1 year)

    // Media files (audio, video) - Medium cache
    mediaFiles: number; // in seconds (e.g., 2592000 = 30 days)

    // Documents (PDF, etc.) - Short cache
    documents: number; // in seconds (e.g., 86400 = 1 day)

    // Text files - Very short cache
    textFiles: number; // in seconds (e.g., 3600 = 1 hour)
  };

  // Rate limiting settings
  rateLimit: {
    enabled: boolean;
    maxRequests: number; // Max requests per timeWindow
    timeWindow: string; // Time window (e.g., '1 minute', '1 hour')
    allowList: string[]; // IPs to bypass rate limiting
    banDuration: number; // Duration to ban IPs (in milliseconds)
  };

  // Security settings
  security: {
    enabled: boolean;

    // CORS settings
    cors: {
      enabled: boolean;
      origin: string | string[] | boolean; // Allowed origins
      credentials: boolean;
      methods: string[];
      allowedHeaders: string[];
      exposedHeaders: string[];
      maxAge: number;
    };

    // Helmet settings
    helmet: {
      enabled: boolean;
      contentSecurityPolicy: boolean;
      crossOriginEmbedderPolicy: boolean;
    };

    // Allowed file extensions (empty = all allowed)
    allowedExtensions: string[];

    // Blocked file extensions (security)
    blockedExtensions: string[];

    // Max file size in bytes (0 = unlimited)
    maxFileSize: number;

    // Enable HTTPS redirection
    enforceHTTPS: boolean;

    // Trusted proxies (for Cloudflare/Argo Tunnel)
    trustProxy: boolean;
  };

  // Compression settings
  compression: {
    enabled: boolean;
    threshold: number; // Only compress responses larger than this (bytes)
    encodings: string[];
  };

  // Logging
  logging: {
    enabled: boolean;
    level: string; // 'fatal', 'error', 'warn', 'info', 'debug', 'trace'
    prettyPrint: boolean;
  };

  // Health check endpoint
  healthCheck: {
    enabled: boolean;
    path: string;
  };
}

// Default configuration
export const defaultConfig: CDNConfig = {
  port: 3005,
  host: '0.0.0.0',

  // IMPORTANT: Set this to your actual directory path
  rootDirectory: process.env.CDN_ROOT_DIR || './public',

  cache: {
    // 1 year - CSS, JS, images, fonts, icons
    staticAssets: 31536000,

    // 30 days - Audio, video files
    mediaFiles: 2592000,

    // 1 day - PDF, documents
    documents: 86400,

    // 1 hour - Text files, JSON
    textFiles: 3600,
  },

  rateLimit: {
    enabled: true,
    maxRequests: 1000, // 1000 requests per minute per IP
    timeWindow: '1 minute',
    allowList: [],
    banDuration: 60000, // Ban for 1 minute after exceeding limit
  },

  security: {
    enabled: true,
    cors: {
      enabled: true,
      origin: '*', // Allow all origins (configure for production)
      credentials: false,
      methods: ['GET', 'HEAD', 'OPTIONS'],
      allowedHeaders: ['Range', 'If-None-Match', 'If-Modified-Since', 'Cache-Control'],
      exposedHeaders: ['Content-Length', 'Content-Type', 'Content-Range', 'Accept-Ranges', 'ETag', 'Cache-Control'],
      maxAge: 86400, // 1 day
    },
    helmet: {
      enabled: true,
      contentSecurityPolicy: false, // Disable for static assets
      crossOriginEmbedderPolicy: false, // Disable for static assets
    },
    allowedExtensions: [], // Empty means all extensions are allowed
    blockedExtensions: [
      // Server-side scripts
      '.php', '.php3', '.php4', '.php5', '.phtml',
      '.asp', '.aspx', '.jsp', '.py', '.rb', '.pl',
      '.sh', '.bash', '.zsh',
      // Executable files
      '.exe', '.dll', '.so', '.dylib', '.app',
      '.bat', '.cmd', '.ps1', '.vbs',
      // Config files
      '.env', '.config', '.ini', '.conf',
      // Database files
      '.db', '.sqlite', '.sqlite3',
    ],
    maxFileSize: 500 * 1024 * 1024, // 500MB
    enforceHTTPS: false, // Set to true in production with SSL
    trustProxy: true, // Trust Cloudflare/Argo Tunnel headers
  },

  compression: {
    enabled: true,
    threshold: 1024, // Compress files larger than 1KB
    encodings: ['gzip', 'br', 'deflate'],
  },

  logging: {
    enabled: true,
    level: 'info',
    prettyPrint: process.env.NODE_ENV !== 'production',
  },

  healthCheck: {
    enabled: true,
    path: '/health',
  },
};

// Get configuration from environment or use defaults
export function getConfig(): CDNConfig {
  const config = { ...defaultConfig };

  // Override with environment variables
  if (process.env.CDN_PORT) {
    config.port = parseInt(process.env.CDN_PORT, 10);
  }
  if (process.env.CDN_HOST) {
    config.host = process.env.CDN_HOST;
  }
  if (process.env.CDN_ROOT_DIR) {
    config.rootDirectory = process.env.CDN_ROOT_DIR;
  }
  if (process.env.CDN_LOG_LEVEL) {
    config.logging.level = process.env.CDN_LOG_LEVEL;
  }
  if (process.env.CDN_RATE_LIMIT_MAX) {
    config.rateLimit.maxRequests = parseInt(process.env.CDN_RATE_LIMIT_MAX, 10);
  }
  if (process.env.CDN_CORS_ORIGIN) {
    config.security.cors.origin = process.env.CDN_CORS_ORIGIN;
  }

  return config;
}
