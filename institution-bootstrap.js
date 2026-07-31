(function () {
  "use strict";

  var params = new URLSearchParams(window.location.search);
  var pathMatch = window.location.pathname.match(/\/colegio\/([^/?#]+)/i);
  var explicitCode =
    params.get("school") ||
    params.get("code") ||
    (pathMatch ? pathMatch[1] : "");
  var isHomepage = /(?:^|\/)(?:index\.html)?$/i.test(window.location.pathname);
  var requestedCode = explicitCode || (
    isHomepage
      ? ""
      : window.sessionStorage.getItem("colegiolibre_active_school_portal")
  );

  if (!requestedCode) {
    if (isHomepage) {
      window.sessionStorage.removeItem("colegiolibre_active_school_portal");
    }
    window.ColegioLibreInstitution = {
      enabled: false,
      code: "",
      schoolCode: "",
      schoolName: "",
      schoolMatch: ""
    };
    return;
  }

  var code = String(requestedCode)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");

  if (!code) return;

  window.ColegioLibreInstitution = {
    enabled: true,
    code: code,
    schoolCode: code.toUpperCase(),
    schoolName: code === "eccleston"
      ? "Instituto Sara Chamberlain de Eccleston"
      : code.replace(/[-_]+/g, " "),
    schoolMatch: code.replace(/[-_]+/g, " ")
  };
  window.sessionStorage.setItem("colegiolibre_active_school_portal", code);
  if (params.get("pretty") === "1") {
    window.history.replaceState({}, "", "/colegio/" + encodeURIComponent(code));
  }
})();
