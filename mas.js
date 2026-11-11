(() => {
  const api = window.colegioLibreApi;
  const auth = window.colegioLibreSupabase?.auth;
  if (!api || !auth) return;

  const name = document.getElementById("more-account-name");
  const school = document.getElementById("more-school-name");
  const guestName = document.getElementById("more-guest-name");
  const login = document.getElementById("more-login");
  const profile = document.getElementById("more-profile");
  const logout = document.getElementById("more-logout");
  const error = document.getElementById("more-logout-error");
  let request = 0;

  async function refreshAccount() {
    const current = ++request;
    const user = await api.getCurrentUser();
    const details = user ? await api.getCurrentProfile().catch(() => null) : null;
    if (current !== request) return;

    name.textContent = details?.name || "";
    school.textContent = details?.school_name || "";
    name.hidden = !name.textContent;
    school.hidden = !school.textContent;
    guestName.hidden = !name.hidden;
    login.hidden = Boolean(user);
    profile.hidden = !user;
    logout.hidden = !user;
  }

  window.addEventListener("colegiolibre:auth-state", () => void refreshAccount());
  logout.addEventListener("click", async () => {
    logout.disabled = true;
    error.hidden = true;
    try {
      const result = await auth.signOut();
      if (result.error) throw result.error;
      await refreshAccount();
    } catch {
      error.hidden = false;
    } finally {
      logout.disabled = false;
    }
  });

  void refreshAccount();
})();
