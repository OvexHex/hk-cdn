import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { getConfig, type CDNConfig } from './config.js';
import mime from 'mime-types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// File type categories for cache TTL
const FILE_CATEGORIES = {
  STATIC_ASSETS: ['css', 'js', 'woff', 'woff2', 'ttf', 'otf', 'eot', 'svg', 'ico', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif'],
  MEDIA_FILES: ['mp3', 'mp4', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'webm', 'mov', 'avi', 'mkv'],
  DOCUMENTS: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp'],
  TEXT_FILES: ['txt', 'json', 'xml', 'html', 'md', 'csv'],
};

function getCacheTTL(filename: string, config: CDNConfig): number {
  const ext = path.extname(filename).toLowerCase().slice(1);

  if (FILE_CATEGORIES.STATIC_ASSETS.includes(ext)) {
    return config.cache.staticAssets;
  } else if (FILE_CATEGORIES.MEDIA_FILES.includes(ext)) {
    return config.cache.mediaFiles;
  } else if (FILE_CATEGORIES.DOCUMENTS.includes(ext)) {
    return config.cache.documents;
  } else if (FILE_CATEGORIES.TEXT_FILES.includes(ext)) {
    return config.cache.textFiles;
  }

  // Default to 1 hour for unknown types
  return 3600;
}

function getMimeType(filename: string): string {
  const mimeType = mime.lookup(filename);
  return mimeType || 'application/octet-stream';
}

function isCompressible(mimeType: string): boolean {
  const compressibleTypes = [
    'text/',
    'application/json',
    'application/javascript',
    'application/x-javascript',
    'application/xml',
    'application/rss+xml',
    'application/xhtml+xml',
    'image/svg+xml',
  ];

  return compressibleTypes.some(type => mimeType.startsWith(type));
}

async function buildServer() {
  const config = getConfig();

  const fastify = Fastify({
    logger: config.logging.enabled ? {
      level: config.logging.level,
      transport: config.logging.prettyPrint ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      } : undefined,
    } : false,

    // Trust proxy headers (Cloudflare/Argo Tunnel)
    trustProxy: config.security.trustProxy,

    // Disable request logging for production (optional)
    disableRequestLogging: !config.logging.enabled,

    // Router options
    routerOptions: {
      caseSensitive: true,
    },

    // Return detailed errors in development
    exposeHeadRoutes: true,
  });

  // Register Helmet (Security headers)
  if (config.security.helmet.enabled) {
    await fastify.register(helmet, {
      contentSecurityPolicy: config.security.helmet.contentSecurityPolicy ? {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'", 'data:'],
          frameSrc: ["'none'"],
        },
      } : false,
      crossOriginEmbedderPolicy: config.security.helmet.crossOriginEmbedderPolicy,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      noSniff: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      xssFilter: true,
      hidePoweredBy: true,
    });
  }

  // Register CORS
  if (config.security.cors.enabled) {
    await fastify.register(cors, {
      origin: config.security.cors.origin,
      credentials: config.security.cors.credentials,
      methods: config.security.cors.methods,
      allowedHeaders: config.security.cors.allowedHeaders,
      exposedHeaders: config.security.cors.exposedHeaders,
      maxAge: config.security.cors.maxAge,
      preflightContinue: false,
      optionsSuccessStatus: 204,
    });
  }

  // Register Rate Limiting
  if (config.rateLimit.enabled) {
    await fastify.register(rateLimit, {
      max: config.rateLimit.maxRequests,
      timeWindow: config.rateLimit.timeWindow,
      cache: 10000,
      allowList: config.rateLimit.allowList,
      redis: undefined, // Add Redis config if needed
      skipOnError: true,
      addHeaders: {
        'x-ratelimit-limit': true,
        'x-ratelimit-remaining': true,
        'x-ratelimit-reset': true,
        'retry-after': true,
      },
      errorResponseBuilder: (req, context) => {
        return {
          code: 429,
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Try again in ${Math.round(context.after / 1000)} seconds.`,
          retryAfter: context.after,
        };
      },
    });
  }

  // Note: Compression is handled by the HTTP server and CDN layer
  // For production deployment with Cloudflare/Argo Tunnel, compression is applied automatically

  // Resolve root directory path
  const rootDirectory = path.resolve(config.rootDirectory);

  // Verify root directory exists
  if (!fs.existsSync(rootDirectory)) {
    fastify.log.error(`Root directory does not exist: ${rootDirectory}`);
    fastify.log.info(`Please set the correct path via CDN_ROOT_DIR environment variable.`);
    process.exit(1);
  }

  fastify.log.info(`Serving files from: ${rootDirectory}`);

  // Security: Path traversal protection
  function safePath(requestPath: string): string | null {
    const resolvedPath = path.normalize(path.join(rootDirectory, requestPath));
    if (!resolvedPath.startsWith(rootDirectory)) {
      return null; // Path traversal attempt
    }
    return resolvedPath;
  }

  // Security: Check file extension
  function isAllowedExtension(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();

    // Check blocked extensions
    if (config.security.blockedExtensions.includes(ext)) {
      return false;
    }

    // Check allowed extensions (if specified)
    if (config.security.allowedExtensions.length > 0) {
      return config.security.allowedExtensions.includes(ext);
    }

    // If no restrictions, allow all
    return true;
  }

  // Security: Check file size
  async function isAllowedFileSize(filePath: string): Promise<boolean> {
    if (config.security.maxFileSize === 0) {
      return true;
    }

    try {
      const stats = await fs.promises.stat(filePath);
      return stats.size <= config.security.maxFileSize;
    } catch {
      return false;
    }
  }

  // HEAD handler
  fastify.head('/*', async (request, reply) => {
    const requestPath = (request.params as any)['*'] || '';
    const safeRequestedPath = safePath(requestPath);

    if (!safeRequestedPath) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    if (!fs.existsSync(safeRequestedPath) || !fs.statSync(safeRequestedPath).isFile()) {
      return reply.status(404).send({ error: 'Not Found' });
    }

    if (!isAllowedExtension(safeRequestedPath)) {
      return reply.status(403).send({ error: 'File type not allowed' });
    }

    const stats = fs.statSync(safeRequestedPath);
    const mimeType = getMimeType(safeRequestedPath);
    const cacheTTL = getCacheTTL(safeRequestedPath, config);

    reply
      .code(200)
      .header('Content-Type', mimeType)
      .header('Content-Length', stats.size.toString())
      .header('Accept-Ranges', 'bytes')
      .header('Cache-Control', `public, max-age=${cacheTTL}, immutable, stale-while-revalidate=${cacheTTL * 0.1}`)
      .header('CDN-Cache-Control', `public, max-age=${cacheTTL}, s-maxage=${cacheTTL}, stale-while-revalidate=${cacheTTL * 0.1}`)
      .header('Cloudflare-Cache-Status', 'BYPASS');

    return reply.send();
  });

  // GET handler for files with Cloudflare cache optimization
  fastify.get('/*', async (request, reply) => {
    const requestPath = (request.params as any)['*'] || '';

    // Handle root request
    if (!requestPath || requestPath === '/') {
      return reply
        .code(200)
        .header('Cache-Control', 'no-cache, no-store, must-revalidate')
        .send({
          name: 'CDN Server',
          version: '1.0.0',
          status: 'running',
          message: 'This is a CDN server. Access files via /path/to/file',
        });
    }

    const safeRequestedPath = safePath(requestPath);

    // Security: Path traversal check
    if (!safeRequestedPath) {
      return reply
        .code(403)
        .header('Cache-Control', 'no-cache, no-store, must-revalidate')
        .send({ error: 'Forbidden', message: 'Path traversal not allowed' });
    }

    // Check if file exists and is a file (not directory)
    if (!fs.existsSync(safeRequestedPath) || !fs.statSync(safeRequestedPath).isFile()) {
      return reply
        .code(404)
        .header('Cache-Control', 'no-cache, no-store, must-revalidate')
        .send({ error: 'Not Found', message: 'File not found' });
    }

    // Security: Check extension
    if (!isAllowedExtension(safeRequestedPath)) {
      return reply
        .code(403)
        .header('Cache-Control', 'no-cache, no-store, must-revalidate')
        .send({ error: 'Forbidden', message: 'File type not allowed' });
    }

    // Security: Check file size
    if (!(await isAllowedFileSize(safeRequestedPath))) {
      return reply
        .code(413)
        .header('Cache-Control', 'no-cache, no-store, must-revalidate')
        .send({ error: 'Payload Too Large', message: 'File exceeds maximum size limit' });
    }

    const stats = fs.statSync(safeRequestedPath);
    const mimeType = getMimeType(safeRequestedPath);
    const cacheTTL = getCacheTTL(safeRequestedPath, config);
    const fileSize = stats.size;
    const fileETag = `"${stats.mtime.getTime().toString(16)}-${fileSize.toString(16)}"`;

    // Handle Range requests (for audio/video streaming)
    const range = request.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize) {
        return reply
          .code(416)
          .header('Content-Range', `bytes */${fileSize}`)
          .send({ error: 'Requested Range Not Satisfiable' });
      }

      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(safeRequestedPath, { start, end });

      reply
        .code(206)
        .header('Content-Type', mimeType)
        .header('Content-Range', `bytes ${start}-${end}/${fileSize}`)
        .header('Accept-Ranges', 'bytes')
        .header('Content-Length', chunksize.toString())
        .header('ETag', fileETag)
        .header('Cache-Control', `public, max-age=${cacheTTL}, immutable, stale-while-revalidate=${cacheTTL * 0.1}`)
        .header('CDN-Cache-Control', `public, max-age=${cacheTTL}, s-maxage=${cacheTTL}, stale-while-revalidate=${cacheTTL * 0.1}`)
        .header('Cloudflare-Cache-Status', 'HIT');

      return reply.send(file);
    }

    // Handle If-None-Match (ETag)
    const ifNoneMatch = request.headers['if-none-match'];
    if (ifNoneMatch === fileETag) {
      return reply
        .code(304)
        .header('ETag', fileETag)
        .header('Cache-Control', `public, max-age=${cacheTTL}, immutable, stale-while-revalidate=${cacheTTL * 0.1}`)
        .send();
    }

    // Handle If-Modified-Since
    const ifModifiedSince = request.headers['if-modified-since'];
    if (ifModifiedSince) {
      const modifiedSince = new Date(ifModifiedSince);
      if (stats.mtime <= modifiedSince) {
        return reply
          .code(304)
          .header('Last-Modified', stats.mtime.toUTCString())
          .header('ETag', fileETag)
          .header('Cache-Control', `public, max-age=${cacheTTL}, immutable, stale-while-revalidate=${cacheTTL * 0.1}`)
          .send();
      }
    }

    // Send full file
    const file = fs.createReadStream(safeRequestedPath);

    reply
      .code(200)
      .header('Content-Type', mimeType)
      .header('Content-Length', fileSize.toString())
      .header('Accept-Ranges', 'bytes')
      .header('ETag', fileETag)
      .header('Last-Modified', stats.mtime.toUTCString())
      .header('Cache-Control', `public, max-age=${cacheTTL}, immutable, stale-while-revalidate=${cacheTTL * 0.1}`)
      .header('CDN-Cache-Control', `public, max-age=${cacheTTL}, s-maxage=${cacheTTL}, stale-while-revalidate=${cacheTTL * 0.1}`)
      .header('Cloudflare-Cache-Status', 'HIT')
      .header('X-Content-Type-Options', 'nosniff')
      .header('X-Frame-Options', 'DENY');

    return reply.send(file);
  });

  // Health check endpoint
  if (config.healthCheck.enabled) {
    fastify.get(config.healthCheck.path, async (request, reply) => {
      return reply
        .code(200)
        .header('Cache-Control', 'no-cache, no-store, must-revalidate')
        .send({
          status: 'ok',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          memory: process.memoryUsage(),
        });
    });
  }

  // 404 handler
  fastify.setNotFoundHandler(async (request, reply) => {
    return reply
      .code(404)
      .header('Cache-Control', 'no-cache, no-store, must-revalidate')
      .send({ error: 'Not Found', message: 'The requested resource was not found' });
  });

  // Global error handler
  fastify.setErrorHandler((error, request, reply) => {
    fastify.log.error(error);

    const statusCode = error.statusCode || 500;

    return reply
      .code(statusCode)
      .header('Cache-Control', 'no-cache, no-store, must-revalidate')
      .send({
        error: statusCode >= 500 ? 'Internal Server Error' : 'Client Error',
        message: error.message,
        ...(process.env.NODE_ENV !== 'production' && { stack: error.stack }),
      });
  });

  // Start server
  try {
    await fastify.listen({ port: config.port, host: config.host });
    fastify.log.info(`CDN Server is running on http://${config.host}:${config.port}`);
    fastify.log.info(`Serving files from: ${rootDirectory}`);
    fastify.log.info(`Health check: http://${config.host}:${config.port}${config.healthCheck.path}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }

  return fastify;
}

// Start the server
buildServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
