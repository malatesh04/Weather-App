/**
 * Vercel Serverless Function — Weatherstack API Proxy
 * Route: /api/weather?endpoint=current&query=Mumbai&units=m
 *
 * Calls Weatherstack server-side so the browser never hits:
 *   - CORS restrictions
 *   - Mixed-content (HTTP from HTTPS) blocks
 *   - 403 from third-party proxies
 */

const API_KEY = '2764197b011232ad6571bdd06bb939d0';
const BASE_URL = 'http://api.weatherstack.com';

module.exports = async (req, res) => {
    /* ---- CORS Headers (allow any origin) ---- */
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { endpoint, ...params } = req.query;

    if (!endpoint) {
        return res.status(400).json({ error: { info: 'Missing ?endpoint= parameter' } });
    }

    /* Build the upstream Weatherstack URL */
    const upstream = new URL(`${BASE_URL}/${endpoint}`);
    upstream.searchParams.set('access_key', API_KEY);

    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') {
            upstream.searchParams.set(k, v);
        }
    }

    try {
        const apiRes = await fetch(upstream.toString());
        const data = await apiRes.json();

        /* Surface Weatherstack-level errors as 400 */
        if (data.error || data.success === false) {
            return res.status(400).json(data);
        }

        res.status(200).json(data);
    } catch (err) {
        res.status(500).json({ error: { info: `Proxy fetch failed: ${err.message}` } });
    }
};
