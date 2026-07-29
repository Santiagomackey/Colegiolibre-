(() => {
  "use strict";

  const MAX_REPORTS_PER_SESSION = 8;
  const sent = new Set();
  let reports = 0;

  function clean(value, limit = 500) {
    return String(value || "")
      .replace(/https?:\/\/[^\s]+/gi, "[url]")
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, limit);
  }

  async function reportClientError({ message, source = "window", line = null, column = null }) {
    if (reports >= MAX_REPORTS_PER_SESSION) return;
    const safeMessage = clean(message);
    if (!safeMessage) return;

    const fingerprint = `${source}:${safeMessage}:${line || 0}:${column || 0}`;
    if (sent.has(fingerprint)) return;
    sent.add(fingerprint);

    const client = window.colegioLibreSupabase;
    if (!client?.auth || typeof client.from !== "function") return;

    try {
      const { data } = await client.auth.getUser();
      const user = data?.user;
      if (!user) return;

      reports += 1;
      await client.from("client_errors").insert({
        user_id: user.id,
        page_path: `${window.location.pathname}${window.location.search}`.slice(0, 300),
        error_source: clean(source, 120),
        error_message: safeMessage,
        line_number: Number.isFinite(line) ? line : null,
        column_number: Number.isFinite(column) ? column : null,
        app_version: "web-20260729"
      });
    } catch (_error) {
      // El monitoreo nunca debe interrumpir la experiencia principal.
    }
  }

  window.addEventListener("error", (event) => {
    reportClientError({
      message: event.message,
      source: event.filename || "window",
      line: event.lineno,
      column: event.colno
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    reportClientError({
      message: event.reason?.message || event.reason || "Promesa rechazada",
      source: "unhandledrejection"
    });
  });
})();
