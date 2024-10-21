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
  return c.redirect("https://github.com/evacuate");
});

app.get("/logo.svg", async (c) => {
  const image = await Deno.readFile("./public/logo.svg");
  c.header("Content-Type", "image/svg+xml");
  return await c.body(image);
});

app.get("/favicon.ico", async (c) => {
  const image = await Deno.readFile("./public/favicon.ico");
  return await c.body(image);
});

app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const storage = await kv.get([id]);

  const body = `
  <!doctypehtml><html lang=en><link href=/favicon.ico rel=icon sizes=32x32><link href=/logo.svg rel=icon type=image/svg+xml>
  `;

  if (typeof storage.value === "string") {
    c.header("Location", storage.value);
  } else {
    return c.json({ error: "Invalid storage value" });
  }

  return c.body(body);
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
