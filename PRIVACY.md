# Privacy Policy for MalleableWeb

**Last Updated:** December 2024

## Overview

MalleableWeb is a browser extension that allows you to customize any website using natural language commands. This privacy policy explains what data the extension collects, how it's used, and how it's protected.

## Data Collection

### What We Collect

When you use MalleableWeb to customize a webpage, the following information is sent to the Anthropic Claude API:

- **Your request**: The natural language description of what you want to change (e.g., "hide the sidebar")
- **Page URL**: The URL of the webpage you're customizing
- **Page title**: The title of the webpage
- **DOM structure**: A simplified representation of the page's HTML elements, including:
  - HTML tag names
  - Element IDs and class names
  - Data attributes (truncated)
  - Aria labels (truncated)
  - Text content (truncated to 50 characters)

### What We Do NOT Collect

- Form data or input field contents
- Passwords or sensitive credentials
- Your browsing history
- Full page HTML or CSS
- Personal information
- Usage analytics or telemetry

## Data Storage

### API Key Storage

Your Anthropic API key is:
- Encrypted using AES-GCM (256-bit) encryption before storage
- The encryption key is stored in session storage and is cleared when you close your browser
- The encrypted API key is stored locally on your device
- Never transmitted to any server other than Anthropic's API

### Rules Storage

Your customization rules are:
- Stored locally on your device using Chrome's storage API
- Never synced to the cloud
- Never shared with third parties

## Third-Party Services

MalleableWeb uses the following third-party service:

### Anthropic Claude API

Your requests and page structure data are sent to Anthropic's Claude API to generate CSS rules. Please refer to [Anthropic's Privacy Policy](https://www.anthropic.com/privacy) for information about how they handle data.

## Data Retention

- **Local data**: Stored on your device until you delete it or uninstall the extension
- **API requests**: Subject to Anthropic's data retention policies

## Your Rights

You can:
- Export your rules at any time from the settings page
- Delete individual rules or all data by uninstalling the extension
- Use the extension without providing any personal information

## Security

We implement security best practices including:
- API key encryption at rest
- Session-based encryption key management
- No server-side storage of your data
- HTTPS-only communication with external services

## Changes to This Policy

We may update this privacy policy from time to time. Any changes will be reflected in the "Last Updated" date above.

## Contact

If you have questions about this privacy policy, please open an issue on our GitHub repository or contact us through the feedback form in the extension settings.
