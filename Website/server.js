import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import compression from 'compression';
import cors from 'cors';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 6023;
const HOST = process.env.HOST || '0.0.0.0';
const API_PORT = process.env.API_PORT || 3001;

const distDir = path.join(__dirname, 'dist');
const imagesDir = path.join(__dirname, '..', 'Core_Script', 'images');

app.use(cors());
app.use(compression());

// Simple API proxy using axios (more reliable than proxy middleware)
app.use('/api', async (req, res) => {
	try {
		console.log('Proxying API request:', req.method, req.url);
		// The req.url for /api/health is /health, so we need to add back the /api prefix
		const apiUrl = `http://localhost:${API_PORT}/api${req.url}`;
		console.log('Making request to:', apiUrl);

		// Check if this is a PDF request (binary data)
		const isPdfRequest = req.url.includes('/pdf/');

		const response = await axios({
			method: req.method,
			url: apiUrl,
			data: req.body,
			headers: {
				...req.headers,
				host: `localhost:${API_PORT}`
			},
			timeout: 30000,
			responseType: isPdfRequest ? 'stream' : 'json'
		});

		console.log('API response status:', response.status);

		// Forward response headers
		Object.keys(response.headers).forEach(header => {
			if (!['connection', 'transfer-encoding', 'content-encoding'].includes(header)) {
				res.set(header, response.headers[header]);
			}
		});

		// Handle streaming responses (PDFs)
		if (isPdfRequest) {
			response.data.pipe(res);
		} else {
			res.status(response.status).send(response.data);
		}
	} catch (error) {
		console.error('API proxy error:', error.message);
		console.error('Error details:', error.response?.status, error.response?.data);
		if (error.response) {
			res.status(error.response.status).send(error.response.data);
		} else {
			res.status(500).json({ error: 'API proxy error', details: error.message });
		}
	}
});

// Serve images from /images path
app.use('/images', express.static(imagesDir, {
	maxAge: '7d',
	immutable: false,
	fallthrough: true
}));

// Serve static assets from dist (only for non-API, non-image requests)
app.use(express.static(distDir, {
	maxAge: '7d',
	immutable: false,
	index: false  // Don't serve index.html automatically
}));

// SPA fallback to index.html - use a proper catch-all route
app.use((req, res) => {
	res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(PORT, HOST, () => {
	console.log(`GJ Mugshots UI listening on http://${HOST}:${PORT}`);
});
