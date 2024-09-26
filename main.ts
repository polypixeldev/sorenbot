import Slack from "@slack/bolt";
import "jsr:@std/dotenv/load";
import Parser from "rss-parser";
import jsdom from "jsdom";

// Initializes your app with your bot token and signing secret
const app = new Slack.App({
  token: Deno.env.get("SLACK_BOT_TOKEN"),
  // signingSecret: Deno.env.get("SLACK_SIGNING_SECRET"),
  appToken: Deno.env.get("SLACK_APP_TOKEN"),
  socketMode: true
});

const parser = new Parser();

type PostData = {
  title: string;
  imageURL: string;
  date: Date;
  url: string;
}

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

let cachedFeed: Awaited<ReturnType<typeof parser.parseURL>>;
let cachedTime: Date;
// cache for 5 mins
const CACHE_DURATION = 5 * 60 * 1000;

async function getPostData(query: number | string | Date): Promise<PostData | null> {
  let feed;
  if (cachedFeed && new Date().valueOf() - cachedTime.valueOf() < CACHE_DURATION) {
    feed = cachedFeed;
  } else {
    feed = await parser.parseURL(Deno.env.get("RSS_FEED")!);
    cachedFeed = feed;
    cachedTime = new Date();
  }
  
  let post;
  if (typeof(query) === "number") {
    post = feed.items[query];
  } else if (query instanceof Date) {
    post = feed.items.find(p => new Date(p.pubDate!).toDateString() === query.toDateString())
  } else {
    post = feed.items.find(p => new RegExp(escapeRegExp(query), 'i').test(p.title!))
  }

  if (!post) {
    return null;
  }

  const content = post.content;

  const dom = new jsdom.JSDOM(content);

  const imgRegex = /\d{2}-\d{2}/;
  const imageURL = [...dom.window.document.querySelectorAll("img")].find(i => imgRegex.test(i.src)).src;

  const title = post.title!;
  const date = new Date(post.pubDate!);

  const url = [...dom.window.document.querySelectorAll("a")].find(a => a.innerHTML.includes("Online")).href;

  const postData = {
    title,
    imageURL,
    date,
    url
  }

  return postData;
}

async function sendPost(data: PostData, channel: string) {
  await app.client.chat.postMessage({
    channel,
    text: "Soren Iverson post",
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: data.title
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Soren Iverson post from ${data.date.toLocaleDateString()} | <${data.url}|see newsletter post>`
        }
      },
      {
        type: "image",
        alt_text: data.title,
        title: {
          type: "plain_text",
          text: data.title
        },
        image_url: data.imageURL
      }
    ]
  }).catch(e => console.dir(e));
}

app.command("/soren", async ({ client, body, ack, command }) => {
  await ack();

  const args = command.text.split(" ");

  let query: number | string | Date;

  if (args[0] === "latest" || args[0] === "") {
    query = 0;
  } else if (!isNaN(Number(args[0]))) {
    query = Number(args[0])
  } else if (!isNaN(new Date(command.text).valueOf())) {
    query = new Date(command.text);
  } else {
    query = command.text
  }

  let data;
  try {
    data = await getPostData(query);
  } catch {
    await client.chat.postEphemeral({
      user: body.user_id,
      channel: body.channel_id,
      text: "An unknown error occurred when fetching post data :("
    });
    return;
  }

  if (!data) {
    await client.chat.postEphemeral({
      user: body.user_id,
      channel: body.channel_id,
      text: "Unable to fetch post"
    });
    return;
  }

  await sendPost(data, body.channel_id);
});

(async () => {
  // Start your app
  // await app.start(Deno.env.get("PORT") || 3000);
  await app.start();

  console.log('⚡️ Bolt app is running!');
})();