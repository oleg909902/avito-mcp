# avito-mcp

MCP server for [Avito](https://www.avito.ru): search with filters, listing details, photos, messenger, Avito Delivery orders,
your own listings and favorites, closing your listings.

Requests to Avito run inside an avito.ru tab of an already running Chrome (via the Chrome DevTools Protocol),
so they use the browser's session, cookies and proxy. Pages are parsed right in the browser, the messenger is Avito's
JSON-RPC over the `socket.avito.ru` WebSocket opened from the same tab. Cookies are never extracted from the browser.

## Tools

| Tool | What it does |
|---|---|
| `search_listings(query, region?, category?, sort?, page?, price_min?, price_max?, delivery?, seller_type?, filters?)` | search results, 50 per page: id, title, price, old price, location, seller and rating, delivery, badges, photo, link |
| `get_search_filters(query, region?, category?)` | category filters for the query (condition, characteristics, availability, words in description…) and subcategories |
| `get_listing(listing)` | everything about a listing by link or id: price, description, characteristics, date, views, address, delivery, seller (rating, reviews, type), category, photo links |
| `get_listing_images(listing, limit?)` | listing photos as images for the model |
| `list_chats(limit?, offset?, unread_only?)` | chats: with whom, about which listing, last message, read or not |
| `get_chat(chat_id, limit?)` | messages of a chat |
| `send_message(item_id? \| chat_id?, text)` | one message to a seller (starts a chat) or into an existing chat |
| `list_orders(action?, status?, page?)` | Avito Delivery orders: `buy` — purchases, `sell` — sales; status, amount, carrier, tracking number |
| `my_listings()` | my active listings and the cabinet tabs with counts |
| `favorites()` | favorite listings |
| `close_reasons(item_id)` | reasons to close my listing (sold on Avito, with Avito Delivery, elsewhere, other) |
| `close_listing(item_id, reason)` | close my listing (moves to the archive, can be restored in the cabinet) |

Search `sort`: `default`, `price`, `price_desc`, `date`. `region` is the city slug from Avito URLs
(`krasnodar`, `moskva`, `sankt-peterburg`…, `all` — all of Russia), the default comes from `AVITO_REGION`.

Prompts:

- `ask_sellers(what, question, budget?, city?, count?)` — find listings and prepare a question for each seller;
  messages are sent only after the user confirms them.
- `close_my_listing(which?)` — find my listing, pick a close reason, confirm, close.

Tool descriptions and responses are in Russian, like Avito itself.

### Ban protection

- Requests to Avito run strictly one at a time, at most once every 3 seconds.
- If Avito's security check blocks a background request, the page is opened by a real navigation in a temporary tab,
  which the check lets through.
- Messages: one per call, at most once a minute (`AVITO_SEND_GAP_SEC`), up to 20 a day (`AVITO_DAILY_LIMIT`),
  never the same text twice in one chat. The model is told to send and close listings only after explicit user consent.

## Requirements

- Node.js 22+
- Chrome/Chromium with a remote debugging port (`--remote-debugging-port=9222`), logged in to Avito
- [Proxy Tunnel](https://github.com/oleg909902/proxytunnel) if Chrome runs on a server (see below)

### Why Proxy Tunnel

Avito's security check ("Доступ ограничен: проблема с IP") blocks traffic from datacenter IPs, so a Chrome on a VPS
going out through the VPS's own IP quickly gets locked out. [Proxy Tunnel](https://github.com/oleg909902/proxytunnel)
is an Android app that turns a phone into the server's internet exit: it runs an HTTP proxy on the phone
and opens a reverse SSH tunnel, so `127.0.0.1:18081` appears on the server and everything sent to it
goes out through the phone's mobile network. Chrome on the server is launched with this proxy,
and Avito sees an ordinary mobile IP.

```
avito-mcp ──CDP (:9222)──► Chrome on the server ──proxy 127.0.0.1:18081──► reverse SSH tunnel
                                                                                 │
                              Avito ◄── mobile internet ◄── phone (Proxy Tunnel) ◄┘
```

Setup:

1. Set up the server and the phone as described in the [Proxy Tunnel README](https://github.com/oleg909902/proxytunnel#1-server-setup)
   and check that the tunnel is up: `curl -x http://127.0.0.1:18081 https://ifconfig.me` shows the phone's IP.
2. Launch Chrome on the server with the proxy and a local-only debugging port:

   ```bash
   google-chrome \
     --user-data-dir="$HOME/chrome-profile" \
     --proxy-server=http://127.0.0.1:18081 \
     --remote-debugging-address=127.0.0.1 \
     --remote-debugging-port=9222 \
     https://www.avito.ru/
   ```

3. Log in to Avito in this Chrome once (for example over VNC/RDP); the session is kept in the profile.
   If Avito ever shows the security check, pass it in this Chrome the same way.
4. Point avito-mcp at the debugging port: run it on the same server with `CDP_URL=http://127.0.0.1:9222`,
   or forward the port to your machine (next section).

If the phone disconnects, Chrome loses internet access and tools fail with network errors until the tunnel is back.
Never expose the debugging port to the internet: it gives full control over the browser and its Avito session.

## Running

```bash
npm install
npm run build
npm start            # HTTP: http://127.0.0.1:3000/mcp (Streamable HTTP, for ChatGPT etc.)
npm run stdio        # stdio (for Claude Code, see .mcp.json)
```

Environment variables:

| Variable | Default | |
|---|---|---|
| `CDP_URL` | `http://127.0.0.1:9223` | HTTP address of Chrome's debugging port |
| `HOST` | `127.0.0.1` | HTTP server bind address |
| `PORT` | `3000` | HTTP server port |
| `AVITO_REGION` | `all` | default city for search (slug from Avito URLs) |
| `AVITO_SEND_GAP_SEC` | `60` | minimum pause between sent messages, seconds |
| `AVITO_DAILY_LIMIT` | `20` | messages allowed per 24 hours |

### Chrome on a remote server

If Chrome runs on a server, forward its debugging port to local port 9223 over SSH:

```bash
ssh -M -S /tmp/chrome-cdp-ssh-%r@%h:%p -f -N -L 127.0.0.1:9223:127.0.0.1:9222 user@server
# close the tunnel:
ssh -S /tmp/chrome-cdp-ssh-%r@%h:%p -O exit user@server
```

### Docker

```bash
docker build -t avito-mcp .
docker run --rm -p 3000:3000 -e HOST=0.0.0.0 -e AVITO_REGION=moskva -e CDP_URL=http://<chrome-host>:9222 avito-mcp
```

## Project layout

```
src/
  index.ts              entry point: stdio or HTTP
  config.ts             environment variables
  cdp/                  minimal Chrome DevTools Protocol client
    connection.ts         WebSocket, commands and events
    browser.ts            tabs: open/close/navigate, evaluate JS, wait for a condition, mouse clicks, text input
  avito/                Avito access
    client.ts             page fetch + in-browser parsing, JSON requests, messenger RPC, temporary tabs
    paced-queue.ts        one request at a time with a pause between them
    format.ts             URLs, listing paths, timestamps
  listings/             search, filters, listing details, photos
    search-page.ts        search results parser (runs in the browser)
    listing-page.ts       listing page parser (runs in the browser)
  messenger/            chats, history, sending with limits
  cabinet/              orders, my listings and favorites, closing a listing
  mcp/                  MCP tool and prompt definitions
  transport/http.ts     Streamable HTTP on node:http
```

How it works:

1. `AvitoClient` finds an avito.ru tab (or opens one) and runs `fetch` inside it. The HTML is parsed in the same tab
   with `DOMParser` by a self-contained parser function (`*-page.ts`) — only the extracted data comes back.
2. Requests run strictly one at a time with a 3-second gap, so Avito's rate limit (HTTP 439) triggers less often.
3. Pages drawn by scripts (the filter panel, the cabinet) are opened in a temporary tab that is always closed afterwards.
   Category filters are applied by real clicks in the filter panel (Avito encodes them in an undocumented `f` parameter);
   the resulting URL, plus price, sort and page, is then fetched like any other search.
4. The messenger tools open `wss://socket.avito.ru` from the tab and call Avito's JSON-RPC methods with the user's session;
   orders and closing listings use Avito's `/web/1/...` JSON endpoints.
