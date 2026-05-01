document.body.classList.add("js-enabled");

const revealItems = document.querySelectorAll(".reveal");

if ("IntersectionObserver" in window && revealItems.length) {
  const onIntersect = (entries, obs) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        return;
      }

      entry.target.classList.add("in-view");
      obs.unobserve(entry.target);
    });
  };

  const observer = new IntersectionObserver(onIntersect, {
    threshold: 0,
    rootMargin: "0px",
  });

  revealItems.forEach((item) => observer.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("in-view"));
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function getApiBaseUrl() {
  const metaValue = document.querySelector('meta[name="api-base"]')?.content?.trim() || "";
  const globalValue = (window.API_BASE_URL || "").trim();
  const configured = globalValue || metaValue;
  return configured.replace(/\/+$/, "");
}

const API_BASE_URL = getApiBaseUrl();

function apiUrl(path) {
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

function setStatusText(element, message, state) {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.classList.remove("success", "error");

  if (state) {
    element.classList.add(state);
  }
}

function getFriendlyErrorMessage(error, fallbackMessage) {
  const raw = String(error && error.message ? error.message : "").trim();
  if (/failed to fetch|networkerror/i.test(raw)) {
    return "Cannot reach backend API. Set the page api-base meta tag to your Render URL and verify CORS/env vars.";
  }
  return raw || fallbackMessage;
}

async function parseApiResponse(response) {
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  const raw = await response.text();
  let data = null;

  if (contentType.includes("application/json")) {
    try {
      data = JSON.parse(raw);
    } catch (_) {
      data = null;
    }
  } else {
    try {
      data = JSON.parse(raw);
    } catch (_) {
      data = null;
    }
  }

  if (!response.ok) {
    const apiError = data && typeof data.error === "string" ? data.error : "";
    if (apiError) {
      throw new Error(apiError);
    }

    if (raw.trim().startsWith("<")) {
      throw new Error(
        "API returned HTML instead of JSON. Set the page api-base meta tag (or API_BASE_URL) to your Render backend URL."
      );
    }

    throw new Error(raw || `Request failed (${response.status}).`);
  }

  if (!data) {
    if (raw.trim().startsWith("<")) {
      throw new Error(
        "API returned HTML instead of JSON. Set the page api-base meta tag (or API_BASE_URL) to your Render backend URL."
      );
    }
    throw new Error("API did not return valid JSON.");
  }

  return data;
}

async function loadPnlTable() {
  const tableBody = document.querySelector("#pnl-table-body");
  const statusText = document.querySelector("#pnl-status");

  if (!tableBody) {
    return;
  }

  try {
    const response = await fetch(apiUrl("/api/pnl"));
    const payload = await parseApiResponse(response);
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    tableBody.innerHTML = "";

    rows.forEach((row) => {
      const tr = document.createElement("tr");
      const dailyValue = Number(row.daily_pl);
      const dailyText = `${dailyValue >= 0 ? "+" : "-"}${currencyFormatter.format(Math.abs(dailyValue))}`;

      tr.innerHTML = `
        <td>${row.date}</td>
        <td>${currencyFormatter.format(Number(row.polymarket))}</td>
        <td>${currencyFormatter.format(Number(row.kalshi))}</td>
        <td>${dailyText}</td>
        <td>${currencyFormatter.format(Number(row.total_equity))}</td>
      `;

      tableBody.appendChild(tr);
    });

    setStatusText(statusText, `Loaded ${rows.length} rows.`, "success");
  } catch (error) {
    setStatusText(statusText, getFriendlyErrorMessage(error, "Unable to load performance data."), "error");
  }
}

async function loadPnlChart() {
  const chartCanvas = document.querySelector("#pnl-chart");
  const statusText = document.querySelector("#pnl-status");
  const rangeButtons = document.querySelectorAll(".chart-btn[data-range]");

  if (!chartCanvas) {
    return;
  }

  if (typeof Chart === "undefined") {
    setStatusText(statusText, "Chart library failed to load.", "error");
    return;
  }

  try {
    const response = await fetch(apiUrl("/api/pnl"));
    const payload = await parseApiResponse(response);
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    if (!rows.length) {
      throw new Error("No performance rows found.");
    }

    const labels = rows.map((row) => row.date);
    const equityValues = rows.map((row) => Number(row.total_equity));
    const ctx = chartCanvas.getContext("2d");
    let chart;

    function subsetData(range) {
      if (range === "all") {
        return {
          labels,
          values: equityValues,
        };
      }

      const count = Number(range);
      if (!Number.isFinite(count) || count <= 0) {
        return {
          labels,
          values: equityValues,
        };
      }

      return {
        labels: labels.slice(-count),
        values: equityValues.slice(-count),
      };
    }

    function renderChart(range) {
      const dataSlice = subsetData(range);
      if (chart) {
        chart.destroy();
      }

      chart = new Chart(ctx, {
        type: "line",
        data: {
          labels: dataSlice.labels,
          datasets: [
            {
              label: "Total Equity",
              data: dataSlice.values,
              borderColor: "#39DDBE",
              backgroundColor: "rgba(57, 221, 190, 0.18)",
              pointRadius: 2.2,
              pointHoverRadius: 4.6,
              fill: true,
              tension: 0.24,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: "index",
            intersect: false,
          },
          plugins: {
            legend: {
              display: false,
            },
            tooltip: {
              callbacks: {
                label(context) {
                  return `Total Equity: ${currencyFormatter.format(context.parsed.y)}`;
                },
              },
            },
          },
          scales: {
            x: {
              ticks: {
                color: "#B9CAE0",
                maxRotation: 0,
                autoSkip: true,
              },
              grid: {
                color: "rgba(29, 58, 82, 0.38)",
              },
            },
            y: {
              ticks: {
                color: "#B9CAE0",
                callback(value) {
                  return currencyFormatter.format(Number(value));
                },
              },
              grid: {
                color: "rgba(29, 58, 82, 0.38)",
              },
            },
          },
        },
      });
    }

    rangeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        rangeButtons.forEach((btn) => btn.classList.remove("active"));
        button.classList.add("active");
        renderChart(button.dataset.range || "all");
      });
    });

    renderChart("all");
    setStatusText(statusText, `Loaded ${rows.length} rows into chart.`, "success");
  } catch (error) {
    setStatusText(statusText, getFriendlyErrorMessage(error, "Unable to load chart data."), "error");
  }
}

async function submitContactForm(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const statusText = document.querySelector("#contact-status");
  const submitButton = form.querySelector("button[type='submit']");

  const payload = {
    name: form.name.value.trim(),
    email: form.email.value.trim(),
    subject: form.subject.value.trim(),
    message: form.message.value.trim(),
  };

  setStatusText(statusText, "Sending message...", null);
  submitButton.disabled = true;

  try {
    const response = await fetch(apiUrl("/api/contact"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    await parseApiResponse(response);

    form.reset();
    setStatusText(statusText, "Message sent successfully.", "success");
  } catch (error) {
    setStatusText(statusText, getFriendlyErrorMessage(error, "Unable to send message."), "error");
  } finally {
    submitButton.disabled = false;
  }
}

function wireContactForm() {
  const form = document.querySelector(".contact-form");
  if (!form) {
    return;
  }

  form.addEventListener("submit", submitContactForm);
}

loadPnlTable();
loadPnlChart();
wireContactForm();
