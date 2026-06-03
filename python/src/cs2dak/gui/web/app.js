// Frontend logic. Talks to Python via window.pywebview.api.* (see gui/app.py).
// pywebview injects the `pywebviewready` event once the bridge is available.

let selectedPaths = [];

const $ = (id) => document.getElementById(id);

function renderFileList(files) {
  const ul = $("results");
  ul.innerHTML = "";
  for (const name of files) {
    const li = document.createElement("li");
    li.className = "pending";
    li.id = `item-${CSS.escape(name)}`;
    li.innerHTML = `<strong>${name}</strong>`;
    ul.appendChild(li);
  }
}

function updateItem(name, result) {
  const li = document.getElementById(`item-${CSS.escape(name)}`);
  if (!li) return;
  if (result.ok) {
    li.className = "ok";
    li.innerHTML = `<strong>${result.name}</strong><br><code>${result.output}</code>`;
  } else {
    li.className = "err";
    li.innerHTML = `<strong>${result.name}</strong><br><span class="err-msg">${result.error}</span>`;
  }
}

function setSelected(paths) {
  selectedPaths = paths || [];
  $("export").disabled = selectedPaths.length === 0;
  if (selectedPaths.length) {
    renderFileList(selectedPaths.map((p) => p.split(/[/\\]/).pop()));
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
    $("view").hidden = true;
    let anyOk = false;
    const total = selectedPaths.length;

    for (let i = 0; i < selectedPaths.length; i++) {
      const p = selectedPaths[i];
      const name = p.split(/[/\\]/).pop();
      // Show progress inline on the pending item.
      const li = document.getElementById(`item-${CSS.escape(name)}`);
      if (li) li.innerHTML = `<strong>${name}</strong><br><span class="progress">[${i + 1}/${total}] 正在解析…</span>`;

      const result = await window.pywebview.api.export_one(p);
      updateItem(name, result);
      if (result.ok) anyOk = true;
    }

    $("export").disabled = false;
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
