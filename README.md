# Production-Ready CDN Server

A high-performance, secure CDN server built with Fastify, designed for serving static files with Cloudflare/Argo Tunnel integration.

## Features

✅ **Lightning Fast** - Built on Fastify, one of the fastest Node.js web frameworks
✅ **Cloudflare Optimized** - Proper TTL cache headers for maximum CDN efficiency
✅ **Rate Limiting** - Built-in IP-based rate limiting to prevent abuse
✅ **Security Hardened** - Helmet, CORS, path traversal protection, and more
✅ **Range Requests** - Supports streaming for audio/video files
✅ **Smart Caching** - Different cache strategies for different file types
✅ **Production Ready** - Comprehensive logging, error handling, and monitoring
✅ **TypeScript** - Fully typed for better developer experience

## File Type Support

### Static Assets (1 year cache)
- CSS, JavaScript files
- Images: PNG, JPG, GIF, WebP, AVIF, SVG, ICO
- Fonts: WOFF, WOFF2, TTF, OTF, EOT

### Media Files (30 days cache)
- Audio: MP3, WAV, OGG, M4A, FLAC, AAC
- Video: MP4, WebM, MOV, AVI, MKV

### Documents (1 day cache)
- PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX
- ODT, ODS, ODP

### Text Files (1 hour cache)
- TXT, JSON, XML, HTML, MD, CSV

## Quick Start

### 1. Installation

```bash
cd mini-services/cdn-server
bun install
```

### 2. Configuration

Create a `.env` file from the example:

```bash
cp .env.example .env
```

Edit `.env` and set your directory path:

```env
# IMPORTANT: Set this to your actual directory
CDN_ROOT_DIR=/path/to/your/public/folder
```

### 3. Start the Server

Development mode (with auto-reload):
```bash
bun run dev
```

Production mode:
```bash
bun run start
```

The server will start on `http://localhost:3005`

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CDN_PORT` | Server port | `3005` |
| `CDN_HOST` | Server host | `0.0.0.0` |
| `CDN_ROOT_DIR` | Root directory to serve files | `./public` |
| `CDN_RATE_LIMIT_MAX` | Max requests per window | `1000` |
| `CDN_CORS_ORIGIN` | CORS origin | `*` |
| `CDN_LOG_LEVEL` | Log level | `info` |
| `NODE_ENV` | Environment | `production` |

### Advanced Configuration

Edit `config.ts` to customize:
- Cache TTL values
- Rate limiting windows
- Security settings
- Allowed/blocked file extensions
- Compression settings
- Custom security headers

## Usage Examples

### Serving Files

If your directory structure is:
```
public/
├── music/
│   └── song.mp3
├── photos/
│   └── image.jpg
└── text/
    └── document.txt
```

Access files via:
```
http://localhost:3005/music/song.mp3
http://localhost:3005/photos/image.jpg
http://localhost:3005/text/document.txt
```

### Range Requests (Streaming)

The server supports HTTP Range requests for seamless audio/video streaming:

```html
<audio src="https://cdn.yourdomain.com/music/song.mp3" controls></audio>
<video src="https://cdn.yourdomain.com/video/movie.mp4" controls></video>
```

### Preloading (For Better Performance)

```html
<link rel="preload" href="https://cdn.yourdomain.com/image.jpg" as="image">
```

## Cloudflare/Argo Tunnel Integration

### Cache Strategy

The server sets optimal cache headers:

1. **Static Assets**: `Cache-Control: public, max-age=31536000, immutable`
2. **Media Files**: `Cache-Control: public, max-age=2592000`
3. **Documents**: `Cache-Control: public, max-age=86400`
4. **Text Files**: `Cache-Control: public, max-age=3600`

Additionally, Cloudflare-specific headers:
```
CDN-Cache-Control: public, max-age=<ttl>, s-maxage=<ttl>, stale-while-revalidate=<0.1*ttl>
Cloudflare-Cache-Status: HIT
```

### Argo Tunnel Setup

1. **Install Cloudflare Tunnel**:
   ```bash
   brew install cloudflared  # macOS
   # Or download from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/
   ```

2. **Start Tunnel**:
   ```bash
   cloudflared tunnel --url http://localhost:3005
   ```

3. **Your CDN is Live**:
   - Files will be served through Cloudflare's global network
   - Automatic HTTPS with Cloudflare SSL
   - Smart caching with proper TTL
   - DDoS protection

### Cloudflare Page Rules (Optional)

For advanced control, set up Page Rules in Cloudflare:

1. **Static Assets (1 year cache)**:
   - URL: `cdn.yourdomain.com/*.css|cdn.yourdomain.com/*.js|cdn.yourdomain.com/*.woff2`
   - Cache Level: Cache Everything
   - Edge Cache TTL: 1 year

2. **Media Files (30 days cache)**:
   - URL: `cdn.yourdomain.com/*.mp3|cdn.yourdomain.com/*.mp4`
   - Cache Level: Cache Everything
   - Edge Cache TTL: 1 month

3. **Bypass Cache for Text Files**:
   - URL: `cdn.yourdomain.com/*.txt|cdn.yourdomain.com/*.json`
   - Cache Level: Standard
   - Edge Cache TTL: Respect Existing Headers

## Security Features

### Rate Limiting
- **Default**: 1000 requests per minute per IP
- Configurable via environment variables
- Redis support for distributed rate limiting (optional)
- Automatic IP banning after exceeding limit

### Security Headers
- **Helmet**: Protection against well-known web vulnerabilities
- **CORS**: Configurable cross-origin policy
- **HSTS**: HTTP Strict Transport Security
- **XSS Protection**: XSS filter enabled
- **Content-Type Options**: Prevents MIME type sniffing
- **Frame Options**: Prevents clickjacking

### File Security
- **Path Traversal Protection**: Prevents `../` attacks
- **Extension Filtering**: Blocked dangerous file types
- **Size Limits**: Configurable max file size (default: 500MB)
- **MIME Type Validation**: Proper content type headers

### Blocked File Extensions
- Server-side scripts: `.php`, `.asp`, `.jsp`, `.py`, `.rb`, etc.
- Executables: `.exe`, `.dll`, `.so`, `.app`, etc.
- Config files: `.env`, `.config`, `.ini`, etc.
- Database files: `.db`, `.sqlite`, `.sqlite3`

## Health Check

Monitor your server health:

```bash
curl http://localhost:3005/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 123.456,
  "memory": {
    "rss": 12345678,
    "heapTotal": 8765432,
    "heapUsed": 5432109,
    "external": 123456
  }
}
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/*` | Serve files from root directory |
| `HEAD` | `/*` | Get file metadata without body |
| `OPTIONS` | `/*` | CORS preflight requests |
| `GET` | `/health` | Server health check |

## Performance Optimization

### Compression
Automatic compression for text-based files (HTML, CSS, JS, JSON, XML, SVG):
- Gzip, Brotli, and Deflate support
- Only compresses files > 1KB
- Configurable threshold

### ETags & Conditional Requests
- ETags based on file modification time and size
- Supports `If-None-Match` and `If-Modified-Since`
- Reduces bandwidth with 304 Not Modified responses

### Connection Keep-Alive
- Persistent connections for faster subsequent requests
- Configurable timeouts

## Logging

### Log Levels
- `fatal`: Critical errors
- `error`: Errors
- `warn`: Warnings
- `info`: Informational messages (default)
- `debug`: Debug information
- `trace`: Detailed trace information

### Log Format

Production (JSON):
```json
{"level":"info","time":1704067200000,"msg":"CDN Server is running on http://0.0.0.0:3005"}
```

Development (Pretty):
```
[16:00:00 +0000] INFO: CDN Server is running on http://0.0.0.0:3005
```

## Production Deployment

### Systemd Service (Linux)

Create `/etc/systemd/system/cdn-server.service`:

```ini
[Unit]
Description=CDN Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/mini-services/cdn-server
Environment="NODE_ENV=production"
Environment="CDN_ROOT_DIR=/path/to/your/public/folder"
ExecStart=/usr/bin/bun run start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable cdn-server
sudo systemctl start cdn-server
sudo systemctl status cdn-server
```

### Docker Deployment

Create `Dockerfile`:

```dockerfile
FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lockb ./
RUN bun install

COPY . .

ENV NODE_ENV=production
ENV CDN_PORT=3005

EXPOSE 3005

CMD ["bun", "run", "start"]
```

Build and run:
```bash
docker build -t cdn-server .
docker run -d -p 3005:3005 -v /path/to/files:/app/public cdn-server
```

### PM2 (Process Manager)

```bash
npm install -g pm2
pm2 start bun --name "cdn-server" -- run start
pm2 save
pm2 startup
```

## Monitoring

### Recommended Tools
- **Cloudflare Analytics**: CDN performance, traffic, cache hit rate
- **Uptime Robot**: Monitor server availability
- **Prometheus + Grafana**: Advanced metrics and dashboards
- **Sentry**: Error tracking and alerting

## Troubleshooting

### Server won't start
- Check port is not in use: `lsof -i :3005`
- Verify CDN_ROOT_DIR is correct and accessible
- Check logs for error messages

### Files not found
- Verify file paths are correct
- Check file permissions
- Ensure CDN_ROOT_DIR points to the right location

### High memory usage
- Adjust rate limiting settings
- Monitor file sizes and request patterns
- Consider adding Redis for rate limiting

### Cache not working
- Verify Cloudflare cache headers are set
- Check Cloudflare Page Rules
- Clear Cloudflare cache if needed

## License

MIT

## Support

For issues and questions, please open an issue on GitHub.

---

Built with ❤️ using Fastify and Bun
