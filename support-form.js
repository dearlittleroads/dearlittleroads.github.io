export const CONTACT_ENDPOINT =
  "https://forms.formward.eu/f/7da41dbf-4dca-4835-ab97-129857fc20f5";
export const CONTACT_REQUEST_TIMEOUT_MS = 15_000;

const STATUS_COPY = Object.freeze({
  en: Object.freeze({
    sending: "Sending…",
    success: "The contact service accepted your message.",
    invalid: "The message could not be read. Check the fields and try again.",
    quota: "The form's monthly capacity has been reached. Support is still free; please use the email link below.",
    forbidden: "The form could not send from this page. Reload the page or use the email link below.",
    unavailable: "This contact endpoint is unavailable. Please use the email link below.",
    rateLimited: "Too many messages are being sent right now. Wait a little, then try again, or use email.",
    network: "The message was not confirmed as sent. Check your connection and try again, or use email.",
    unexpected: "The message was not confirmed as sent. Try again, or use the email link below.",
  }),
  de: Object.freeze({
    sending: "Wird gesendet…",
    success: "Der Kontaktdienst hat deine Nachricht angenommen.",
    invalid: "Die Nachricht konnte nicht gelesen werden. Prüfe die Felder und versuche es erneut.",
    quota: "Die monatliche Kapazität des Formulars ist erreicht. Der Support bleibt kostenlos; nutze bitte den E-Mail-Link unten.",
    forbidden: "Das Formular konnte von dieser Seite aus keine Nachricht senden. Lade die Seite neu oder nutze den E-Mail-Link unten.",
    unavailable: "Dieser Kontaktendpunkt ist nicht verfügbar. Nutze bitte den E-Mail-Link unten.",
    rateLimited: "Derzeit werden zu viele Nachrichten gesendet. Warte kurz und versuche es erneut oder nutze E-Mail.",
    network: "Das Senden wurde nicht bestätigt. Prüfe deine Verbindung und versuche es erneut oder nutze E-Mail.",
    unexpected: "Das Senden wurde nicht bestätigt. Versuche es erneut oder nutze den E-Mail-Link unten.",
  }),
});

export function contactStatus(status) {
  if (status === 400) return "invalid";
  if (status === 402) return "quota";
  if (status === 403) return "forbidden";
  if (status === 404) return "unavailable";
  if (status === 429) return "rateLimited";
  return "unexpected";
}

export function contactStatusMessage(locale, state) {
  const copy = STATUS_COPY[locale] ?? STATUS_COPY.en;
  return copy[state] ?? copy.unexpected;
}

export function formParameters(formData) {
  const parameters = new URLSearchParams();
  for (const [name, value] of formData.entries()) {
    if (typeof value === "string") parameters.append(name, value);
  }
  const replyEmail = parameters.get("email")?.trim() ?? "";
  if (replyEmail !== "") parameters.set("_replyto", replyEmail);
  return parameters;
}

export async function sendContactRequest(
  parameters,
  fetchImplementation = fetch,
  timeoutMs = CONTACT_REQUEST_TIMEOUT_MS,
) {
  if (typeof AbortController !== "function") return { accepted: false, state: "network" };

  const controller = new AbortController();
  let timeoutId;
  const request = (async () => {
    try {
      const response = await fetchImplementation(CONTACT_ENDPOINT, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: parameters,
        credentials: "omit",
        redirect: "error",
        signal: controller.signal,
      });
      if (!response.ok || response.status !== 200) {
        return { accepted: false, state: contactStatus(response.status) };
      }
      const payload = await response.json().catch(() => null);
      return payload?.ok === true && typeof payload.id === "string" && payload.id.trim() !== ""
        ? { accepted: true, state: "success" }
        : { accepted: false, state: "unexpected" };
    } catch {
      return { accepted: false, state: "network" };
    }
  })();
  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      resolve({ accepted: false, state: "network" });
    }, timeoutMs);
  });

  try {
    return await Promise.race([request, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

export function enhanceContactForm(form) {
  if (!(form instanceof HTMLFormElement) || form.dataset.contactEnhanced === "true") return;
  if (form.action !== CONTACT_ENDPOINT) return;
  if (
    typeof fetch !== "function" ||
    typeof FormData !== "function" ||
    typeof URLSearchParams !== "function" ||
    typeof AbortController !== "function"
  ) return;

  const locale = form.dataset.locale === "de" ? "de" : "en";
  const status = form.querySelector("[data-contact-status]");
  const submit = form.querySelector('button[type="submit"]');
  if (!(status instanceof HTMLElement) || !(submit instanceof HTMLButtonElement)) return;

  form.dataset.contactEnhanced = "true";
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (form.dataset.contactSending === "true") return;

    form.dataset.contactSending = "true";
    form.setAttribute("aria-busy", "true");
    submit.disabled = true;
    status.dataset.state = "sending";
    status.textContent = contactStatusMessage(locale, "sending");

    try {
      const result = await sendContactRequest(formParameters(new FormData(form)));
      status.dataset.state = result.state;
      status.textContent = contactStatusMessage(locale, result.state);
      if (result.accepted) form.reset();
    } catch {
      status.dataset.state = "network";
      status.textContent = contactStatusMessage(locale, "network");
    } finally {
      submit.disabled = false;
      form.removeAttribute("aria-busy");
      delete form.dataset.contactSending;
    }
  });
}

export function enhanceContactForms(root = document) {
  for (const form of root.querySelectorAll("[data-contact-form]")) enhanceContactForm(form);
}

if (typeof document !== "undefined") enhanceContactForms();
