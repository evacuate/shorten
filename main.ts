import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { customAlphabet } from "npm:nanoid";

const app = new Hono();
const kv = await Deno.openKv();

const nanoid = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  7
);

// Check if the string is a valid URL
function checkUrl(str: string) {
  try {
    new URL(str);
    return true;
  } catch (_err) {
    return false;
  }
}

// Shorten a URL
async function shorten(url: string) {
  const key = nanoid();
  await kv.set([key], url);
  return { key, url };
}

app.get("/", (c) => {
  return c.html(
    `<!doctype html>
    <html>
      <head>
        <meta http-equiv="refresh" content="0;url=https://www.evacuate.jp/">
        <link rel="icon" href="/favicon.ico">
        <link rel="icon" href="/logo.svg" type="image/svg+xml">
        <title>Redirecting...</title>
      </head>
      <body>
        <script>
          location="https://www.evacuate.jp/";
        </script>
      </body>
    </html>`
  );
});

app.get("/favicon.ico", async (c) => {
  const image = await Deno.readFile("./public/favicon.ico");
  return await c.body(image);
});

app.get("/logo.svg", async (c) => {
  const image = await Deno.readFile("./public/logo.svg");
  return await c.body(image);
});

app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const storage = await kv.get([id]);

  if (typeof storage.value === "string") {
    return c.redirect(storage.value);
  }

  return c.json({ error: "Invalid storage value" });
});

app.use(
  "/api/*",
  basicAuth({
    username: "username",
    password: "password",
  })
);

app.post("/api/links", async (c) => {
  const { url } = await c.req.parseBody();
  if (typeof url !== "string" || url === "" || !checkUrl(url)) {
    return c.json({ error: "Invalid URL" });
  }

  return c.json(await shorten(url));
});

app.patch("/api/links/:id", async (c) => {
  const id = c.req.param("id");
  const { url } = await c.req.parseBody();
  if (typeof url !== "string" || url === "" || !checkUrl(url)) {
    return c.json({ error: "Invalid URL" });
  }

  await kv.set([id], url);
  return c.json({ message: "Updated" });
});

app.delete("/api/links/:id", async (c) => {
  const id = c.req.param("id");

  if (typeof id !== "string" || id === "") {
    return c.json({ error: "Invalid ID" });
  }

  await kv.delete([id]);
  return c.json({ message: "Deleted" });
});

Deno.serve(app.fetch);
