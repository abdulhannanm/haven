#!/usr/bin/env node

/**
 * Security Header Checker Tool
 * 
 * Scans a URL for missing security headers and returns findings.
 * Can be called as a standalone CLI tool or imported as a module.
 * 
 * Usage:
 *   node securityHeaderChecker.js <url>
 *   node securityHeaderChecker.js https://example.com
 */

import axios from 'axios';

/**
 * Check security headers for a given URL
 * @param {string} targetUrl - URL to scan
 * @returns {Promise<Array>} Array of security findings
 */
export async function checkSecurityHeaders(targetUrl) {
  const findings = [];

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
  ];

  try {
    // Make HTTP request to check headers
    const response = await axios.get(targetUrl, {
      timeout: 10000,
      validateStatus: () => true, // Accept any status code
      maxRedirects: 5
    });

    const headers = response.headers;
    const lowerHeaders = Object.keys(headers).reduce((acc, key) => {
      acc[key.toLowerCase()] = headers[key];
      return acc;
    }, {});

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
        });
      }
    }

    // Check for server version disclosure
    if (lowerHeaders['server']) {
      const server = lowerHeaders['server'];
      const hasVersion = /\d/.test(server) || /apache|nginx/i.test(server);
      if (hasVersion) {
        findings.push({
          type: 'information-disclosure',
          severity: 'info',
          title: 'Server Version Disclosure',
          header: 'server',
          description: `Server header reveals software: ${server}`,
          remediation: 'Configure server to hide or genericize the Server header.'
        });
      }
    }

    // Check for insecure cookies
    if (lowerHeaders['set-cookie']) {
      const cookies = Array.isArray(lowerHeaders['set-cookie']) 
        ? lowerHeaders['set-cookie'] 
        : [lowerHeaders['set-cookie']];
      
      for (const cookie of cookies) {
        const hasSecure = /;\s*secure/i.test(cookie);
        const hasHttpOnly = /;\s*httponly/i.test(cookie);
        const hasSameSite = /;\s*samesite=/i.test(cookie);

        if (!hasSecure || !hasHttpOnly || !hasSameSite) {
          findings.push({
            type: 'insecure-cookie',
            severity: 'medium',
            title: 'Insecure Cookie Configuration',
            description: `Cookie missing security flags: ${!hasSecure ? 'Secure ' : ''}${!hasHttpOnly ? 'HttpOnly ' : ''}${!hasSameSite ? 'SameSite' : ''}`,
            remediation: 'Add Secure, HttpOnly, and SameSite=Strict flags to all cookies.'
          });
          break; // Only report once per scan
        }
      }
    }

    return {
      url: targetUrl,
      statusCode: response.status,
      findings,
      headersPresent: Object.keys(lowerHeaders).filter(h => 
        securityHeaders.some(sh => sh.name === h)
      ),
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    return {
      url: targetUrl,
      error: error.message,
      findings: [{
        type: 'connectivity-error',
        severity: 'high',
        title: 'Failed to Connect to Target',
        description: `Could not reach ${targetUrl}: ${error.message}`,
        remediation: 'Ensure the target application is running and accessible.'
      }],
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Format findings for CLI output
 */
function formatFindings(result) {
  const lines = [];
  lines.push(`\n🔍 Security Header Scan: ${result.url}`);
  lines.push(`Status: ${result.statusCode || 'ERROR'}`);
  lines.push(`Time: ${result.timestamp}`);
  lines.push('');

  if (result.error) {
    lines.push(`❌ Error: ${result.error}`);
    return lines.join('\n');
  }

  if (result.findings.length === 0) {
    lines.push('✅ All security headers present!');
  } else {
    lines.push(`⚠️  Found ${result.findings.length} issues:\n`);
    
    // Group by severity
    const bySeverity = { high: [], medium: [], low: [], info: [] };
    result.findings.forEach(f => {
      bySeverity[f.severity]?.push(f);
    });

    ['high', 'medium', 'low', 'info'].forEach(sev => {
      bySeverity[sev].forEach(f => {
        const icon = sev === 'high' ? '🔴' : sev === 'medium' ? '🟠' : sev === 'low' ? '🟡' : '🔵';
        lines.push(`${icon} [${sev.toUpperCase()}] ${f.title}`);
        lines.push(`   ${f.description}`);
        lines.push(`   Fix: ${f.remediation}\n`);
      });
    });
  }

  return lines.join('\n');
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.argv[2];
  
  if (!url) {
    console.log('Usage: node securityHeaderChecker.js <url>');
    console.log('Example: node securityHeaderChecker.js https://example.com');
    process.exit(1);
  }

  checkSecurityHeaders(url).then(result => {
    console.log(formatFindings(result));
    process.exit(result.error ? 1 : 0);
  });
}

export default checkSecurityHeaders;
