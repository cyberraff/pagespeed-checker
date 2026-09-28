# PageSpeed Field Report

A small web app for running mobile and desktop PageSpeed Insights checks. Each report includes category scores, Core Web Vitals and timing metrics, scored audit opportunities, savings estimates, and Lighthouse warnings. Reports are available in the browser and as a downloadable text file.

## Run locally

Requires Node.js 22 or newer.

```sh
npm install
cp .env.example .env
npm start
```

Open [http://localhost:3000](http://localhost:3000). The Google PageSpeed API key is optional for local use, but Google applies lower quotas without one. Add the key as `PAGESPEED_API_KEY` in `.env` to use an API key. Do not commit `.env`.

## Deploy to Render

1. Push this project to a GitHub repository.
2. In Render, choose **New** then **Blueprint**, and connect the repository. Render reads `render.yaml` and builds the Node web service.
3. In the service environment settings, set `PAGESPEED_API_KEY` to a Google PageSpeed Insights API key. Keep it private, enable the PageSpeed Insights API for its Google Cloud project, and restrict the key to that API.
4. Deploy and open the `onrender.com` URL Render assigns to the service.

The service exposes `/health` for deployment health checks. The key is used only by the server and is never sent to the browser.

## API

`POST /api/analyze` accepts JSON such as `{"url":"https://example.com"}` and returns mobile and desktop reports plus `reportText` for download. Only public HTTP and HTTPS website addresses are accepted.
