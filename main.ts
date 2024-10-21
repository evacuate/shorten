import { Hono } from "hono";
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

app.get("/", async (c) => {
  const url = String(c.req.query("url"));
  if (url === "undefined") {
    return c.redirect("https://github.com/evacuate");
  }

  if (!checkUrl(url)) {
    return c.json({ error: "Invalid URL" });
  }

  return c.json(await shorten(url));
});

app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const storage = await kv.get([id]);
  return c.redirect(storage.value);
});

Deno.serve(app.fetch);
