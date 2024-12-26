import { customAlphabet } from 'npm:nanoid';
import { Hono } from 'hono';
import { basicAuth } from 'hono/basic-auth';

const app = new Hono();
const kv = await Deno.openKv();

interface StorageValue {
  url: string;
  clicks: number;
  index: boolean;
}

const nanoid = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  Number(Deno.env.get('LENGTH')) || 7,
);

async function shorten(url: string, index = false) {
  const key = nanoid();
  await kv.set([key], { url, clicks: 0, index }); // Save to KV
  return { key, url, clicks: 0, index };
}

app.get('/', (c) => {
  const redirect = Deno.env.get('REDIRECT') ?? 'https://github.com/evacuate';
  return c.redirect(redirect, 301);
});

app.get('/favicon.ico', async (c) => {
  const image = await Deno.readFile('./public/favicon.ico');
  c.header('Content-Type', 'image/x-icon');
  return c.body(image);
});

app.get('/robots.txt', async (c) => {
  const robots = await Deno.readFile('./public/robots.txt');
  const host = c.req.header('host') ?? 'localhost';
  c.header('Content-Type', 'text/plain');
  const robotsStr = new TextDecoder().decode(robots);
  return c.body(
    robotsStr.replace(
      '{{ URL }}',
      new URL('/sitemap.xml', `https://${host}/`).toString(),
    ),
  );
});

app.get('/sitemap.xml', async (c) => {
  const sitemap = await Deno.readFile('./public/sitemap.xml');
  const host = c.req.header('host') ?? 'localhost';
  c.header('Content-Type', 'application/xml');
  const sitemapStr = new TextDecoder().decode(sitemap);
  return c.body(
    sitemapStr.replace('{{ URL }}', new URL('/', `https://${host}`).toString()),
  );
});

if (Deno.env.get('GOOGLE_SITE_VERIFICATION')) {
  app.get(`/${Deno.env.get('GOOGLE_SITE_VERIFICATION')}.html`, (c) => {
    const text = `google-site-verification: ${Deno.env.get(
      'GOOGLE_SITE_VERIFICATION',
    )}.html`;
    c.header('Content-Type', 'text/html');
    return c.body(text);
  });
}

app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const storage = await kv.get<StorageValue>([id]);

  if (storage.value && typeof storage.value.url === 'string') {
    const updatedClicks = storage.value.clicks + 1;
    await kv.set([id], { ...storage.value, clicks: updatedClicks });

    if (!storage.value.index) {
      c.header('X-Robots-Tag', 'noindex'); // Prevent indexing
    }

    return c.redirect(storage.value.url, 302);
  }

  return c.json({ error: 'Invalid storage value' });
});

app.use(
  '/api/*',
  basicAuth({
    username: Deno.env.get('USERNAME') ?? 'username',
    password: Deno.env.get('PASSWORD') ?? 'password',
  }),
);

app.post('/api/links', async (c) => {
  const { url, index } = await c.req.parseBody();
  if (typeof url !== 'string' || url === '' || !URL.canParse(url)) {
    return c.json({ error: 'Invalid URL' });
  }

  return c.json(await shorten(url, index === 'true'));
});

app.patch('/api/links/:id', async (c) => {
  const id = c.req.param('id');
  const { url, index } = await c.req.parseBody();

  if (typeof url !== 'string' || url === '' || !URL.canParse(url)) {
    return c.json({ error: 'Invalid URL' });
  }

  const storage = await kv.get<StorageValue>([id]);
  if (storage.value) {
    await kv.set([id], {
      url,
      clicks: storage.value.clicks,
      index: index === 'true',
    });
    return c.json({ message: 'Updated' });
  }

  return c.json({ error: 'Invalid ID' });
});

app.delete('/api/links/:id', async (c) => {
  const id = c.req.param('id');

  if (typeof id !== 'string' || id === '') {
    return c.json({ error: 'Invalid ID' });
  }

  await kv.delete([id]);
  return c.json({ message: 'Deleted' });
});

app.get('/api/analytics/:id', async (c) => {
  const id = c.req.param('id');
  const storage = await kv.get<StorageValue>([id]);

  if (storage.value) {
    return c.json({
      url: storage.value.url,
      clicks: storage.value.clicks,
      index: storage.value.index,
    });
  }

  return c.json({ error: 'Invalid ID' });
});

Deno.serve(app.fetch);
