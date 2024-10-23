import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { customAlphabet } from "npm:nanoid";

const app = new Hono();
const kv = await Deno.openKv();

interface StorageValue {
  url: string;
  clicks: number;
}

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

// Shorten a URL and initialize click count to 0
async function shorten(url: string) {
  const key = nanoid();
  await kv.set([key], { url, clicks: 0 }); // Save URL with click count
  return { key, url, clicks: 0 };
}

// Increment the click count and redirect to the stored URL
app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const storage = await kv.get<StorageValue>([id]);

  if (storage.value && typeof storage.value.url === "string") {
    // Increment click count
    const updatedClicks = storage.value.clicks + 1;
    await kv.set([id], { url: storage.value.url, clicks: updatedClicks });

    return c.redirect(storage.value.url, 302);
  }

  return c.json({ error: "Invalid storage value" });
});

app.get("/", (c) => {
  return c.redirect("https://github.com/evacuate", 301);
});

app.get("/favicon.ico", async (c) => {
  const image = await Deno.readFile("./public/favicon.ico");
  c.header("Content-Type", "image/x-icon");
  return await c.body(image);
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

  const storage = await kv.get<StorageValue>([id]);
  if (storage.value) {
    // Update the URL but keep the clicks count
    await kv.set([id], { url, clicks: storage.value.clicks });
    return c.json({ message: "Updated" });
  }

  return c.json({ error: "Invalid ID" });
});

app.delete("/api/links/:id", async (c) => {
  const id = c.req.param("id");

  if (typeof id !== "string" || id === "") {
    return c.json({ error: "Invalid ID" });
  }

  await kv.delete([id]);
  return c.json({ message: "Deleted" });
});

app.get("/api/analytics/:id", async (c) => {
  const id = c.req.param("id");
  const storage = await kv.get<StorageValue>([id]);

  if (storage.value) {
    return c.json({
      url: storage.value.url,
      clicks: storage.value.clicks,
    });
  }

  return c.json({ error: "Invalid ID" });
});

Deno.serve(app.fetch);
