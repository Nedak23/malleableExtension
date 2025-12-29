# MalleableWeb

A Chrome extension that lets you customize any website using natural language commands, powered by Claude AI.

## Features

- **Natural Language Customization**: Describe what you want to change in plain English (e.g., "hide the sidebar", "make the text larger", "remove ads")
- **Persistent Rules**: Your customizations are saved and automatically applied when you revisit sites
- **Rule Management**: Enable, disable, or delete rules from the settings page
- **Import/Export**: Backup and share your rules as JSON files
- **Conversation History**: Continue refining rules with chat-based interactions

## Installation

### From Source (Development)

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the extension:
   ```bash
   npm run build
   ```
4. Load the extension in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder

### From Chrome Web Store

Coming soon!

## Usage

1. **Get an API Key**: You'll need an Anthropic API key. Get one at [console.anthropic.com](https://console.anthropic.com/settings/keys)

2. **Configure the Extension**: Click the extension icon, go to settings, and enter your API key

3. **Customize a Website**:
   - Navigate to any website
   - Click the MalleableWeb extension icon
   - Type what you want to change (e.g., "hide the recommended videos section")
   - The extension will generate CSS to apply your change

4. **Manage Rules**: Open the extension settings to view, enable/disable, or delete your rules

## Privacy

MalleableWeb takes your privacy seriously:

- **API Key Security**: Your Anthropic API key is encrypted with AES-256-GCM before storage
- **Local Storage**: All rules are stored locally on your device
- **No Telemetry**: We don't collect any usage data or analytics

When you create a rule, the following is sent to the Claude API:
- Your request text
- Page URL and title
- A simplified DOM structure (no form data or sensitive content)

See [PRIVACY.md](PRIVACY.md) for full details.

## Development

### Project Structure

```
src/
  background/     # Service worker for API calls and rule management
  content/        # Content script for DOM serialization and CSS injection
  popup/          # Extension popup UI
  options/        # Settings page
  shared/         # Shared types and utilities
```

### Scripts

- `npm run dev` - Build in watch mode for development
- `npm run build` - Production build
- `npm run clean` - Remove build artifacts

### Tech Stack

- **Framework**: Preact (lightweight React alternative)
- **Language**: TypeScript
- **Bundler**: Webpack
- **Extension**: Chrome Manifest V3

## Feedback API Setup (Optional)

To enable the feedback feature, deploy the feedback API:

1. Navigate to the `feedback-api` directory
2. Install dependencies: `npm install`
3. Deploy to Vercel: `npm run deploy`
4. Set environment variables in Vercel:
   - `RESEND_API_KEY` - Your Resend API key
   - `FEEDBACK_TO_EMAIL` - Email to receive feedback
5. Update `FEEDBACK_API_URL` in `src/options/options.tsx` with your Vercel URL

## License

MIT
