# Trip Calculator

A frontend-only React + Vite trip calculator that uses the Google Gemini API to estimate route distance, travel time, transport cost, accommodation cost, food cost, total budget, travel tips, itinerary, things to avoid, and packing suggestions.

## Requirements

- Node.js
- Gemini API key
- No backend
- No database
- No persistent browser storage

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a local `.env` file:

```bash
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```

3. Start the development server:

```bash
npm run dev
```

4. Build for production:

```bash
npm run build
```

## Environment Variables

The app reads the Gemini key from:

```js
import.meta.env.VITE_GEMINI_API_KEY
```

Do not hardcode the key in React files. `.env` is ignored by git.

## WordPress Embedding

1. Run:

```bash
npm run build
```

2. Upload the generated `dist` assets to your WordPress theme, plugin, or hosting folder.

3. Add the built JavaScript and CSS files from `dist/assets` to a WordPress page or template.

4. Add a mount element where the app should appear:

```html
<div id="root"></div>
```

For production security, the Gemini API call should ideally be proxied through a backend or WordPress AJAX endpoint, because frontend env keys can still be exposed in built JavaScript.
