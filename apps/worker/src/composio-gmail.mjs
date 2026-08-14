export function createComposioGmail({ apiKey, toolkitVersion = "20260721_00", fetchImpl = fetch }) {
  if (!apiKey) throw new Error("Missing COMPOSIO_API_KEY");

  async function execute(slug, { userId, connectedAccountId, arguments: args }) {
    const response = await fetchImpl(`https://backend.composio.dev/api/v3.1/tools/execute/${slug}`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        user_id: userId,
        connected_account_id: connectedAccountId,
        arguments: args,
        toolkit_versions: { gmail: toolkitVersion },
      }),
    });
    if (!response.ok) throw new Error(`Composio ${slug} failed: ${response.status} ${await response.text()}`);
    return response.json();
  }

  return {
    async findWarmupMessage({ userId, connectedAccountId, token }) {
      const result = await execute("GMAIL_FETCH_EMAILS", {
        userId,
        connectedAccountId,
        arguments: { query: `"${token}" newer_than:7d`, max_results: 10 },
      });
      const message = result.data?.messages?.[0] ?? result.messages?.[0] ?? null;
      if (!message) return null;
      const labels = message.labelIds ?? message.label_ids ?? [];
      return {
        id: message.id,
        threadId: message.threadId ?? message.thread_id,
        folder: labels.includes("SPAM") ? "spam" : "inbox",
      };
    },
    moveFromSpamToInbox({ userId, connectedAccountId, messageId }) {
      return execute("GMAIL_BATCH_MODIFY_MESSAGES", {
        userId,
        connectedAccountId,
        arguments: { ids: [messageId], add_label_ids: ["INBOX"], remove_label_ids: ["SPAM"] },
      });
    },
    markImportant({ userId, connectedAccountId, messageId }) {
      return execute("GMAIL_ADD_LABEL_TO_EMAIL", {
        userId,
        connectedAccountId,
        arguments: { message_id: messageId, label_id: "IMPORTANT" },
      });
    },
    replyToThread({ userId, connectedAccountId, threadId, body }) {
      return execute("GMAIL_REPLY_TO_THREAD", {
        userId,
        connectedAccountId,
        arguments: { thread_id: threadId, body },
      });
    },
  };
}
