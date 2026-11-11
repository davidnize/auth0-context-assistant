(function () {
  const form = document.getElementById("chat-form");
  const input = document.getElementById("message");
  const transcript = document.getElementById("transcript");

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function addBubble(role, text, trace) {
    const bubble = document.createElement("div");
    bubble.className = `bubble ${role}`;
    bubble.innerHTML = escapeHtml(text).replaceAll("\n", "<br />");
    if (trace && trace.length) {
      const list = document.createElement("div");
      list.className = "trace";
      list.textContent = trace
        .map((item) => `${item.api}: ${item.detail}`)
        .join("\n");
      bubble.appendChild(list);
    }
    transcript.appendChild(bubble);
    transcript.scrollTop = transcript.scrollHeight;
  }

  async function send(message) {
    addBubble("user", message);
    input.value = "";
    input.focus();

    try {
      const response = await fetch("/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        addBubble(
          "assistant",
          data.message || "The assistant could not complete that request."
        );
        return;
      }
      addBubble("assistant", data.reply, data.trace);
    } catch (err) {
      addBubble("assistant", "I couldn't reach the assistant. Please try again.");
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const message = input.value.trim();
    if (message) send(message);
  });

  document.querySelectorAll("[data-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      const prompt = button.getAttribute("data-prompt");
      if (prompt) send(prompt);
    });
  });

  addBubble(
    "assistant",
    "Ask me “What's the weather?” and I’ll look up your saved city, then fetch the forecast."
  );
})();
