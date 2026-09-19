// ---------- State ----------
let selectedFile = null;          // File currently chosen but not yet scanned
let currentRoutes = null;         // Working copy of the last extraction, pre-save
const LIBRARY_KEY = "routelens_library_v1";
let library = loadLibrary();      // Array of { id, scannedAt, routes: [...] }

const LOADING_MESSAGES = [
  "Reading the board…",
  "Untangling Malayalam and English…",
  "Lining up stops in order…",
  "Cross-checking the times…",
  "Almost there…",
];

// ---------- Elements ----------
const fileInput = document.getElementById("fileInput");
const cameraBtn = document.getElementById("cameraBtn");
const uploadBtn = document.getElementById("uploadBtn");
const fileName = document.getElementById("fileName");
const scanBtn = document.getElementById("scanBtn");
const scanPreview = document.getElementById("scanPreview");
const scanStatus = document.getElementById("scanStatus");
const resultsSection = document.getElementById("results");
const routesContainer = document.getElementById("routesContainer");
const saveBtn = document.getElementById("saveBtn");
const exportGtfsBtn = document.getElementById("exportGtfs");
const exportCsvBtn = document.getElementById("exportCsv");
const exportJsonBtn = document.getElementById("exportJson");
const libraryCountEl = document.getElementById("libraryCount");
const stopListEl = document.getElementById("stopList");
const fromInput = document.getElementById("fromInput");
const toInput = document.getElementById("toInput");
const searchBtn = document.getElementById("searchBtn");
const searchResultsEl = document.getElementById("searchResults");

// ---------- Capture / upload ----------
cameraBtn.addEventListener("click", () => {
  fileInput.setAttribute("accept", "image/*");
  fileInput.setAttribute("capture", "environment");
  fileInput.click();
});

uploadBtn.addEventListener("click", () => {
  fileInput.removeAttribute("capture");
  fileInput.setAttribute("accept", "image/*,application/pdf");
  fileInput.click();
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
  selectedFile = file;
  fileName.textContent = file.name || "File selected";
  scanBtn.disabled = false;
  
  if (file.type === "application/pdf") {
    scanPreview.innerHTML = `
    <div class="scan-preview__pdf">
    <span class="scan-preview__pdf-icon">📄</span>
    <span>${escapeHtml(file.name || "Timetable.pdf")}</span>
    </div>`;
  } else {
    const reader = new FileReader();
    reader.onload = (e) => {
      scanPreview.innerHTML = `<img src="${e.target.result}" alt="Selected timetable" />`;
    };
    reader.readAsDataURL(file);
  }
});

// ---------- Scan ----------
scanBtn.addEventListener("click", scanImage);

async function scanImage() {
  if (!selectedFile) return;

  scanBtn.disabled = true;
  showStatus(LOADING_MESSAGES[0], false);
  let msgIndex = 0;
  const rotator = setInterval(() => {
    msgIndex = (msgIndex + 1) % LOADING_MESSAGES.length;
    showStatus(LOADING_MESSAGES[msgIndex], false);
  }, 1400);

  try {
    const { base64, mimeType } = await fileToBase64(selectedFile);
    const res = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: base64, mimeType }),
    });

    const data = await res.json();
    clearInterval(rotator);

    if (!res.ok) {
      showStatus(data.error || "Something went wrong reading that image.", true);
      scanBtn.disabled = false;
      return;
    }

    currentRoutes = data.routes || [];
    if (currentRoutes.length === 0) {
      showStatus("No routes were found in that image. Try a clearer or closer photo.", true);
      scanBtn.disabled = false;
      return;
    }

    hideStatus();
    renderRoutes(currentRoutes);
    resultsSection.hidden = false;
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    clearInterval(rotator);
    showStatus("Couldn't reach the extraction service. Check your connection and try again.", true);
  } finally {
    scanBtn.disabled = false;
  }
}

function showStatus(message, isError) {
  scanStatus.hidden = false;
  scanStatus.textContent = message;
  scanStatus.classList.toggle("is-error", !!isError);
}

function hideStatus() {
  scanStatus.hidden = true;
}

function fileToBase64(file) {
  const MAX_DIMENSION = 1600; // px, long edge
  const JPEG_QUALITY = 0.85;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const scale = MAX_DIMENSION / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
      const base64 = dataUrl.split(",")[1];
      resolve({ base64, mimeType: "image/jpeg" });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not load the selected image."));
    };

    img.src = objectUrl;
  });
}

// ---------- Render editable, confidence-coded table ----------
function renderRoutes(routes) {
  routesContainer.innerHTML = "";
  routes.forEach((route, routeIndex) => {
    routesContainer.appendChild(buildRouteCard(route, routeIndex, routes));
  });
}

function buildRouteCard(route, routeIndex, routes) {
  const card = document.createElement("div");
  card.className = "route-card";

  const titleBar = document.createElement("div");
  titleBar.className = "route-card__title";
  const titleInput = document.createElement("input");
  titleInput.value = route.route_name || "Untitled route";
  titleInput.addEventListener("input", () => { route.route_name = titleInput.value; });
  titleBar.appendChild(titleInput);
  card.appendChild(titleBar);

  const table = document.createElement("table");
  table.className = "route-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th></th>
        <th>Stop (English)</th>
        <th>Stop (Malayalam)</th>
        <th>Arrival</th>
        <th>Departure</th>
        <th></th>
      </tr>
    </thead>
  `;
  const tbody = document.createElement("tbody");
  route.stops.forEach((stop, stopIndex) => {
    tbody.appendChild(buildStopRow(stop, route, stopIndex));
  });
  table.appendChild(tbody);
  card.appendChild(table);

  const foot = document.createElement("div");
  foot.className = "route-card__foot";
  const addRowBtn = document.createElement("button");
  addRowBtn.type = "button";
  addRowBtn.className = "add-row-btn";
  addRowBtn.textContent = "+ Add stop";
  addRowBtn.addEventListener("click", () => {
    route.stops.push({ stop_name_en: "", stop_name_ml: "", arrival_time: "", departure_time: "", confidence: "medium" });
    renderRoutes(routes);
  });
  foot.appendChild(addRowBtn);
  card.appendChild(foot);

  return card;
}

function buildStopRow(stop, route, stopIndex) {
  const tr = document.createElement("tr");

  const dotTd = document.createElement("td");
  const dot = document.createElement("span");
  dot.className = `confidence-dot ${stop.confidence || "medium"}`;
  dot.title = `Confidence: ${stop.confidence || "medium"}`;
  dotTd.appendChild(dot);
  tr.appendChild(dotTd);

  tr.appendChild(makeCell(stop, "stop_name_en", "text"));
  tr.appendChild(makeCell(stop, "stop_name_ml", "text", "is-ml"));
  tr.appendChild(makeCell(stop, "arrival_time", "text", "is-time"));
  tr.appendChild(makeCell(stop, "departure_time", "text", "is-time"));

  const delTd = document.createElement("td");
  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "row-delete";
  delBtn.textContent = "✕";
  delBtn.title = "Remove this row";
  delBtn.addEventListener("click", () => {
    route.stops.splice(stopIndex, 1);
    renderRoutes(currentRoutes);
  });
  delTd.appendChild(delBtn);
  tr.appendChild(delTd);

  return tr;
}

function makeCell(stop, field, type, extraClass) {
  const td = document.createElement("td");
  const input = document.createElement("input");
  input.type = type;
  input.value = stop[field] || "";
  if (extraClass) input.classList.add(extraClass);
  input.addEventListener("input", () => {
    stop[field] = input.value;
    // Any manual correction is inherently trusted.
    stop.confidence = "high";
    const dot = input.closest("tr").querySelector(".confidence-dot");
    if (dot) { dot.className = "confidence-dot high"; dot.title = "Confidence: high (corrected by you)"; }
  });
  td.appendChild(input);
  return td;
}

// ---------- Save to library ----------
saveBtn.addEventListener("click", () => {
  if (!currentRoutes || currentRoutes.length === 0) return;
  library.push({
    id: `entry_${Date.now()}`,
    scannedAt: new Date().toISOString(),
    routes: JSON.parse(JSON.stringify(currentRoutes)),
  });
  persistLibrary();
  refreshLibraryUI();
  exportGtfsBtn.disabled = false;
  exportCsvBtn.disabled = false;
  exportJsonBtn.disabled = false;
  showStatus("Saved to your timetable library.", false);
});

function loadLibrary() {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function persistLibrary() {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
  } catch (e) {
    console.warn("Could not persist library to localStorage", e);
  }
}

function refreshLibraryUI() {
  libraryCountEl.textContent = String(countRoutes(library));
  const names = new Set();
  library.forEach((entry) =>
    entry.routes.forEach((route) =>
      route.stops.forEach((stop) => {
        if (stop.stop_name_en) names.add(stop.stop_name_en);
        if (stop.stop_name_ml) names.add(stop.stop_name_ml);
      })
    )
  );
  stopListEl.innerHTML = "";
  names.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    stopListEl.appendChild(opt);
  });
  if (library.length > 0) {
    exportGtfsBtn.disabled = false;
    exportCsvBtn.disabled = false;
    exportJsonBtn.disabled = false;
  }
}

function countRoutes(lib) {
  return lib.reduce((sum, entry) => sum + entry.routes.length, 0);
}

// ---------- Export: GTFS ----------
exportGtfsBtn.addEventListener("click", async () => {
  const files = buildGTFS(library);
  const zip = new JSZip();
  Object.entries(files).forEach(([name, content]) => zip.file(name, content));
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, "routelens-gtfs.zip");
});

function buildGTFS(lib) {
  const allRoutes = [];
  lib.forEach((entry) => entry.routes.forEach((r) => allRoutes.push(r)));

  let agency = "agency_id,agency_name,agency_url,agency_timezone\n";
  agency += `1,RouteLens Community Transit Data,https://example.com,Asia/Kolkata\n`;

  let routesTxt = "route_id,route_short_name,route_long_name,route_type\n";
  let tripsTxt = "route_id,service_id,trip_id\n";
  let stopsTxt = "stop_id,stop_name,stop_lat,stop_lon\n";
  let stopTimesTxt = "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n";
  let calendarTxt = "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n";
  calendarTxt += "WEEKDAY,1,1,1,1,1,1,1,20260101,20271231\n";

  allRoutes.forEach((route, ri) => {
    const routeId = `R${ri + 1}`;
    const tripId = `T${ri + 1}`;
    const shortName = (route.route_name || `Route ${ri + 1}`).slice(0, 12);
    routesTxt += `${routeId},${csvSafe(shortName)},${csvSafe(route.route_name || "")},3\n`;
    tripsTxt += `${routeId},WEEKDAY,${tripId}\n`;

    route.stops.forEach((stop, si) => {
      const stopId = `${routeId}_S${si + 1}`;
      const stopName = stop.stop_name_en || stop.stop_name_ml || `Stop ${si + 1}`;
      // Lat/lon are placeholders — this build doesn't geocode. Noted in README.
      stopsTxt += `${stopId},${csvSafe(stopName)},0.000000,0.000000\n`;
      const arr = stop.arrival_time || stop.departure_time || "";
      const dep = stop.departure_time || stop.arrival_time || "";
      stopTimesTxt += `${tripId},${arr},${dep},${stopId},${si + 1}\n`;
    });
  });

  return {
    "agency.txt": agency,
    "routes.txt": routesTxt,
    "trips.txt": tripsTxt,
    "stops.txt": stopsTxt,
    "stop_times.txt": stopTimesTxt,
    "calendar.txt": calendarTxt,
  };
}

function csvSafe(value) {
  if (value == null) return "";
  const str = String(value);
  return /[,"\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

// ---------- Export: CSV / JSON ----------
exportCsvBtn.addEventListener("click", () => {
  let csv = "route_name,stop_name_en,stop_name_ml,arrival_time,departure_time,confidence\n";
  library.forEach((entry) =>
    entry.routes.forEach((route) =>
      route.stops.forEach((stop) => {
        csv += [
          csvSafe(route.route_name),
          csvSafe(stop.stop_name_en),
          csvSafe(stop.stop_name_ml),
          csvSafe(stop.arrival_time),
          csvSafe(stop.departure_time),
          csvSafe(stop.confidence),
        ].join(",") + "\n";
      })
    )
  );
  downloadBlob(new Blob([csv], { type: "text/csv" }), "routelens-timetables.csv");
});

exportJsonBtn.addEventListener("click", () => {
  const json = JSON.stringify(library, null, 2);
  downloadBlob(new Blob([json], { type: "application/json" }), "routelens-timetables.json");
});

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------- Next bus search ----------
searchBtn.addEventListener("click", () => {
  const from = fromInput.value.trim().toLowerCase();
  const to = toInput.value.trim().toLowerCase();
  if (!from || !to) {
    renderSearchEmpty("Enter both a from and a to stop.");
    return;
  }

  const nowMinutes = minutesNow();
  const matches = [];

  library.forEach((entry) =>
    entry.routes.forEach((route) => {
      const stops = route.stops;
      const fromIdx = stops.findIndex((s) => matchesStop(s, from));
      const toIdx = stops.findIndex((s) => matchesStop(s, to));
      if (fromIdx === -1 || toIdx === -1 || fromIdx >= toIdx) return;

      const departure = stops[fromIdx].departure_time || stops[fromIdx].arrival_time || "";
      const arrival = stops[toIdx].arrival_time || stops[toIdx].departure_time || "";
      matches.push({
        routeName: route.route_name || "Unnamed route",
        departure,
        arrival,
        fromName: stops[fromIdx].stop_name_en || stops[fromIdx].stop_name_ml,
        toName: stops[toIdx].stop_name_en || stops[toIdx].stop_name_ml,
        minutesFromNow: departure ? timeToMinutes(departure) - nowMinutes : null,
      });
    })
  );

  matches.sort((a, b) => timeToMinutes(a.departure || "99:99") - timeToMinutes(b.departure || "99:99"));
  renderSearchResults(matches);
});

function matchesStop(stop, query) {
  const en = (stop.stop_name_en || "").toLowerCase();
  const ml = (stop.stop_name_ml || "").toLowerCase();
  return en.includes(query) || ml.includes(query);
}

function minutesNow() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function timeToMinutes(hhmm) {
  const parts = String(hhmm).split(":");
  if (parts.length !== 2) return 99 * 60 + 99;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return 99 * 60 + 99;
  return h * 60 + m;
}

function renderSearchResults(matches) {
  if (matches.length === 0) {
    renderSearchEmpty("No saved route connects those two stops yet. Scan more boards to grow the library.");
    return;
  }
  searchResultsEl.innerHTML = "";
  matches.forEach((m) => {
    const row = document.createElement("div");
    row.className = "search-result";
    const upcoming = m.minutesFromNow !== null && m.minutesFromNow >= 0;
    row.innerHTML = `
      <div>
        <div class="search-result__route">${escapeHtml(m.routeName)}</div>
        <div class="search-result__meta">${escapeHtml(m.fromName)} → ${escapeHtml(m.toName)}${upcoming ? " · upcoming" : ""}</div>
      </div>
      <div class="search-result__time">${m.departure || "—"}</div>
    `;
    searchResultsEl.appendChild(row);
  });
}

function renderSearchEmpty(message) {
  searchResultsEl.innerHTML = `<div class="search-empty">${escapeHtml(message)}</div>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

// ---------- Init ----------
refreshLibraryUI();
