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

app.command("/soren", async ({ client, body, ack }) => {
  await ack();

  const feed = await parser.parseURL(Deno.env.get("RSS_FEED")!);
  const content = feed.items[0].content;
  const dom = new jsdom.JSDOM(content);

  const imgRegex = /\d{2}-\d{2}/;
  const imageURL = [...dom.window.document.querySelectorAll("img")].find(i => imgRegex.test(i.src)).src;

  const title = feed.items[0].title;
  const date = new Date(feed.items[0].pubDate!);

  const url = [...dom.window.document.querySelectorAll("a")].find(a => a.innerHTML.includes("Online")).href;

  await client.chat.postMessage({
    channel: body.channel_id,
    text: "Latest Soren Iverson post",
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: title!
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Soren Iverson post from ${date.toLocaleDateString()} | <${url}|see newsletter post>`
        }
      },
      {
        type: "image",
        alt_text: title!,
        title: {
          type: "plain_text",
          text: title!
        },
        image_url: imageURL
      }
    ]
  });
});

(async () => {
  // Start your app
  // await app.start(Deno.env.get("PORT") || 3000);
  await app.start();

  console.log('⚡️ Bolt app is running!');
})();