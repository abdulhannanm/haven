# Haven

A security scanning service that clones GitHub repositories, builds Docker containers, and runs security analysis in isolated environments.

## Features

- 🐳 **Containerized Security**: Scans applications in isolated Docker containers
- 🔍 **Automated Analysis**: Checks for missing security headers and common vulnerabilities
- 🌐 **Modern UI**: Beautiful glass-morphism interface with dark/light themes
- ⚡ **Real-time Scanning**: Live feedback with elegant notifications
- 🧹 **Auto Cleanup**: Automatically removes containers, images, and cloned repos

## Quick Start

### Prerequisites

- **Docker Desktop** (required for container building and scanning)
- **Node.js 20.19+** (for development)

### Installation

```bash
# Install dependencies
npm install

# Start backend server
npm run server

# Start frontend (in separate terminal)
npm run dev
```

### Usage

1. Open http://localhost:5173 in your browser
2. Enter a GitHub repository URL that contains a Dockerfile
3. Click "Scan" to start the security analysis
4. View results in the notification panel

## API Endpoints

- `POST /api/scan` - Start a new security scan
- `GET /api/scan/health` - Check Docker availability
- `GET /api/health` - Basic health check

## Tech Stack

- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Express.js + Dockerode + Simple-git
- **Security**: Custom security agent with extensible findings system

## Example Repositories to Test

- `https://github.com/docker/getting-started` (has Dockerfile)
- `https://github.com/GoogleCloudPlatform/nodejs-getting-started` (has Dockerfile)

## Development

```bash
# Run both services concurrently
npm run server  # Backend on port 3001
npm run dev     # Frontend on port 5173
```

## License

MIT
