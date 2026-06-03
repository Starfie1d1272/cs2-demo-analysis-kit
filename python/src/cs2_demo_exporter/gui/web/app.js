// Frontend logic. Talks to Python via window.pywebview.api.* (see gui/app.py).
// pywebview injects the `pywebviewready` event once the bridge is available.

let selectedPaths = [];

const $ = (id) => document.getElementById(id);

function renderResults(items, { pending = false } = {}) {
  const ul = $("results");
  ul.innerHTML = "";
  for (const it of items) {
    const li = document.createElement("li");
    if (pending) {
      li.textContent = `⏳ ${it}`;
    } else if (it.ok) {
      li.className = "ok";
      li.innerHTML = `✅ <strong>${it.name}</strong><br><code>${it.output}</code>`;
    } else {
      li.className = "err";
      li.innerHTML = `❌ <strong>${it.name}</strong><br><span class="err-msg">${it.error}</span>`;
    }
    ul.appendChild(li);
  }
}

function setSelected(paths) {
  selectedPaths = paths || [];
  $("export").disabled = selectedPaths.length === 0;
  if (selectedPaths.length) {
    renderResults(selectedPaths.map((p) => p.split(/[/\\]/).pop()), { pending: true });
  }
}

async function init() {
  $("version").textContent = "v" + (await window.pywebview.api.get_version());
  $("outdir").textContent = await window.pywebview.api.get_output_dir();
}

function wire() {
  $("pick").addEventListener("click", async () => {
    setSelected(await window.pywebview.api.pick_demos());
  });

  $("change-out").addEventListener("click", async () => {
    $("outdir").textContent = await window.pywebview.api.set_output_dir();
  });

  $("export").addEventListener("click", async () => {
    $("export").disabled = true;
    const results = await window.pywebview.api.export(selectedPaths);
    renderResults(results);
    $("export").disabled = false;
    // Reveal the viewer only when something exported and a viewer build exists.
    const anyOk = results.some((r) => r.ok);
    if (anyOk && (await window.pywebview.api.can_view())) {
      $("view").hidden = false;
    }
  });

  $("view").addEventListener("click", async () => {
    const res = await window.pywebview.api.open_viewer();
    if (res && !res.ok) alert(res.error);
  });

  $("open-out").addEventListener("click", () => window.pywebview.api.open_output_dir());

  // Drag & drop: native dialog returns full paths; the DOM drop only gives
  // names on some backends, so a drop just re-opens the picker for reliability.
  const drop = $("drop");
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("dragover"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));
  drop.addEventListener("drop", async (e) => {
    e.preventDefault();
    drop.classList.remove("dragover");
    setSelected(await window.pywebview.api.pick_demos());
  });
}

window.addEventListener("pywebviewready", () => { init(); wire(); });
