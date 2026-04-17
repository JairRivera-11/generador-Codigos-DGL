// ── Utilidades ────────────────────────────────────────────
const ta = document.getElementById("titulos");
ta.addEventListener("input", actualizarConteo);

function actualizarConteo() {
  const lines = getTitulos();
  document.getElementById("lineCount").textContent =
    lines.length === 0 ? "0 títulos" : `${lines.length} título${lines.length !== 1 ? "s" : ""}`;
}
function getTitulos() {
  return ta.value.split("\n").map(l => l.trim()).filter(l => l.length > 0);
}
function limpiarTodo() {
  ta.value = "";
  actualizarConteo();
  document.getElementById("resultCard").style.display = "none";
}
function escapeHTML(str) {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ── GEN Generator ─────────────────────────────────────────
function generarBase(texto) {
  let upper = texto.toUpperCase().trim();
  let palabras = upper.split(/\s+/);
  let iniciales = "";
  let modelo = "";
  let capacidad = "";
  palabras.forEach(p => {
    if (/^\d+GB$/i.test(p)) {
      capacidad = p.replace(/GB/i, "");
    } else if (/\d/.test(p) && !/GB/i.test(p) && modelo === "") {
      modelo = p;
    } else if (!/\d/.test(p)) {
      iniciales += p[0];
    }
  });
  let color = palabras[palabras.length - 1][0];
  let base = (iniciales + modelo + capacidad + color).substring(0, 8);
  if (!/\d/.test(base)) {
    const digitoSuelto = upper.replace(/\s/g, "").match(/\d/);
    base = digitoSuelto
      ? (base.slice(0, -1) + digitoSuelto[0] + base.slice(-1)).substring(0, 8)
      : (base.slice(0, -1) + "0" + base.slice(-1)).substring(0, 8);
  }
  return base;
}

/**
 * Dado un código base y un Set de códigos ya usados,
 * devuelve un código único modificando el último carácter.
 * Estrategia: primero intenta letras del título, luego A–Z, luego A–Z en posiciones anteriores.
 */
function resolverDuplicadoGEN(codigoBase, titulo, usados) {
  // Intentar con letras del propio título
  const upper = titulo.toUpperCase().replace(/\s/g, "");
  for (let ch of upper) {
    if (/[A-Z0-9]/.test(ch)) {
      const candidato = (codigoBase.slice(0, -1) + ch).substring(0, 8);
      if (!usados.has(candidato)) return candidato;
    }
  }
  // Fuerza bruta: último carácter A–Z
  for (let c = 65; c <= 90; c++) {
    const candidato = (codigoBase.slice(0, -1) + String.fromCharCode(c)).substring(0, 8);
    if (!usados.has(candidato)) return candidato;
  }
  // Fuerza bruta: penúltimo + último carácter A–Z
  for (let i = codigoBase.length - 2; i >= 0; i--) {
    for (let c = 65; c <= 90; c++) {
      const arr = codigoBase.split("");
      arr[i] = String.fromCharCode(c);
      const candidato = arr.join("").substring(0, 8);
      if (!usados.has(candidato)) return candidato;
    }
  }
  // Fallback numérico (prácticamente imposible llegar aquí)
  for (let n = 0; n <= 9999; n++) {
    const sufijo = String(n).padStart(2, "0");
    const candidato = (codigoBase.slice(0, 6) + sufijo).substring(0, 8);
    if (!usados.has(candidato)) return candidato;
  }
  return codigoBase; // no debería ocurrir jamás
}

// ── GS1 Generator ─────────────────────────────────────────
const NO_ABREV = /^(\d+G|WIFI|NFC|USB|OTG|LTE|VOLTE|UHD|FHD|HD|IP\d+|MHZ|GHZ)$/i;
function esAbreviable(palabra) {
  if (NO_ABREV.test(palabra)) return false;
  if (/^\d+$/.test(palabra)) return false;
  if (/^\d+GB$/i.test(palabra)) return false;
  return true;
}
function generarGS1(texto) {
  let upper = texto.toUpperCase().trim();
  upper = upper.replace(/[^A-Z0-9\s]/g, "").replace(/\s+/g, " ").trim();
  let palabras = upper.split(/\s+/);
  // Quedarse solo con el GB mayor
  const gbPalabras = palabras.filter(p => /^\d+GB$/i.test(p));
  if (gbPalabras.length > 1) {
    const maxGB = gbPalabras.map(p => ({ p, n: parseInt(p) })).sort((a, b) => b.n - a.n)[0].p;
    let eliminadoMayor = false;
    palabras = palabras.filter(p => {
      if (!/^\d+GB$/i.test(p)) return true;
      if (p === maxGB && !eliminadoMayor) { eliminadoMayor = true; return true; }
      return false;
    });
  }
  // Abreviar última palabra
  const lastIdx = palabras.length - 1;
  if (esAbreviable(palabras[lastIdx]) && palabras[lastIdx].length > 3)
    palabras[lastIdx] = palabras[lastIdx].substring(0, 3);
  // Reducir de derecha a izquierda hasta 30 chars
  for (let i = palabras.length - 2; i >= 0; i--) {
    if (palabras.join(" ").length <= 30) break;
    if (esAbreviable(palabras[i]) && palabras[i].length > 3)
      palabras[i] = palabras[i].substring(0, 3);
  }
  return palabras.join(" ").substring(0, 30);
}

/**
 * Dado un GS1 base y un Set de GS1 ya usados,
 * devuelve un GS1 único añadiendo/incrementando un sufijo numérico al final.
 * Nunca supera los 30 caracteres.
 */
function resolverDuplicadoGS1(gs1Base, usados) {
  // Quitar sufijo numérico anterior si ya lo tenía (de una pasada previa)
  const sinSufijo = gs1Base.replace(/ \d+$/, "");
  for (let n = 2; n <= 999; n++) {
    const sufijo = ` ${n}`;
    const candidato = (sinSufijo.substring(0, 30 - sufijo.length) + sufijo);
    if (!usados.has(candidato)) return candidato;
  }
  return gs1Base;
}

// ── Núcleo: genera todos los códigos deduplicados en un solo paso ──
function resolverLote(titulos) {
  const usadosGEN = new Set();
  const usadosGS1 = new Set();

  return titulos.map(titulo => {
    // ── GEN ──
    let codigoGEN = generarBase(titulo);
    let ajustadoGEN = false;
    if (usadosGEN.has(codigoGEN)) {
      codigoGEN = resolverDuplicadoGEN(codigoGEN, titulo, usadosGEN);
      ajustadoGEN = true;
    }
    usadosGEN.add(codigoGEN);

    // ── GS1 ──
    let codigoGS1 = generarGS1(titulo);
    let ajustadoGS1 = false;
    if (usadosGS1.has(codigoGS1)) {
      codigoGS1 = resolverDuplicadoGS1(codigoGS1, usadosGS1);
      ajustadoGS1 = true;
    }
    usadosGS1.add(codigoGS1);

    return { titulo, codigoGEN, ajustadoGEN, codigoGS1, ajustadoGS1 };
  });
}

// ── UI ────────────────────────────────────────────────────
function generarTabla() {
  const titulos = getTitulos();
  if (titulos.length === 0) { ta.focus(); return; }

  const resultados = resolverLote(titulos);
  document.getElementById("resList").innerHTML = resultados.map((r, i) => `
    <div class="res-item">
      <span class="ri-idx">${i + 1}</span>
      <div class="ri-codes">
        <div class="ri-code-row">
          <span class="ri-badge b-gen">GEN</span>
          <span class="ri-modelo">${escapeHTML(r.codigoGEN)}${r.ajustadoGEN ? ' <span class="ri-adj">ajustado</span>' : ''}</span>
        </div>
        <div class="ri-code-row">
          <span class="ri-badge b-gs1">GS1</span>
          <span class="ri-modelo gs1">${escapeHTML(r.codigoGS1)}${r.ajustadoGS1 ? ' <span class="ri-adj">ajustado</span>' : ''}</span>
        </div>
      </div>
      <span class="ri-src" title="${escapeHTML(r.titulo)}">${escapeHTML(r.titulo)}</span>
    </div>
  `).join("");

  document.getElementById("resCount").textContent = titulos.length;
  document.getElementById("resultCard").style.display = "";
  document.getElementById("resultCard").scrollIntoView({ behavior: "smooth", block: "start" });
}

function copiarTabla(modo = "ambos") {
  const resultados = resolverLote(getTitulos());
  let tsv;
  if (modo === "gen")       tsv = resultados.map(r => r.codigoGEN).join("\n");
  else if (modo === "gs1")  tsv = resultados.map(r => r.codigoGS1).join("\n");
  else                      tsv = resultados.map(r => `${r.codigoGEN}\t${r.codigoGS1}`).join("\n");

  navigator.clipboard.writeText(tsv).then(mostrarBadge).catch(() => {
    const el = document.createElement("textarea");
    el.value = tsv;
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
    mostrarBadge();
  });
}

function mostrarBadge() {
  const badge = document.getElementById("copyBadge");
  badge.classList.add("show");
  setTimeout(() => badge.classList.remove("show"), 2200);
}