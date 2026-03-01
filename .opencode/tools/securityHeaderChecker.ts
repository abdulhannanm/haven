import { tool } from "@opencode-ai/plugin"

export default tool({
  description: "Check security headers for a given URL. Returns findings for missing security headers like X-Frame-Options, Content-Security-Policy, X-Content-Type-Options, etc.",
  args: {
    url: tool.schema.string().describe("URL to scan for security headers"),
  },
  async execute(args, _context) {
    const targetUrl = args.url
    
    const findings = []

    // Define security headers to check
    const securityHeaders = [
      {
        name: 'x-frame-options',
        severity: 'medium',
        title: 'Missing X-Frame-Options Header',
        description: 'The application does not set X-Frame-Options header, making it vulnerable to clickjacking attacks.',
        remediation: 'Add X-Frame-Options: DENY or SAMEORIGIN header to all responses.'
      },
      {
        name: 'content-security-policy',
        severity: 'medium',
        title: 'Missing Content-Security-Policy Header',
        description: 'No CSP header is set, increasing risk of XSS attacks.',
        remediation: 'Implement a strict Content-Security-Policy header.'
      },
      {
        name: 'x-content-type-options',
        severity: 'low',
        title: 'Missing X-Content-Type-Options Header',
        description: 'Browser may MIME-sniff responses away from declared content-type.',
        remediation: 'Add X-Content-Type-Options: nosniff header.'
      },
      {
        name: 'strict-transport-security',
        severity: 'medium',
        title: 'Missing Strict-Transport-Security Header',
        description: 'No HSTS header. Connections may be downgraded to HTTP.',
        remediation: 'Add Strict-Transport-Security: max-age=31536000; includeSubDomains'
      },
      {
        name: 'x-xss-protection',
        severity: 'low',
        title: 'Missing X-XSS-Protection Header',
        description: 'Legacy XSS filter not enabled (note: modern browsers prefer CSP).',
        remediation: 'Add X-XSS-Protection: 1; mode=block (or rely on CSP).'
      },
      {
        name: 'referrer-policy',
        severity: 'low',
        title: 'Missing Referrer-Policy Header',
        description: 'Referrer information may leak to third parties.',
        remediation: 'Add Referrer-Policy: strict-origin-when-cross-origin'
      },
      {
        name: 'permissions-policy',
        severity: 'low',
        title: 'Missing Permissions-Policy Header',
        description: 'No restrictions on browser features (camera, mic, etc.).',
        remediation: 'Add Permissions-Policy with appropriate feature restrictions.'
      }
    ]

    try {
      // Make HTTP request to check headers
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'OpenCode-Security-Header-Checker/1.0'
        }
      })

      const headers = Object.fromEntries(response.headers.entries())
      const lowerHeaders: Record<string, string> = {}
      
      Object.keys(headers).forEach(key => {
        lowerHeaders[key.toLowerCase()] = headers[key]
      })

      // Check each security header
      for (const header of securityHeaders) {
        if (!lowerHeaders[header.name]) {
          findings.push({
            type: 'missing-security-header',
            severity: header.severity,
            title: header.title,
            header: header.name,
            description: header.description,
            remediation: header.remediation
          })
        }
      }

      // Check for server version disclosure
      if (lowerHeaders['server']) {
        const server = lowerHeaders['server']
        const hasVersion = /\d/.test(server) || /apache|nginx/i.test(server)
        if (hasVersion) {
          findings.push({
            type: 'information-disclosure',
            severity: 'info',
            title: 'Server Version Disclosure',
            header: 'server',
            description: `Server header reveals software: ${server}`,
            remediation: 'Configure server to hide or genericize the Server header.'
          })
        }
      }

      // Format findings as string
      let output = `Security Header Scan: ${targetUrl}\n`
      output += `Status: ${response.status}\n`
      output += `Time: ${new Date().toISOString()}\n\n`

      if (findings.length === 0) {
        output += 'All security headers present!'
      } else {
        output += `Found ${findings.length} issues:\n\n`
        
        findings.forEach(f => {
          const sev = f.severity.toUpperCase()
          output += `[${sev}] ${f.title}\n`
          output += `  ${f.description}\n`
          output += `  Fix: ${f.remediation}\n\n`
        })
      }

      return output.trim()

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error'
      return `Error checking security headers for ${targetUrl}:\n${errMsg}`
    }
  },
})
